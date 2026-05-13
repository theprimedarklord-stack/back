import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import type { Json } from '../types/supabase';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

const FEEDBACK_STATUSES = new Set(['new', 'seen', 'done']);

@Injectable()
export class FeedbackService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {
    const region = this.configService.get<string>('COGNITO_REGION') || 'eu-central-1';
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID') || '';

    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID is required for FeedbackService');
    }

    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    const jwksUrl = `${this.issuer}/.well-known/jwks.json`;
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  /**
   * Optional Cognito access token verification for public POST /feedback
   * (CognitoAuthGuard is skipped on @Public routes).
   */
  async resolveUserIdFromOptionalBearer(req: Request): Promise<string | null> {
    const raw = req.headers.authorization;
    const [type, token] = raw?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) return null;

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        algorithms: ['RS256'],
      });

      if (payload.client_id !== this.clientId) {
        return null;
      }
      if (payload.token_use !== 'access' || !payload.sub) {
        return null;
      }

      const cognitoSub = payload.sub as string;
      const admin = this.supabaseService.getAdminClient();
      const { data, error } = await admin
        .from('users')
        .select('user_id')
        .eq('cognito_sub', cognitoSub)
        .maybeSingle();

      if (error || !data) return null;
      return data.user_id as string;
    } catch {
      return null;
    }
  }

  async createFeedback(dto: CreateFeedbackDto, userId: string | null) {
    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin.from('user_feedbacks').insert({
      user_id: userId,
      type: dto.type,
      message: dto.message,
      contact: dto.contact ?? null,
      url: dto.url ?? null,
      metadata: (dto.metadata ?? {}) as Json,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private isSuperAdminFromClaims(user: AuthenticatedUser): boolean {
    const groups = user.claims?.['cognito:groups'];
    if (!Array.isArray(groups)) return false;
    return groups.includes('SuperAdmins');
  }

  async assertCanModerateFeedbacks(user: AuthenticatedUser): Promise<void> {
    const appUserId = user.userId || user.id;
    if (!appUserId) {
      throw new UnauthorizedException('User context missing');
    }

    if (this.isSuperAdminFromClaims(user)) {
      return;
    }

    const { data: userData, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('role')
      .eq('user_id', appUserId)
      .single();

    if (error || userData?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }

  async listFeedbacks(status?: string) {
    const admin = this.supabaseService.getAdminClient();
    let q = admin
      .from('user_feedbacks')
      .select(
        'id, user_id, type, message, contact, url, status, metadata, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (status && FEEDBACK_STATUSES.has(status)) {
      q = q.eq('status', status);
    }

    const { data, error } = await q;

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async updateStatus(id: string, status: 'new' | 'seen' | 'done') {
    const numericId = parseInt(id, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      throw new BadRequestException('Invalid feedback id');
    }

    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin
      .from('user_feedbacks')
      .update({ status })
      .eq('id', numericId);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }
}
