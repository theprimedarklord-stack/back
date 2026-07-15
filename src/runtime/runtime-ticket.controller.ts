import { Controller, Post, UseGuards, Req, Inject } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { CognitoAuthGuard, CognitoUserPayload } from '../auth/cognito-auth.guard';

interface AuthenticatedRequest extends Request {
  user: CognitoUserPayload;
}

@Controller('runtime')
export class RuntimeTicketController {
  constructor(@Inject('WS_REDIS') private readonly wsRedis: Redis) {}

  @UseGuards(CognitoAuthGuard)
  @Post('ws-ticket')
  async issueWsTicket(@Req() req: AuthenticatedRequest) {
    const ticket = crypto.randomBytes(24).toString('hex');
    await this.wsRedis.set(`ws:ticket:${ticket}`, req.user.userId, 'EX', 30);
    return { ticket };
  }
}
