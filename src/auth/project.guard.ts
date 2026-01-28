// src/auth/project.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

export interface ProjectContext {
  id: string;
  role: 'project_owner' | 'project_admin' | 'project_member' | 'viewer';
}

/**
 * ProjectGuard - checks project membership and sets req.context.project
 * 
 * Reads project_id from:
 * 1. x-project-id header (priority)
 * 2. :projectId route param
 * 3. active_project_id cookie (fallback)
 * 
 * Verifies:
 * - User is a member of the project
 * - Project belongs to the active organization (from req.context.org)
 */
@Injectable()
export class ProjectGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // User and org context must be set first
    if (!request.user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    if (!request.context?.org) {
      throw new ForbiddenException('Organization context required');
    }

    const userId = request.user.userId;
    const orgId = request.context.org.id;
    
    // Get project_id from header, param, or cookie
    const projectId = this.extractProjectId(request);
    
    if (!projectId) {
      throw new BadRequestException('Project context required (x-project-id header, :projectId param, or active_project_id cookie)');
    }

    // Validate UUID format
    if (!this.isValidUUID(projectId)) {
      throw new BadRequestException('Invalid project ID format');
    }

    const admin = this.supabaseService.getAdminClient();
    
    // Check that project belongs to the active organization
    const { data: project, error: projectError } = await admin
      .from('org_projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new ForbiddenException('Project not found');
    }

    if (project.organization_id !== orgId) {
      throw new ForbiddenException('Project does not belong to the active organization');
    }

    // Check project membership
    const { data: membership, error: memberError } = await admin
      .from('org_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (memberError || !membership) {
      throw new ForbiddenException('Not a member of this project');
    }

    // Set project context on request
    request.context.project = {
      id: projectId,
      role: membership.role as ProjectContext['role'],
    };

    return true;
  }

  private extractProjectId(req: Request): string | null {
    // Priority: header > route param > cookie
    const headerProjectId = req.headers['x-project-id'] as string;
    if (headerProjectId) {
      return headerProjectId;
    }

    const paramProjectId = req.params?.projectId;
    if (paramProjectId) {
      return paramProjectId;
    }
    
    return req.cookies?.active_project_id || null;
  }

  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}
