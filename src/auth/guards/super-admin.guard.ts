import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User session not found');
    }

    const groups = user.claims?.['cognito:groups'] || [];
    if (Array.isArray(groups) && groups.includes('SuperAdmins')) {
      return true;
    }

    throw new ForbiddenException('SuperAdmin access required');
  }
}
