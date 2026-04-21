import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const agentKey = request.headers['x-agent-key'];
    
    if (!agentKey || agentKey !== process.env.AGENT_API_KEY) {
      throw new ForbiddenException('Forbidden: Invalid Agent Key');
    }
    
    return true;
  }
}
