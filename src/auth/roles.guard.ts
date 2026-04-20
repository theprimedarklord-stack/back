// src/auth/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const ROLES_KEY = 'roles';

/**
 * Simple roles decorator for quick role checks
 */
export const Roles = (...roles: string[]) => 
  (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value || target);
    return descriptor || target;
  };

/**
 * RolesGuard - simple guard for checking org/project roles directly
 * 
 * Usage:
 *   @Roles('owner', 'admin')  // checks req.context.org.role
 *   @UseGuards(RolesGuard)
 * 
 * For project roles, the guard checks req.context.project.role if available,
 * otherwise falls back to req.context.org.role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>(
      ROLES_KEY,
      context.getHandler(),
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    
    // Check project role first, then org role
    const projectRole = request.context?.project?.role;
    const orgRole = request.context?.org?.role;
    
    const userRole = projectRole || orgRole;

    if (!userRole) {
      throw new ForbiddenException('No role assigned');
    }

    const hasRole = requiredRoles.includes(userRole);
    
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
