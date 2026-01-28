// src/org-projects/org-projects.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateOrgProjectDto,
  UpdateOrgProjectDto,
  AddProjectMemberDto,
  UpdateProjectMemberRoleDto,
} from './dto';

export interface OrgProject {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  created_by_user_id: string;
  created_at: string;
}

export interface OrgProjectMember {
  project_id: string;
  user_id: string;
  role: 'project_owner' | 'project_admin' | 'project_member' | 'viewer';
  created_at: string;
  user?: {
    email: string;
    username: string;
  };
}

export interface OrgProjectWithRole extends OrgProject {
  role?: 'project_owner' | 'project_admin' | 'project_member' | 'viewer';
}

@Injectable()
export class OrgProjectsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all projects in an organization
   */
  async findAllInOrganization(orgId: string, userId: string): Promise<OrgProjectWithRole[]> {
    const admin = this.supabaseService.getAdminClient();

    // Get projects with user's role if they're a member
    const { data, error } = await admin
      .from('org_projects')
      .select(`
        id,
        organization_id,
        name,
        created_by_user_id,
        created_at,
        members:org_project_members!left (
          role
        )
      `)
      .eq('organization_id', orgId);

    if (error) {
      throw new BadRequestException(`Failed to fetch projects: ${error.message}`);
    }

    // Filter to get user's role from members array
    return data.map((project: any) => {
      const userMembership = project.members?.find(
        (m: any) => m.user_id === userId,
      );
      return {
        id: project.id,
        organization_id: project.organization_id,
        name: project.name,
        created_by_user_id: project.created_by_user_id,
        created_at: project.created_at,
        role: userMembership?.role,
      };
    });
  }

  /**
   * Get single project by ID
   */
  async findOne(projectId: string, userId: string): Promise<OrgProjectWithRole> {
    const admin = this.supabaseService.getAdminClient();

    const { data: project, error: projectError } = await admin
      .from('org_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new NotFoundException('Project not found');
    }

    // Get user's role in project
    const { data: membership } = await admin
      .from('org_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    return {
      ...project,
      role: membership?.role,
    };
  }

  /**
   * Create new project in organization (user becomes project_owner via trigger)
   */
  async create(
    orgId: string,
    dto: CreateOrgProjectDto,
    userId: string,
  ): Promise<OrgProject> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_projects')
      .insert({
        organization_id: orgId,
        name: dto.name,
        created_by_user_id: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create project: ${error.message}`);
    }

    return data;
  }

  /**
   * Update project (requires project_owner/project_admin role - checked by guard)
   */
  async update(projectId: string, dto: UpdateOrgProjectDto): Promise<OrgProject> {
    const admin = this.supabaseService.getAdminClient();

    const updateData: Record<string, any> = {};
    if (dto.name) updateData.name = dto.name;

    const { data, error } = await admin
      .from('org_projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update project: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete project (requires project_owner role - checked by guard)
   */
  async delete(projectId: string): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    const { error } = await admin
      .from('org_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      throw new BadRequestException(`Failed to delete project: ${error.message}`);
    }
  }

  /**
   * Get all members of a project
   */
  async getMembers(projectId: string): Promise<OrgProjectMember[]> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_project_members')
      .select(`
        project_id,
        user_id,
        role,
        created_at,
        user:users (
          email,
          username
        )
      `)
      .eq('project_id', projectId);

    if (error) {
      throw new BadRequestException(`Failed to fetch members: ${error.message}`);
    }

    return data.map((item: any) => ({
      project_id: item.project_id,
      user_id: item.user_id,
      role: item.role,
      created_at: item.created_at,
      user: item.user,
    }));
  }

  /**
   * Add member to project
   */
  async addMember(
    projectId: string,
    orgId: string,
    dto: AddProjectMemberDto,
  ): Promise<OrgProjectMember> {
    const admin = this.supabaseService.getAdminClient();

    let targetUserId = dto.userId;

    // If email provided, find user by email
    if (dto.email && !targetUserId) {
      const { data: user } = await admin
        .from('users')
        .select('user_id')
        .eq('email', dto.email)
        .single();

      if (!user) {
        throw new NotFoundException(`User with email ${dto.email} not found`);
      }
      targetUserId = user.user_id;
    }

    if (!targetUserId) {
      throw new BadRequestException('Either email or userId must be provided');
    }

    // Verify user is a member of the organization first
    const { data: orgMember } = await admin
      .from('org_organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .single();

    if (!orgMember) {
      throw new ForbiddenException('User must be a member of the organization first');
    }

    // Check if already a project member
    const { data: existing } = await admin
      .from('org_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', targetUserId)
      .single();

    if (existing) {
      throw new BadRequestException('User is already a member of this project');
    }

    const { data, error } = await admin
      .from('org_project_members')
      .insert({
        project_id: projectId,
        user_id: targetUserId,
        role: dto.role,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add member: ${error.message}`);
    }

    return data;
  }

  /**
   * Update project member role
   */
  async updateMemberRole(
    projectId: string,
    memberId: string,
    dto: UpdateProjectMemberRoleDto,
  ): Promise<OrgProjectMember> {
    const admin = this.supabaseService.getAdminClient();

    // Can't change role of the last project_owner
    if (dto.role !== 'project_owner') {
      const { data: owners } = await admin
        .from('org_project_members')
        .select('user_id')
        .eq('project_id', projectId)
        .eq('role', 'project_owner');

      if (owners?.length === 1 && owners[0].user_id === memberId) {
        throw new BadRequestException('Cannot change role of the last project owner');
      }
    }

    const { data, error } = await admin
      .from('org_project_members')
      .update({ role: dto.role })
      .eq('project_id', projectId)
      .eq('user_id', memberId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update member role: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove member from project
   */
  async removeMember(projectId: string, memberId: string): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    // Can't remove the last project_owner
    const { data: owners } = await admin
      .from('org_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('role', 'project_owner');

    if (owners?.length === 1 && owners[0].user_id === memberId) {
      throw new BadRequestException('Cannot remove the last project owner. Transfer ownership first.');
    }

    const { error } = await admin
      .from('org_project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', memberId);

    if (error) {
      throw new BadRequestException(`Failed to remove member: ${error.message}`);
    }
  }

  /**
   * Check if user can switch to project (is a member and project is in their active org)
   */
  async canSwitchTo(projectId: string, userId: string, orgId: string): Promise<boolean> {
    const admin = this.supabaseService.getAdminClient();

    // Check project belongs to org
    const { data: project } = await admin
      .from('org_projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    if (!project || project.organization_id !== orgId) {
      return false;
    }

    // Check user is member of project
    const { data: membership } = await admin
      .from('org_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    return !!membership;
  }
}
