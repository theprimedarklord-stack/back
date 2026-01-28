// src/auth/permissions.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PermissionsService } from './permissions.service';
import { PERMISSION_KEY, PermissionMetadata } from './permission.decorator';

/**
 * PermissionsGuard - checks if user has required permission for the action
 * 
 * Uses @Permission() decorator metadata to determine:
 * - action: the permission action to check (e.g., 'projects.create')
 * - type: 'organization' or 'project' (determines which role to check)
 * 
 * Requires ContextGuard (and optionally ProjectGuard) to run first
 * to populate req.context with org/project roles.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionMeta = this.reflector.get<PermissionMetadata>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // If no @Permission() decorator, allow access
    if (!permissionMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const { action, type } = permissionMeta;

    // Check based on permission type
    if (type === 'project') {
      return this.checkProjectPermission(request, action);
    } else {
      return this.checkOrganizationPermission(request, action);
    }
  }

  private checkOrganizationPermission(request: Request, action: string): boolean {
    const orgContext = request.context?.org;
    
    if (!orgContext) {
      throw new ForbiddenException('Organization context required');
    }

    const hasPermission = this.permissionsService.hasOrganizationPermission(
      orgContext.role,
      action,
    );

    if (!hasPermission) {
      throw new ForbiddenException(`Permission denied: ${action}`);
    }

    return true;
  }

  private checkProjectPermission(request: Request, action: string): boolean {
    const projectContext = request.context?.project;
    
    if (!projectContext) {
      throw new ForbiddenException('Project context required');
    }

    const hasPermission = this.permissionsService.hasProjectPermission(
      projectContext.role,
      action,
    );

    if (!hasPermission) {
      throw new ForbiddenException(`Permission denied: ${action}`);
    }

    return true;
  }
}
