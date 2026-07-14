import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { PermissionsService } from './permissions.service';

import { checkPublicRule } from './rules/public.rule';
import { checkPrivateRule } from './rules/private.rule';
import { checkPasswordRule } from './rules/password.rule';
import { checkEmailRule } from './rules/email.rule';
import { checkOrgRule } from './rules/org.rule';
import { checkApprovalRule } from './rules/approval.rule';

const RULE_CHECKERS: Record<string, (ruleConfig: any, credentials: any) => boolean> = {
  public: checkPublicRule,
  private: checkPrivateRule,
  password: checkPasswordRule,
  email: checkEmailRule,
  org: checkOrgRule,
  approval: checkApprovalRule,
};

@Controller('nodes/:id/permissions')
export class PermissionsController {
  constructor(
    private db: DatabaseService,
    private permissionsService: PermissionsService,
  ) {}

  /** GET /nodes/:id/permissions — list all permission rules for a node. */
  @Get()
  async listRules(@Param('id') nodeId: string) {
    const res = await this.db.query(
      `SELECT id, node_id, type, config, access_level, created_at
       FROM node_permissions
       WHERE node_id = $1
       ORDER BY created_at`,
      [nodeId],
    );
    return res.rows;
  }

  /** POST /nodes/:id/permissions/rules — add a permission rule. */
  @Post('rules')
  async addRule(
    @Param('id') nodeId: string,
    @Body() body: { type: string; config?: Record<string, any>; accessLevel?: string },
  ) {
    const { type, config = {}, accessLevel = 'view' } = body;
    if (!RULE_CHECKERS[type]) {
      throw new BadRequestException(`Unknown permission rule type: ${type}`);
    }
    const res = await this.db.query(
      `INSERT INTO node_permissions (node_id, type, config, access_level)
       VALUES ($1, $2, $3, $4)
       RETURNING id, node_id, type, config, access_level, created_at`,
      [nodeId, type, JSON.stringify(config), accessLevel],
    );
    return res.rows[0];
  }

  /** DELETE /nodes/:id/permissions/rules/:ruleId — remove a permission rule. */
  @Delete('rules/:ruleId')
  async removeRule(
    @Param('id') nodeId: string,
    @Param('ruleId') ruleId: string,
  ) {
    const res = await this.db.query(
      `DELETE FROM node_permissions WHERE id = $1 AND node_id = $2`,
      [ruleId, nodeId],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException('Permission rule not found');
    }
    return { success: true };
  }

  /** PUT /nodes/:id/permissions/rules/:ruleId — update a permission rule. */
  @Put('rules/:ruleId')
  async updateRule(
    @Param('id') nodeId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { type?: string; config?: Record<string, any>; accessLevel?: string },
  ) {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (body.type !== undefined) {
      if (!RULE_CHECKERS[body.type]) {
        throw new BadRequestException(`Unknown permission rule type: ${body.type}`);
      }
      setClauses.push(`type = $${paramIndex++}`);
      params.push(body.type);
    }
    if (body.config !== undefined) {
      setClauses.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(body.config));
    }
    if (body.accessLevel !== undefined) {
      setClauses.push(`access_level = $${paramIndex++}`);
      params.push(body.accessLevel);
    }

    if (setClauses.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    params.push(ruleId, nodeId);
    const res = await this.db.query(
      `UPDATE node_permissions
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex++} AND node_id = $${paramIndex}
       RETURNING id, node_id, type, config, access_level, created_at`,
      params,
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Permission rule not found');
    }
    return res.rows[0];
  }

  /** POST /nodes/:id/permissions/verify — verify access against all node rules. */
  @Post('verify')
  async verifyAccess(
    @Param('id') nodeId: string,
    @Body() credentials: { password?: string; email?: string; token?: string; userId?: string; orgId?: string },
  ) {
    // Fetch all rules for this node
    const rulesRes = await this.db.query(
      `SELECT id, type, config, access_level FROM node_permissions WHERE node_id = $1`,
      [nodeId],
    );

    if (rulesRes.rows.length === 0) {
      // No rules = public by default
      return { granted: true, accessLevel: 'view' };
    }

    // For approval rules, pre-fetch approved user IDs
    let approvedUserIds: string[] = [];
    const hasApprovalRule = rulesRes.rows.some((r: any) => r.type === 'approval');
    if (hasApprovalRule && credentials.userId) {
      const approvedRes = await this.db.query(
        `SELECT requester_id FROM node_access_requests
         WHERE node_id = $1 AND status = 'approved'`,
        [nodeId],
      );
      approvedUserIds = approvedRes.rows.map((r: any) => r.requester_id);
    }

    const enrichedCredentials = { ...credentials, approvedUserIds };

    // Check each rule — grant the highest matching access level
    let highestAccess: string | null = null;
    const accessHierarchy = ['view', 'comment', 'edit', 'execute', 'admin'];

    for (const rule of rulesRes.rows) {
      const checker = RULE_CHECKERS[rule.type];
      if (!checker) continue;

      const ruleConfig = typeof rule.config === 'string' ? JSON.parse(rule.config) : (rule.config || {});
      if (checker(ruleConfig, enrichedCredentials)) {
        const currentIndex = accessHierarchy.indexOf(rule.access_level);
        const highestIndex = highestAccess ? accessHierarchy.indexOf(highestAccess) : -1;
        if (currentIndex > highestIndex) {
          highestAccess = rule.access_level;
        }
      }
    }

    if (highestAccess) {
      return { granted: true, accessLevel: highestAccess };
    }
    return { granted: false, accessLevel: null };
  }

  /** GET /nodes/:id/permissions/requests — list access requests for a node. */
  @Get('requests')
  async listAccessRequests(@Param('id') nodeId: string) {
    const res = await this.db.query(
      `SELECT id, node_id, requester_id, status, message, responded_at, created_at
       FROM node_access_requests
       WHERE node_id = $1
       ORDER BY created_at DESC`,
      [nodeId],
    );
    return res.rows;
  }

  /** POST /nodes/:id/permissions/requests/:requestId — approve or reject an access request. */
  @Post('requests/:requestId')
  async handleAccessRequest(
    @Param('id') nodeId: string,
    @Param('requestId') requestId: string,
    @Body() body: { action: 'approve' | 'reject' },
  ) {
    if (body.action !== 'approve' && body.action !== 'reject') {
      throw new BadRequestException('Action must be "approve" or "reject"');
    }

    const status = body.action === 'approve' ? 'approved' : 'rejected';
    const res = await this.db.query(
      `UPDATE node_access_requests
       SET status = $1, responded_at = NOW()
       WHERE id = $2 AND node_id = $3
       RETURNING id, node_id, requester_id, status, responded_at`,
      [status, requestId, nodeId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Access request not found');
    }
    return res.rows[0];
  }
}
