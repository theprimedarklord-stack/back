import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ContextDto } from './dto/context.dto';

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(private supabaseService: SupabaseService) { }

  /**
   * Build full context for a user with optional org/project/impersonation
   */
  async build(params: {
    userId: string;
    orgId?: string | null;
    projectId?: string | null;
    impersonatedUserId?: string | null;
  }): Promise<ContextDto> {
    const { userId, orgId, projectId, impersonatedUserId } = params;

    // Use Admin client to bypass RLS for context building (we are the system)
    const supabase = this.supabaseService.getAdminClient();

    try {
      // 1. Resolve Actor
      const targetUserId = impersonatedUserId || userId;

      // 2. Resolve Organization
      let selectedOrg: any = null;
      let orgRole: string | null = null;

      if (orgId) {
        // Specific org requested
        const { data: member } = await supabase
          .from('org_organization_members')
          .select('role, organization:org_organizations(id, name, color)')
          .eq('user_id', targetUserId)
          .eq('organization_id', orgId)
          .single();

        if (member) {
          selectedOrg = member.organization;
          orgRole = member.role;
        }
      } else {
        // Try last active org
        const { data: user } = await supabase
          .from('users')
          .select('last_active_org_id')
          .eq('user_id', targetUserId)
          .single();

        if (user?.last_active_org_id) {
          const { data: member } = await supabase
            .from('org_organization_members')
            .select('role, organization:org_organizations(id, name, color)')
            .eq('user_id', targetUserId)
            .eq('organization_id', user.last_active_org_id)
            .single();

          if (member) {
            selectedOrg = member.organization;
            orgRole = member.role;
          }
        }

        // Fallback: any org
        if (!selectedOrg) {
          const { data: member } = await supabase
            .from('org_organization_members')
            .select('role, organization:org_organizations(id, name, color)')
            .eq('user_id', targetUserId)
            .limit(1)
            .maybeSingle(); // Use maybeSingle to avoid 406 if no rows

          if (member) {
            selectedOrg = member.organization;
            orgRole = member.role;
          }
        }
      }

      // 3. Resolve Project
      let selectedProject: any = null;
      let projectRole: string | null = null;

      if (projectId && selectedOrg) {
        const { data: member } = await supabase
          .from('org_project_members')
          .select('role, project:org_projects(id, name)')
          .eq('user_id', targetUserId)
          .eq('project_id', projectId)
          .eq('project.organization_id', selectedOrg.id) // Ensure project belongs to org
          .single();

        if (member?.project) {
          selectedProject = member.project;
          projectRole = member.role;
        }
      }

      // 4. Resolve Permissions
      let permissions: string[] = [];
      if (orgRole || projectRole) {
        const { data: perms } = await supabase
          .from('org_permissions')
          .select('action')
          .or(`role.eq.${orgRole},role.eq.${projectRole}`);

        if (perms) {
          permissions = [...new Set(perms.map(p => p.action))];
        }
      }

      // 5. Limits & Flags
      let limits = {};
      let flags = {};

      if (selectedOrg) {
        const { data: l } = await supabase.from('org_limits').select('limits').eq('org_id', selectedOrg.id).single();
        if (l) limits = l.limits;

        const { data: f } = await supabase.from('org_feature_flags').select('flags').eq('org_id', selectedOrg.id).single();
        if (f) flags = f.flags;
      }

      // Construct Result
      const ctx: ContextDto = {
        actor: {
          userId: targetUserId,
          realUserId: userId,
          isImpersonated: !!impersonatedUserId,
        },
        org: selectedOrg ? { id: selectedOrg.id, name: selectedOrg.name, color: selectedOrg.color } : null,
        project: selectedProject ? { id: selectedProject.id, name: selectedProject.name } : null,
        permissions,
        limits,
        flags,
        meta: {
          orgRole,
          projectRole
        }
      };

      // Allow empty org (onboarding flow)
      return ctx;

    } catch (error) {
      this.logger.error('Failed to build context', error as any);
      throw error;
    }
  }
}
