import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { DatabaseService } from '../db/database.service';

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsContextInterceptor.name);

  constructor(private readonly db: DatabaseService) { }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const path = req.path;

    // Skip RLS logic and logging for public/health paths
    // This prevents log spam from health checks
    const isPublicPath =
      path === '/' ||
      path.startsWith('/health') ||
      path.startsWith('/api/health') ||
      path.startsWith('/api/v1/telemetry') ||
      path.startsWith('/auth/') ||
      path.startsWith('/me/') || // Skip RLS for /me endpoints which use Supabase Client
      path.startsWith('/organizations/') || // Skip RLS for organization ops to bypass PG driver issues
      req.method === 'OPTIONS';

    if (isPublicPath) {
      return next.handle();
    }

    // Extract user ID from JWT token (set by JwtAuthGuard)
    const userId = req.user?.userId || req.user?.id;

    this.logger.debug(`RLS Context: userId=${userId}, user=${JSON.stringify(req.user)}`);

    if (!userId) {
      this.logger.warn(`No userId found for ${req.method} ${path}, skipping RLS context`);
      return next.handle();
    }

    // Wrap request handling in a transaction with app.user_id set locally
    return new Observable((subscriber) => {
      this.db.withUserContext(userId, async (client) => {
        // expose client for downstream use if needed
        req.dbClient = client;

        try {
          const result = await lastValueFrom(next.handle());
          subscriber.next(result);
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
          throw err;
        }
      }).catch((err) => {
        subscriber.error(err);
      });
    });
  }
}
