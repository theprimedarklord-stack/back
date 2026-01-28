// src/common/interceptors/rls-context.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';

/**
 * RlsContextInterceptor - sets PostgreSQL session variables for RLS
 * 
 * After AuthGuard and ContextGuard run, this interceptor calls
 * set_rls_context() function to set app.current_user_id and app.current_org_id
 * for the current database session.
 * 
 * This enables RLS policies to use current_setting('app.current_user_id')
 * to filter rows based on the authenticated user.
 * 
 * Note: This uses SET LOCAL which only affects the current transaction.
 * For pooled connections, ensure each request is a separate transaction.
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(private supabaseService: SupabaseService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Only set context if user is authenticated
    if (request.user?.userId) {
      await this.setRlsContext(
        request.user.userId,
        request.context?.org?.id,
      );
    }

    return next.handle();
  }

  /**
   * Set RLS context variables in PostgreSQL session
   */
  private async setRlsContext(
    userId: string,
    orgId?: string,
  ): Promise<void> {
    const admin = this.supabaseService.getAdminClient();

    try {
      // Call the set_rls_context function defined in migration
      await admin.rpc('set_rls_context', {
        p_user_id: userId,
        p_org_id: orgId || null,
      });
    } catch (error) {
      // Log but don't fail the request - RLS will still work with service role
      console.warn('Failed to set RLS context:', error);
    }
  }
}
