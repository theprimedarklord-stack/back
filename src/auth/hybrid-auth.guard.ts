// src/auth/hybrid-auth.guard.ts
/**
 * HybridAuthGuard - працює з обома: Cognito JWT та legacy Supabase JWT
 * 
 * Використовуй цей guard поки мігруєш на Cognito.
 * Він спробує спочатку Cognito (якщо налаштовано), потім fallback на legacy JWT.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import * as jose from 'jose';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class HybridAuthGuard implements CanActivate {
  private jwks: jose.JWTVerifyGetKey | null = null;
  private cognitoConfigured: boolean;
  private issuer: string;
  private audience: string;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const region = this.configService.get<string>('COGNITO_REGION');
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    const clientId = this.configService.get<string>('COGNITO_CLIENT_ID');

    this.cognitoConfigured = !!(region && userPoolId && clientId);
    
    if (this.cognitoConfigured) {
      this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
      this.audience = clientId!;
      console.log('HybridAuthGuard: Cognito configured, will try Cognito first');
    } else {
      this.issuer = '';
      this.audience = '';
      console.log('HybridAuthGuard: Cognito not configured, using legacy JWT only');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Authorization required');
    }

    // Try Cognito first if configured
    if (this.cognitoConfigured) {
      try {
        return await this.verifyCognitoToken(request, token);
      } catch (err) {
        console.log('Cognito verification failed, trying legacy JWT...');
      }
    }

    // Fallback to legacy JWT
    return this.verifyLegacyToken(request, token);
  }

  private async verifyCognitoToken(request: Request, token: string): Promise<boolean> {
    if (!this.jwks) {
      this.jwks = jose.createRemoteJWKSet(
        new URL(`${this.issuer}/.well-known/jwks.json`),
      );
    }

    const { payload } = await jose.jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience || undefined,
    });

    const sub = payload.sub as string;
    const email = (payload.email as string) || '';
    const userId = await this.ensureUserExists(sub, email);

    request.user = {
      id: userId,
      userId,
      sub,
      email,
      claims: payload as Record<string, unknown>,
    };

    return true;
  }

  private verifyLegacyToken(request: Request, token: string): boolean {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        email: string;
        role?: string;
      };

      request.user = {
        id: payload.id,
        userId: payload.id,
        email: payload.email,
        role: payload.role,
      };

      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromRequest(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return req.cookies?.access_token || null;
  }

  private async ensureUserExists(cognitoSub: string, email: string): Promise<string> {
    const admin = this.supabaseService.getAdminClient();

    const { data: existingUser } = await admin
      .from('users')
      .select('user_id, cognito_sub')
      .or(`cognito_sub.eq.${cognitoSub},email.eq.${email}`)
      .single();

    if (existingUser) {
      if (!existingUser.cognito_sub) {
        await admin
          .from('users')
          .update({ cognito_sub: cognitoSub })
          .eq('user_id', existingUser.user_id);
      }
      return existingUser.user_id;
    }

    const { data: newUser, error } = await admin
      .from('users')
      .insert({
        email,
        cognito_sub: cognitoSub,
        username: email.split('@')[0],
        created_at: new Date().toISOString(),
      })
      .select('user_id')
      .single();

    if (error) {
      throw new UnauthorizedException('Failed to initialize user');
    }

    return newUser.user_id;
  }
}
