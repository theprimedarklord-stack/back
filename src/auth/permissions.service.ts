// src/auth/permissions.service.ts
import { Injectable, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface Permission {
  entity_type: string;
  role: string;
  action: string;
}

/**
 * PermissionsService - checks user permissions based on org_permissions table
 * 
 * Caches permissions in memory for performance.
 * Call refreshPermissions() if permissions change at runtime.
 */
@Injectable()
export class PermissionsService implements OnModuleInit {
  private permissionsCache: Map<string, Set<string>> = new Map();
  private cacheLoaded = false;

  constructor(private supabaseService: SupabaseService) {}

  async onModuleInit() {
    await this.loadPermissions();
  }

  /**
   * Load permissions from database into memory cache
   */
  async loadPermissions(): Promise<void> {
    const admin = this.supabaseService.getAdminClient();
    
    const { data, error } = await admin
      .from('org_permissions')
      .select('entity_type, role, action');

    if (error) {
      console.error('Failed to load permissions:', error);
      return;
    }

    this.permissionsCache.clear();

    for (const perm of data as Permission[]) {
      const key = `${perm.entity_type}:${perm.role}`;
      if (!this.permissionsCache.has(key)) {
        this.permissionsCache.set(key, new Set());
      }
      this.permissionsCache.get(key)!.add(perm.action);
    }

    this.cacheLoaded = true;
    console.log(`Loaded ${data.length} permissions into cache`);
  }

  /**
   * Refresh permissions cache (call when permissions change)
   */
  async refreshPermissions(): Promise<void> {
    await this.loadPermissions();
  }

  /**
   * Check if role has permission for action at organization level
   */
  hasOrganizationPermission(role: string, action: string): boolean {
    const key = `organization:${role}`;
    return this.permissionsCache.get(key)?.has(action) || false;
  }

  /**
   * Check if role has permission for action at project level
   */
  hasProjectPermission(role: string, action: string): boolean {
    const key = `project:${role}`;
    return this.permissionsCache.get(key)?.has(action) || false;
  }

  /**
   * Check organization permission and throw if denied
   */
  async checkOrganizationPermission(
    userId: string,
    orgId: string,
    action: string,
  ): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    // Get user's role in organization
    const { data: member, error } = await admin
      .from('org_organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (error || !member) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (!this.hasOrganizationPermission(member.role, action)) {
      throw new ForbiddenException(`Permission denied: ${action}`);
    }
  }

  /**
   * Check project permission and throw if denied
   */
  async checkProjectPermission(
    userId: string,
    projectId: string,
    action: string,
  ): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    // Get user's role in project
    const { data: member, error } = await admin
      .from('org_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (error || !member) {
      throw new ForbiddenException('Not a member of this project');
    }

    if (!this.hasProjectPermission(member.role, action)) {
      throw new ForbiddenException(`Permission denied: ${action}`);
    }
  }

  /**
   * Get all actions allowed for a role at organization level
   */
  getOrganizationActions(role: string): string[] {
    const key = `organization:${role}`;
    return Array.from(this.permissionsCache.get(key) || []);
  }

  /**
   * Get all actions allowed for a role at project level
   */
  getProjectActions(role: string): string[] {
    const key = `project:${role}`;
    return Array.from(this.permissionsCache.get(key) || []);
  }
}
