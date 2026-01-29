import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string | undefined>(REQUIRE_PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const perms: string[] = req.context?.permissions || [];

    if (!perms || !perms.includes(required)) {
      throw new ForbiddenException(`Permission denied: ${required}`);
    }

    return true;
  }
}
