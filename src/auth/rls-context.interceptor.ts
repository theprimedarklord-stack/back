import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, lastValueFrom } from 'rxjs';
import { LRUCache } from 'lru-cache';
import { DatabaseService } from '../db/database.service';
import { REQUIRE_ORG_KEY } from '../common/decorators/require-org.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { READ_ONLY_KEY } from '../common/decorators/read-only.decorator';

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsContextInterceptor.name);

  /**
   * Членство в организации — короткий кэш.
   *
   * Проверка стоила отдельной транзакции: соединение, `BEGIN`, `set_config`,
   * `SELECT 1`, `COMMIT` — четыре круга до базы ради ответа, который меняется
   * раз в месяц. При задержке 155 мс это ~620 мс на каждом запросе.
   *
   * Кэшируется только положительный ответ и только на полминуты. Отказ не
   * кэшируется никогда: свежевыданный доступ должен работать сразу.
   *
   * Что это стоит: исключённый из организации сохранит доступ до полуминуты.
   * Граница риска узкая — все запросы сервисов и без того фильтруют по
   * `user_id = <его собственный>`, поэтому увидеть он сможет только то, что
   * принадлежит ему самому, и только в этой организации.
   */
  private readonly memberships = new LRUCache<string, true>({
    max: 5000,
    ttl: 30_000,
  });

  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) { }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const path = req.path;

    // Skip RLS logic for routes decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    // Skip RLS logic and logging for public/health paths
    const isPublicPath =
      path === '/' ||
      path.startsWith('/health') ||
      path.startsWith('/api/health') ||
      path.startsWith('/api/v1/telemetry') ||
      path.startsWith('/auth/') ||
      path.startsWith('/me/') ||
      path.startsWith('/architecture/') || path === '/architecture' ||
      req.method === 'OPTIONS';

    if (isPublicPath) {
      return next.handle();
    }

    const userId = req.user?.userId || req.user?.id || req.user?.sub || req.headers['x-user-id'];
    // Читаем ID организации из заголовка (который должен присылать BFF/фронтенд)
    const orgId = req.headers['x-org-id'];

    if (!userId) {
      this.logger.warn(`No userId found for ${req.method} ${path}, skipping RLS context`);
      return next.handle();
    }

    // Проверяем метадату @RequireOrg — если явно false, пропускаем проверку orgId
    const requireOrg = this.reflector.getAllAndOverride<boolean>(REQUIRE_ORG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isOrgRequired = requireOrg !== false;

    const isReadOnly = this.reflector.getAllAndOverride<boolean>(READ_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) === true;

    if (isOrgRequired && !orgId) {
      this.logger.warn(`No x-org-id header found. Workspace isolation requires it.`);
      throw new BadRequestException('Organization ID is required in headers (x-org-id)');
    }

    // Если orgId не требуется и не передан — устанавливаем контекст только с userId
    if (!orgId) {
      return new Observable((subscriber) => {
        this.db.withUserContext(
          userId,
          async (client) => {
          req.dbClient = client;
          try {
            const result = await lastValueFrom(next.handle());
            subscriber.next(result);
            subscriber.complete();
          } catch (err) {
            subscriber.error(err);
            throw err;
          }
          },
          { readOnly: isReadOnly, label: `${req.method} ${path}` },
        ).catch((err) => {
          subscriber.error(err);
        });
      });
    }

    const membershipKey = `${userId}:${orgId}`;
    const membershipKnown = this.memberships.get(membershipKey) === true;

    // Wrap request handling in a transaction with app.user_id AND app.org_id set locally
    return new Observable((subscriber) => {
      this.db.withUserContext(
        userId,
        orgId,
        async (client) => {
        // 🔒 БЕЗОПАСНОСТЬ B2B: юзер обязан состоять в этой организации.
        // Проверка идёт первым запросом уже открытой транзакции, а не в своей
        // собственной: та стоила четырёх лишних кругов до базы.
        if (!membershipKnown) {
          const res = await client.query(
            `SELECT 1 FROM public.org_organization_members WHERE organization_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
            [orgId, userId],
          );

          if (res.rows.length === 0) {
            this.memberships.delete(membershipKey);
            this.logger.error(
              `User ${userId} attempted to access organization ${orgId} without permissions`,
            );
            throw new ForbiddenException('You do not have access to this organization');
          }

          this.memberships.set(membershipKey, true);
        }

        req.dbClient = client;
        try {
          const result = await lastValueFrom(next.handle());
          subscriber.next(result);
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
          throw err;
        }
        },
        { readOnly: isReadOnly, label: `${req.method} ${path}` },
      ).catch((err) => {
        subscriber.error(err);
      });
    });
  }
}
