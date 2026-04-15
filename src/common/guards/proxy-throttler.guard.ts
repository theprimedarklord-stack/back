// src/common/guards/proxy-throttler.guard.ts
//
// FAANG-grade Rate Limiting Guard with Composite Key.
// Relies on BFF (Next.js) to inject trusted 'x-user-id' header.
// This guard runs BEFORE CognitoAuthGuard (global APP_GUARD),
// so it cannot read req.user — instead it reads the BFF-injected header.
//
// Key strategy:
//   Authenticated users → "user:{sub_id}" (rate limited per account)
//   Anonymous requests  → "ip:{client_ip}"  (rate limited per IP)

import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ProxyThrottlerGuard extends ThrottlerGuard {
  /**
   * Returns a unique tracking key for the current request.
   * - If BFF injected x-user-id (authorized session), we track by user account.
   * - Otherwise, we track by IP (anonymous / direct agent traffic).
   *
   * req.ip is reliable because trust proxy is configured in main.ts.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Identity injected by BFF after Redis session lookup
    const userId = req.headers['x-user-id'];

    // req.ip contains the correct client IP thanks to app.set('trust proxy', 1)
    const ip = req.ip || '127.0.0.1';

    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  /**
   * Custom error with Retry-After information (FAANG standard).
   * Uses timeToExpire from ThrottlerRecord to tell the client
   * exactly how long to wait before retrying.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: any, // Typings not exported in @nestjs/throttler >= 6.x
  ): Promise<void> {
    const retrySeconds = Math.ceil(throttlerLimitDetail.timeToExpire / 1000);

    throw new HttpException(
      `Too Many Requests. Try again in ${retrySeconds} seconds.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
