// src/auth/context.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

export interface OrgContext {
  id: string;
  role: 'owner' | 'admin' | 'member';
}

export interface RequestContext {
  org: OrgContext;
  userId: string;
}

/**
 * ContextGuard - checks organization membership and sets req.context
 * 
 * Reads org_id from:
 * 1. x-org-id header (priority)
 * 2. active_org_id cookie (fallback)
 * 
 * Verifies user is a member of the organization and sets:
 * - req.context.org = { id, role }
 * - req.context.userId
 */
@Injectable()
export class ContextGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // User must be authenticated first (CognitoAuthGuard should run before)
    if (!request.user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    const userId = request.user.userId;
    
    // Get org_id from header or cookie
    const orgId = this.extractOrgId(request);
    
    if (!orgId) {
      throw new BadRequestException('Organization context required (x-org-id header or active_org_id cookie)');
    }

    // Validate UUID format
    if (!this.isValidUUID(orgId)) {
      throw new BadRequestException('Invalid organization ID format');
    }

    // Check membership using admin client (bypass RLS for this check)
    const admin = this.supabaseService.getAdminClient();
    
    const { data: membership, error } = await admin
      .from('org_organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (error || !membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    // Set context on request
    request.context = {
      org: {
        id: orgId,
        role: membership.role as OrgContext['role'],
      },
      userId,
    };

    return true;
  }

  private extractOrgId(req: Request): string | null {
    // Priority: header > cookie
    const headerOrgId = req.headers['x-org-id'] as string;
    if (headerOrgId) {
      return headerOrgId;
    }
    
    return req.cookies?.active_org_id || null;
  }

  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}
