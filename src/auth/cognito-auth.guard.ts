// src/auth/cognito-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { LRUCache } from 'lru-cache';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

export interface CognitoUserPayload {
  userId: string;      // Mapped from users table (uuid)
  sub: string;         // Cognito sub (original)
  id: string;          // Alias for userId (legacy compat)
  email: string;
  claims: Record<string, unknown>;
}

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  private readonly logger = new Logger(CognitoAuthGuard.name);
  private readonly JWKS: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly clientId: string;

  // Иммутабельный маппинг cognito_sub → user_id.
  // Не session state, а performance cache — связь sub→userId вечная.
  // Каждый инстанс NestJS строит свой кэш независимо (данные иммутабельны).
  //
  // TODO [SCALING]: При переходе на несколько инстансов NestJS —
  // заменить LRU на Redis-backed cache (ioredis + тот же TTL 5 мин).
  // Сейчас каждый инстанс строит свой LRU — при одном инстансе это ОК,
  // при N инстансах первые запросы каждого идут в БД (не катастрофа, но неэффективно).
  // Redis на бэкенд-слое решит это без изменения архитектуры.
  private readonly userCache = new LRUCache<string, string>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 минут
    updateAgeOnGet: false,
  });

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private reflector: Reflector,
  ) {
    const region = this.configService.get<string>('COGNITO_REGION') || 'eu-central-1';
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID') || '';

    if (!userPoolId) {
      this.logger.error('[Init] COGNITO_USER_POOL_ID not set — guard will reject all requests');
    }

    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    const jwksUrl = `${this.issuer}/.well-known/jwks.json`;

    // JWKS создаётся один раз — jose кэширует и ротирует ключи автоматически
    this.JWKS = createRemoteJWKSet(new URL(jwksUrl));

    // Логируем инициализацию (чтобы сразу видеть мисконфигурацию)
    this.logger.log(`[Init] issuer=${this.issuer}`);
    this.logger.log(`[Init] JWKS URL=${jwksUrl}`);
    this.logger.log(`[Init] expected client_id=${this.clientId}`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Пропускаем маршруты, помеченные @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      this.logger.warn('Token extraction failed: No Authorization header or wrong format');
      throw new UnauthorizedException('No token provided');
    }

    this.logger.debug('Token extracted from Authorization header');

    try {
      // ВАЖНО: Убрали параметр 'audience', так как Cognito Access Token
      // не содержит 'aud' — он использует кастомный claim 'client_id'.
      const { payload } = await jwtVerify(token, this.JWKS, {
        issuer: this.issuer,
        algorithms: ['RS256'],
      });

      // Ручная валидация client_id (Cognito Access Token specific)
      if (payload.client_id !== this.clientId) {
        this.logger.error(
          `Token client_id mismatch. Expected=${this.clientId}, got=${payload.client_id}`,
        );
        throw new UnauthorizedException('Invalid client_id');
      }

      // Проверяем тип токена — принимаем только access
      if (payload.token_use !== 'access') {
        this.logger.error(
          `Invalid token_use. Expected 'access', got '${payload.token_use}'`,
        );
        throw new UnauthorizedException('Only access tokens are allowed');
      }

      // Null-check на sub — без него дальше работать нельзя
      if (!payload.sub) {
        this.logger.error('Token missing required claim: sub');
        throw new UnauthorizedException('Token missing sub claim');
      }

      const cognitoSub = payload.sub;
      const email = (payload.email as string) || '';
      this.logger.debug(
        `JWT verified successfully. sub=${cognitoSub}, client_id=${payload.client_id}`,
      );

      // LRU cache hot-path — 99.9% запросов не идут в БД
      let userId = this.userCache.get(cognitoSub);
      if (!userId) {
        this.logger.debug(`Cache MISS — sub: ${cognitoSub}`);
        userId = await this.ensureUserExists(cognitoSub, email);
        this.userCache.set(cognitoSub, userId);
        this.logger.debug(
          `Cache SAVED — key: ${cognitoSub} -> value: ${userId} | Cache size: ${this.userCache.size}`,
        );
      } else {
        this.logger.debug(`Cache HIT — sub: ${cognitoSub}`);
      }

      // Мутируем request — ставим userId и id для совместимости с
      // context.guard, project.guard, rls-context.interceptor
      request['user'] = {
        id: userId,          // Legacy field (rls-context.interceptor fallback)
        userId,              // Used by context.guard & project.guard
        sub: cognitoSub,     // Cognito sub
        email,
        claims: payload as Record<string, unknown>,
      };

      return true;
    } catch (err) {
      // Подробное логирование специфичной ошибки jose
      // (JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed, etc.)
      this.logger.error(`JWT error: ${err.name} - ${err.message}`);
      if (err instanceof UnauthorizedException) {
        throw err; // Re-throw наши собственные UnauthorizedException
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Строгое извлечение токена только из заголовка Authorization: Bearer <token>.
   * Никакого fallback на куки — бэкенд ничего не знает про куки (BFF-архитектура).
   */
  private extractTokenFromRequest(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  /**
   * Гарантируем, что пользователь существует в таблице users.
   * Это критически важно для работы RLS-политик Supabase.
   * Использует admin-клиент (serviceRoleKey), который обходит RLS.
   *
   * Atomic UPSERT — исключает race condition при конкурентных
   * первых запросах от нового пользователя.
   */
  private async ensureUserExists(
    cognitoSub: string,
    email: string,
  ): Promise<string> {
    const adminSupabase = this.supabaseService.getAdminClient();

    // Atomic UPSERT — ON CONFLICT (cognito_sub) DO UPDATE
    // Гарантирует: один INSERT при первом логине, никаких race conditions.
    // Email обновляется при каждом cache-miss (синхронизация с Cognito).
    const { data, error } = await adminSupabase
      .from('users')
      .upsert(
        {
          cognito_sub: cognitoSub,
          email: email || undefined,
          username: email ? email.split('@')[0] : cognitoSub.slice(0, 8),
        },
        { onConflict: 'cognito_sub' },
      )
      .select('user_id')
      .single();

    if (error || !data) {
      this.logger.error(`User sync failed: ${error?.message}`);
      throw new UnauthorizedException('User sync failed');
    }

    // Idempotent: гарантируем что default user_settings существует.
    // ON CONFLICT DO NOTHING — если настройки уже есть, ничего не трогаем.
    const { error: settingsErr } = await adminSupabase
      .from('user_settings')
      .upsert(
        { user_id: data.user_id as string },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );

    if (settingsErr) {
      this.logger.warn(`Failed to ensure user_settings: ${settingsErr.message}`);
      // Не фатально — getProfile обработает fallback
    }

    this.logger.debug(`User synced: userId=${data.user_id}`);
    return data.user_id as string;
  }
}
