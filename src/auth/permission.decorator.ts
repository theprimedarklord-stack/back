// src/auth/permission.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export interface PermissionMetadata {
  action: string;
  type: 'organization' | 'project';
}

/**
 * @Permission() decorator - marks endpoint as requiring specific permission
 * 
 * Usage:
 *   @Permission('projects.create')  // organization-level permission (default)
 *   @Permission('content.edit', 'project')  // project-level permission
 * 
 * @param action - Permission action string (e.g., 'projects.create', 'members.invite')
 * @param type - Permission type: 'organization' (default) or 'project'
 */
export const Permission = (
  action: string,
  type: 'organization' | 'project' = 'organization',
) => SetMetadata(PERMISSION_KEY, { action, type } as PermissionMetadata);
