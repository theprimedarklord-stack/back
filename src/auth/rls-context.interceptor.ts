import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { DatabaseService } from '../db/database.service';

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(private readonly db: DatabaseService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    const orgId = req.context?.org?.id;
    if (!orgId) {
      return next.handle();
    }

    // Wrap request handling in a transaction with app.org_id set locally
    return new Observable((subscriber) => {
      this.db.withOrgContext(orgId, async (client) => {
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
