import { Controller, Get, Req, UseGuards, Query, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { ContextBuilderService } from '../auth/context-builder.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrgProjectsService } from '../org-projects/org-projects.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('me')
export class MeController {
  constructor(
    private contextBuilder: ContextBuilderService,
    private organizationsService: OrganizationsService,
    private orgProjectsService: OrgProjectsService,
    private supabaseService: SupabaseService,
  ) { }

  @UseGuards(HybridAuthGuard)
  @Get('context')
  async getContext(@Req() req: Request) {
    const userId = req.user?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }
    const orgId = req.headers['x-org-id'] as string | undefined;
    const projectId = req.headers['x-project-id'] as string | undefined;

    return this.contextBuilder.build({ userId, orgId, projectId });
  }

  @UseGuards(HybridAuthGuard)
  @Get('orgs')
  async getOrgs(@Req() req: Request) {
    const userId = req.user?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }
    return this.organizationsService.findAllForUser(userId);
  }

  @UseGuards(HybridAuthGuard)
  @Get('projects')
  async getProjects(@Req() req: Request, @Query('orgId') orgId?: string) {
    const userId = req.user?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }
    if (!orgId) {
      // If orgId not provided, try header or let orgProjectsService handle validation
      orgId = req.headers['x-org-id'] as string | undefined;
    }

    if (!orgId) {
      // Return empty list instead of error; client should request /me/context first
      return [];
    }

    const client = (req as any).dbClient;
    if (client) {
      // run raw SQL under transactional client to respect RLS
      const sql = `
        SELECT p.id, p.organization_id, p.name, p.created_by_user_id, p.created_at, pm.role, pm.user_id
        FROM org_projects p
        LEFT JOIN org_project_members pm ON pm.project_id = p.id AND pm.user_id = $2
        WHERE p.organization_id = $1
      `;
      const res = await client.query(sql, [orgId, userId]);
      return res.rows.map((r: any) => ({
        id: r.id,
        organization_id: r.organization_id,
        name: r.name,
        created_by_user_id: r.created_by_user_id,
        created_at: r.created_at,
        role: r.role,
      }));
    }

    return this.orgProjectsService.findAllInOrganization(orgId, userId);
  }

  @UseGuards(HybridAuthGuard)
  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  async switchOrg(@Req() req: Request, @Body() dto: { organizationId: string }) {
    const userId = req.user?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }
    const orgId = dto.organizationId;

    // Verify membership
    const canSwitch = await this.organizationsService.canSwitchTo(orgId, userId);
    if (!canSwitch) {
      return { success: false, message: 'Not a member of this organization' };
    }

    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('users')
      .update({ last_active_org_id: orgId })
      .eq('user_id', userId);

    if (error) {
      return { success: false, message: 'Failed to switch organization' };
    }

    // Also set cookie for convenience
    const isProd = process.env.NODE_ENV === 'production';
    req.res?.cookie('active_org_id', orgId, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return { success: true, organizationId: orgId };
  }
}
