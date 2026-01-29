// src/organizations/organizations.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateOrganizationDto, UpdateOrganizationDto, AddMemberDto, UpdateMemberRoleDto } from './dto';

export interface Organization {
  id: string;
  name: string;
  created_by_user_id: string;
  created_at: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
  user?: {
    email: string;
    username: string;
  };
}

export interface OrganizationWithRole extends Organization {
  role: 'owner' | 'admin' | 'member';
}

@Injectable()
export class OrganizationsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all organizations for a user
   */
  async findAllForUser(userId: string, client?: any): Promise<OrganizationWithRole[]> {
    // If a transactional PG client is provided (req.dbClient), use it so RLS applies.
    if (client) {
      const sql = `
        SELECT o.id, o.name, o.created_by_user_id, o.created_at, m.role
        FROM org_organizations o
        JOIN org_organization_members m ON m.organization_id = o.id
        WHERE m.user_id = $1
      `;
      const res = await client.query(sql, [userId]);
      return res.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        created_by_user_id: row.created_by_user_id,
        created_at: row.created_at,
        role: row.role,
      }));
    }

    // Fallback: use admin client (bypass RLS) for legacy paths
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_organization_members')
      .select(`
        role,
        organization:org_organizations (
          id,
          name,
          created_by_user_id,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(`Failed to fetch organizations: ${error.message}`);
    }

    return data.map((item: any) => ({
      ...item.organization,
      role: item.role,
    }));
  }

  /**
   * Get single organization by ID
   */
  async findOne(orgId: string, userId: string): Promise<OrganizationWithRole> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_organization_members')
      .select(`
        role,
        organization:org_organizations (
          id,
          name,
          created_by_user_id,
          created_at
        )
      `)
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Organization not found or access denied');
    }

    return {
      ...(data as any).organization,
      role: data.role,
    };
  }

  /**
   * Create new organization (user becomes owner via trigger)
   */
  async create(dto: CreateOrganizationDto, userId: string): Promise<Organization> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_organizations')
      .insert({
        name: dto.name,
        created_by_user_id: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create organization: ${error.message}`);
    }

    return data;
  }

  /**
   * Update organization (requires owner role - checked by guard)
   */
  async update(
    orgId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_organizations')
      .update({ name: dto.name })
      .eq('id', orgId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update organization: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete organization (requires owner role - checked by guard)
   */
  async delete(orgId: string): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    const { error } = await admin
      .from('org_organizations')
      .delete()
      .eq('id', orgId);

    if (error) {
      throw new BadRequestException(`Failed to delete organization: ${error.message}`);
    }
  }

  /**
   * Get all members of an organization
   */
  async getMembers(orgId: string): Promise<OrganizationMember[]> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('org_organization_members')
      .select(`
        organization_id,
        user_id,
        role,
        created_at,
        user:users (
          email,
          username
        )
      `)
      .eq('organization_id', orgId);

    if (error) {
      throw new BadRequestException(`Failed to fetch members: ${error.message}`);
    }

    return data.map((item: any) => ({
      organization_id: item.organization_id,
      user_id: item.user_id,
      role: item.role,
      created_at: item.created_at,
      user: item.user,
    }));
  }

  /**
   * Add member to organization
   */
  async addMember(
    orgId: string,
    dto: AddMemberDto,
  ): Promise<OrganizationMember> {
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

    // Check if already a member
    const { data: existing } = await admin
      .from('org_organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .single();

    if (existing) {
      throw new BadRequestException('User is already a member of this organization');
    }

    const { data, error } = await admin
      .from('org_organization_members')
      .insert({
        organization_id: orgId,
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
   * Update member role
   */
  async updateMemberRole(
    orgId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<OrganizationMember> {
    const admin = this.supabaseService.getAdminClient();

    // Can't change role of the last owner
    if (dto.role !== 'owner') {
      const { data: owners } = await admin
        .from('org_organization_members')
        .select('user_id')
        .eq('organization_id', orgId)
        .eq('role', 'owner');

      if (owners?.length === 1 && owners[0].user_id === memberId) {
        throw new BadRequestException('Cannot change role of the last owner');
      }
    }

    const { data, error } = await admin
      .from('org_organization_members')
      .update({ role: dto.role })
      .eq('organization_id', orgId)
      .eq('user_id', memberId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update member role: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove member from organization
   */
  async removeMember(orgId: string, memberId: string, requesterId: string): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    // Can't remove the last owner (unless leaving yourself)
    const { data: owners } = await admin
      .from('org_organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner');

    if (owners?.length === 1 && owners[0].user_id === memberId) {
      throw new BadRequestException('Cannot remove the last owner. Transfer ownership first.');
    }

    const { error } = await admin
      .from('org_organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', memberId);

    if (error) {
      throw new BadRequestException(`Failed to remove member: ${error.message}`);
    }
  }

  /**
   * Check if user can switch to organization (is a member)
   */
  async canSwitchTo(orgId: string, userId: string): Promise<boolean> {
    const admin = this.supabaseService.getAdminClient();

    const { data } = await admin
      .from('org_organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    return !!data;
  }
}
