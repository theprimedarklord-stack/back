import { Injectable, CanActivate, ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify, importSPKI, errors, KeyLike } from 'jose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class M2MAuthGuard implements CanActivate {
  private publicKey: KeyLike | null = null; // Синглтон-кэш ключа

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Проверяем, помечен ли роут как @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-service-token'];

    if (!token) throw new ForbiddenException('M2M token missing');

    try {
      const issuer = process.env.M2M_ISSUER;
      const audience = process.env.M2M_AUDIENCE;

      if (!issuer || !audience) {
        throw new ServiceUnavailableException('M2M config missing: M2M_ISSUER or M2M_AUDIENCE');
      }

      const key = await this.getPublicKey();
      const { payload } = await jwtVerify(token, key, { issuer, audience });

      // 2. Валидация роли
      if (payload.role !== 'service') {
        throw new ForbiddenException('Invalid service role');
      }

      return true;
    } catch (err) {
      // 3. Строгая типизация ошибок (v2.5.1 fix)
      if (err instanceof ForbiddenException) throw err; 
      if (err instanceof errors.JWTExpired) throw new ForbiddenException('Token expired');
      if (err instanceof errors.JWSSignatureVerificationFailed) throw new ForbiddenException('Invalid signature');
      if (err instanceof errors.JWTClaimValidationFailed) throw new ForbiddenException('Invalid claims');
      
      console.error('[M2M Guard] Infrastructure error:', err);
      throw new ServiceUnavailableException('Auth service error');
    }
  }

  private async getPublicKey(): Promise<KeyLike> {
    if (this.publicKey) return this.publicKey;
    const pem = process.env.M2M_PUBLIC_KEY;
    if (!pem) throw new ServiceUnavailableException('M2M config missing');
    
    const formattedPem = pem.replace(/\\n/g, '\n');
    this.publicKey = await importSPKI(formattedPem, 'RS256');
    return this.publicKey;
  }
}
