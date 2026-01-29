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
import { ContextBuilderService } from './context-builder.service';

export interface OrgContext {
  id: string;
  role: 'owner' | 'admin' | 'member';
}

export interface RequestContext {
  org: OrgContext;
  userId: string;
  permissions?: string[];
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
  constructor(
    private supabaseService: SupabaseService,
    private contextBuilder: ContextBuilderService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // User must be authenticated first (CognitoAuthGuard should run before)
    if (!request.user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    const userId = request.user.userId;
    
    // Build full context (uses fallback logic internally)
    const headerOrgId = this.extractOrgId(request);
    const headerProjectId = this.extractProjectId(request);

    const ctx = await this.contextBuilder.build({
      userId,
      orgId: headerOrgId || undefined,
      projectId: headerProjectId || undefined,
    });

    if (!ctx || !ctx.org) {
      throw new BadRequestException('Organization context could not be resolved');
    }

    request.context = {
      org: { id: ctx.org.id, role: ctx.meta?.orgRole as OrgContext['role'] },
      userId: ctx.actor.id,
    } as RequestContext;

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

  private extractProjectId(req: Request): string | null {
    const header = req.headers['x-project-id'] as string;
    if (header) return header;
    return req.cookies?.active_project_id || null;
  }

  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}
