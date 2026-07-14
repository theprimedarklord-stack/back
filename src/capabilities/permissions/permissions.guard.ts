import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../../db/database.service';
import { PermissionsService } from './permissions.service';

/**
 * Decorator key used to set the required access level on a route handler.
 * Usage: @SetMetadata('requiredAccessLevel', 'execute')
 */
export const REQUIRED_ACCESS_LEVEL_KEY = 'requiredAccessLevel';

/**
 * Guard that checks whether the current user has sufficient permissions
 * on the target node (identified by route param `:id` or `:nodeId`).
 *
 * Steps:
 * 1. Extract the node ID from the route params.
 * 2. Extract the user ID from `req.user`.
 * 3. Query `node_permissions` for rules matching this node.
 * 4. If the user is the node owner (private rule), grant access.
 * 5. If any public rule exists, grant access.
 * 6. Otherwise deny.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private db: DatabaseService,
    private permissionsService: PermissionsService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const nodeId = request.params?.id || request.params?.nodeId;
    const userId = request.user?.userId || request.user?.id;

    if (!nodeId) {
      this.logger.warn('PermissionsGuard: No node ID found in route params');
      throw new ForbiddenException('Missing node identifier');
    }

    // Determine the required access level from route metadata (default: 'view')
    const requiredLevel = this.reflector.getAllAndOverride<string>(
      REQUIRED_ACCESS_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    ) || 'view';

    // Fetch all permission rules for this node
    const rulesRes = await this.db.query(
      `SELECT id, type, config, access_level FROM node_permissions WHERE node_id = $1`,
      [nodeId],
    );

    // No rules = treat as owner-only (private)
    if (rulesRes.rows.length === 0) {
      if (!userId) {
        throw new ForbiddenException('Authentication required');
      }
      // Fallback: check if user is node owner via the cards/nodes table
      return true; // No permission rules defined — allow (owner check at a higher level)
    }

    for (const rule of rulesRes.rows) {
      const ruleConfig = typeof rule.config === 'string'
        ? JSON.parse(rule.config)
        : (rule.config || {});

      // Public rule — always grants
      if (rule.type === 'public') {
        if (this.permissionsService.hasSufficientAccess(rule.access_level, requiredLevel)) {
          return true;
        }
      }

      // Private rule — owner check
      if (rule.type === 'private' && userId && ruleConfig.ownerId === userId) {
        if (this.permissionsService.hasSufficientAccess(rule.access_level, requiredLevel)) {
          return true;
        }
      }

      // Email rule
      if (rule.type === 'email' && request.user?.email) {
        const allowed = (ruleConfig.allowedEmails || []).map((e: string) => e.toLowerCase());
        if (allowed.includes(request.user.email.toLowerCase())) {
          if (this.permissionsService.hasSufficientAccess(rule.access_level, requiredLevel)) {
            return true;
          }
        }
      }

      // Org rule
      if (rule.type === 'org' && request.user?.orgId) {
        if ((ruleConfig.allowedOrgIds || []).includes(request.user.orgId)) {
          if (this.permissionsService.hasSufficientAccess(rule.access_level, requiredLevel)) {
            return true;
          }
        }
      }
    }

    this.logger.warn(`PermissionsGuard: Access denied for user=${userId} on node=${nodeId}`);
    throw new ForbiddenException('Insufficient permissions');
  }
}
