// src/auth/cognito-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jose from 'jose';
import { SupabaseService } from '../supabase/supabase.service';

export interface CognitoUserPayload {
  userId: string;      // Mapped from users table (uuid)
  sub: string;         // Cognito sub (original)
  email: string;
  claims: Record<string, unknown>;
}

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  private jwks: jose.JWTVerifyGetKey | null = null;
  private issuer: string;
  private audience: string;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const region = this.configService.get<string>('COGNITO_REGION') || 'eu-central-1';
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    
    if (!userPoolId) {
      console.warn('COGNITO_USER_POOL_ID not set - CognitoAuthGuard will reject all requests');
    }

    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    this.audience = this.configService.get<string>('COGNITO_CLIENT_ID') || '';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Authorization required');
    }

    try {
      // Initialize JWKS lazily (with caching)
      if (!this.jwks) {
        this.jwks = jose.createRemoteJWKSet(
          new URL(`${this.issuer}/.well-known/jwks.json`),
        );
      }

      // Verify JWT with Cognito JWKS
      const { payload } = await jose.jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience || undefined,
      });

      // Extract claims
      const sub = payload.sub as string;
      const email = (payload.email as string) || '';

      // Map Cognito sub to internal user_id (upsert if new user)
      const userId = await this.ensureUserExists(sub, email);

      // Set unified user payload on request (compatible with both legacy and new code)
      request.user = {
        id: userId,        // Legacy field
        userId,            // New field
        sub,               // Cognito sub
        email,
        claims: payload as Record<string, unknown>,
      };
      return true;
    } catch (err) {
      console.error('Cognito JWT validation failed:', err);
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromRequest(req: Request): string | null {
    // Priority: Authorization header > Cookie
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return req.cookies?.access_token || null;
  }

  /**
   * Ensure user exists in local users table, create if not.
   * Maps Cognito sub → users.user_id
   */
  private async ensureUserExists(cognitoSub: string, email: string): Promise<string> {
    const admin = this.supabaseService.getAdminClient();

    // First, try to find existing user by cognito_sub or email
    const { data: existingUser } = await admin
      .from('users')
      .select('user_id, cognito_sub')
      .or(`cognito_sub.eq.${cognitoSub},email.eq.${email}`)
      .single();

    if (existingUser) {
      // Update cognito_sub if not set
      if (!existingUser.cognito_sub) {
        await admin
          .from('users')
          .update({ cognito_sub: cognitoSub })
          .eq('user_id', existingUser.user_id);
      }
      return existingUser.user_id;
    }

    // Create new user
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
      console.error('Failed to create user:', error);
      throw new UnauthorizedException('Failed to initialize user');
    }

    return newUser.user_id;
  }
}
