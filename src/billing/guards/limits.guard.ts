import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LimitsService } from '../limits.service';
import { CHECK_LIMIT_KEY } from '../decorators/check-limit.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

@Injectable()
export class LimitsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private limitsService: LimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredResource = this.reflector.getAllAndOverride<string>(CHECK_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredResource) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // orgId could be in headers from the interceptor/middleware
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      // Cannot check limits without an org context
      return true;
    }

    const result = await this.limitsService.checkLimit(orgId, requiredResource);

    if (!result.allowed) {
      throw new HttpException(
        {
          success: false,
          error: `Limit exceeded for ${requiredResource}. Upgrade your plan.`,
          details: { current: result.current, max: result.max },
        },
        HttpStatus.PAYMENT_REQUIRED, // 402
      );
    }

    return true;
  }
}
