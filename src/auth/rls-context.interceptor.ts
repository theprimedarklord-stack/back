import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, lastValueFrom } from 'rxjs';
import { DatabaseService } from '../db/database.service';
import { REQUIRE_ORG_KEY } from '../common/decorators/require-org.decorator';

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsContextInterceptor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) { }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const path = req.path;

    // Skip RLS logic and logging for public/health paths
    const isPublicPath =
      path === '/' ||
      path.startsWith('/health') ||
      path.startsWith('/api/health') ||
      path.startsWith('/api/v1/telemetry') ||
      path.startsWith('/auth/') ||
      path.startsWith('/me/') ||
      req.method === 'OPTIONS';

    if (isPublicPath) {
      return next.handle();
    }

    const userId = req.user?.userId || req.user?.id;
    // Читаем ID организации из заголовка (который должен присылать BFF/фронтенд)
    const orgId = req.headers['x-org-id'];

    this.logger.debug(`RLS Context: userId=${userId}, orgId=${orgId}`);

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

    if (isOrgRequired && !orgId) {
      this.logger.warn(`No x-org-id header found. Workspace isolation requires it.`);
      throw new BadRequestException('Organization ID is required in headers (x-org-id)');
    }

    // Если orgId не требуется и не передан — устанавливаем контекст только с userId
    if (!orgId) {
      return new Observable((subscriber) => {
        this.db.withUserContext(userId, async (client) => {
          req.dbClient = client;
          try {
            const result = await lastValueFrom(next.handle());
            subscriber.next(result);
            subscriber.complete();
          } catch (err) {
            subscriber.error(err);
            throw err;
          }
        }).catch((err) => {
          subscriber.error(err);
        });
      });
    }

    // 🔒 БЕЗОПАСНОСТЬ B2B: Проверяем, что юзер реально состоит в этой организации
    // (Используем прямой SQL запрос, так как мы доверяем только базе данных)
    const isMemberValid = await this.db.withUserContext(userId, async (client) => {
      const res = await client.query(
        `SELECT 1 FROM public.org_organization_members WHERE organization_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
        [orgId, userId]
      );
      return res.rows.length > 0;
    });

    if (!isMemberValid) {
      this.logger.error(`User ${userId} attempted to access organization ${orgId} without permissions`);
      throw new ForbiddenException('You do not have access to this organization');
    }

    // Wrap request handling in a transaction with app.user_id AND app.org_id set locally
    return new Observable((subscriber) => {
      this.db.withUserContext(userId, orgId, async (client) => {
        req.dbClient = client;
        try {
          const result = await lastValueFrom(next.handle());
          subscriber.next(result);
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
          throw err;
        }
      }).catch((err) => {
        subscriber.error(err);
      });
    });
  }
}
