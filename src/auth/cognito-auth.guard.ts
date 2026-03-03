// src/auth/cognito-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SupabaseService } from '../supabase/supabase.service';

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
  private readonly jwksUrl: string;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const region = this.configService.get<string>('COGNITO_REGION') || 'eu-central-1';
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID') || '';

    if (!userPoolId) {
      this.logger.error('[Init] COGNITO_USER_POOL_ID not set — guard will reject all requests');
    }

    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    this.jwksUrl = `${this.issuer}/.well-known/jwks.json`;

    // Логируем инициализацию (чтобы сразу видеть мисконфигурацию)
    this.logger.log(`[Init] issuer=${this.issuer}`);
    this.logger.log(`[Init] JWKS URL=${this.jwksUrl}`);
    this.logger.log(`[Init] expected client_id=${this.clientId}`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      this.logger.warn('Token extraction failed: No Authorization header or wrong format');
      throw new UnauthorizedException('No token provided');
    }

    this.logger.debug('Token extracted from Authorization header');

    try {
      const JWKS = createRemoteJWKSet(new URL(this.jwksUrl));

      // ВАЖНО: Убрали параметр 'audience', так как Cognito Access Token
      // не содержит 'aud' — он использует кастомный claim 'client_id'.
      const { payload } = await jwtVerify(token, JWKS, {
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

      const cognitoSub = payload.sub as string;
      const email = (payload.email as string) || '';
      this.logger.debug(
        `JWT verified successfully. sub=${cognitoSub}, client_id=${payload.client_id}`,
      );

      // Синхронизация с таблицей users через admin-клиент (service_role)
      const userId = await this.ensureUserExists(cognitoSub, email);

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
   */
  private async ensureUserExists(
    cognitoSub: string,
    email: string,
  ): Promise<string> {
    const adminSupabase = this.supabaseService.getAdminClient();

    // 1. Ищем по cognito_sub (уникальный ключ)
    const { data: existingUser, error: findError } = await adminSupabase
      .from('users')
      .select('user_id')
      .eq('cognito_sub', cognitoSub)
      .single();

    if (existingUser) {
      this.logger.debug(`User found in DB: userId=${existingUser.user_id}`);
      return existingUser.user_id;
    }

    // PGRST116 = No rows found — это нормально, значит нужно создать
    if (findError && findError.code !== 'PGRST116') {
      this.logger.error(`Error finding user in DB: ${findError.message}`);
      throw new UnauthorizedException('Database error during user sync');
    }

    // 2. Пользователь не найден → создаем нового
    this.logger.log(`Creating new user in DB for cognito_sub=${cognitoSub}`);
    const { data: newUser, error: createError } = await adminSupabase
      .from('users')
      .insert({
        cognito_sub: cognitoSub,
        email: email || undefined,
        username: email ? email.split('@')[0] : cognitoSub.slice(0, 8),
        created_at: new Date().toISOString(),
      })
      .select('user_id')
      .single();

    if (createError || !newUser) {
      this.logger.error(`Error creating user in DB: ${createError?.message}`);
      throw new UnauthorizedException('Failed to sync user to database');
    }

    // 3. Создаем дефолтные user_settings (чтобы getProfile не падал с PGRST116)
    const { error: settingsError } = await adminSupabase
      .from('user_settings')
      .insert({ user_id: newUser.user_id });

    if (settingsError) {
      this.logger.warn(`Failed to create user_settings: ${settingsError.message}`);
      // Не фатально — getProfile обработает fallback
    }

    this.logger.debug(`User created in DB: userId=${newUser.user_id}`);
    return newUser.user_id;
  }
}
