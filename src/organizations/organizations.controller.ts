// src/organizations/organizations.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { ContextGuard } from '../auth/context.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Permission } from '../auth/permission.decorator';
import { RlsContextInterceptor } from '../common/interceptors/rls-context.interceptor';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AddMemberDto,
  UpdateMemberRoleDto,
  SwitchOrganizationDto,
} from './dto';

@Controller('organizations')
@UseInterceptors(RlsContextInterceptor)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) { }

  /**
   * GET /organizations
   * Get all organizations for the authenticated user
   */
  @Get()
  @UseGuards(HybridAuthGuard)
  async findAll(@Req() req: Request) {
    const client = (req as any).dbClient;
    const organizations = await this.organizationsService.findAllForUser(req.user!.userId, client);
    return { organizations };
  }

  /**
   * POST /organizations
   * Create a new organization (user becomes owner)
   */
  @Post()
  @UseGuards(HybridAuthGuard)
  async create(@Body() dto: CreateOrganizationDto, @Req() req: Request) {
    const organization = await this.organizationsService.create(dto, req.user!.userId);
    return { organization };
  }

  /**
   * POST /organizations/switch
   * Switch active organization (sets cookie)
   */
  @Post('switch')
  @UseGuards(HybridAuthGuard)
  @HttpCode(HttpStatus.OK)
  async switchOrganization(
    @Body() dto: SwitchOrganizationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const canSwitch = await this.organizationsService.canSwitchTo(
      dto.organizationId,
      req.user!.userId,
    );

    if (!canSwitch) {
      return { success: false, message: 'Not a member of this organization' };
    }

    // Set active_org_id cookie
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('active_org_id', dto.organizationId, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      success: true,
      organizationId: dto.organizationId,
      message: 'Organization switched successfully',
    };
  }

  /**
   * GET /organizations/by-slug/:slug
   * Resolve organization by slug (publicly accessible for routing, or protected?)
   * For now protected by HybridAuthGuard to ensure user is logged in.
   */
  @Get('by-slug/:slug')
  @UseGuards(HybridAuthGuard)
  async findBySlug(@Param('slug') slug: string) {
    const organization = await this.organizationsService.findBySlug(slug);
    return { organization };
  }

  /**
   * GET /organizations/:orgId
   * Get single organization details
   */
  @Get(':orgId')
  @UseGuards(HybridAuthGuard)
  async findOne(@Param('orgId') orgId: string, @Req() req: Request) {
    const organization = await this.organizationsService.findOne(orgId, req.user!.userId);
    return { organization };
  }

  /**
   * PATCH /organizations/:orgId
   * Update organization (owner only)
   */
  @Patch(':orgId')
  @UseGuards(HybridAuthGuard, ContextGuard, RolesGuard)
  @Roles('owner')
  async update(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    const organization = await this.organizationsService.update(orgId, dto);
    return { organization };
  }

  /**
   * DELETE /organizations/:orgId
   * Delete organization (owner only)
   */
  @Delete(':orgId')
  @UseGuards(HybridAuthGuard, ContextGuard, RolesGuard)
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('orgId') orgId: string) {
    await this.organizationsService.delete(orgId);
  }

  // ==================== Members ====================

  /**
   * GET /organizations/:orgId/members
   * Get all members of an organization
   */
  @Get(':orgId/members')
  @UseGuards(HybridAuthGuard) // ContextGuard removed as it blocks access if not "switched" into org
  async getMembers(@Param('orgId') orgId: string, @Req() req: Request) {
    // Verify membership manually
    const isMember = await this.organizationsService.canSwitchTo(orgId, req.user!.userId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of this organization');
    }

    const members = await this.organizationsService.getMembers(orgId);
    return { members };
  }

  /**
   * POST /organizations/:orgId/members
   * Add member to organization (owner/admin only)
   */
  @Post(':orgId/members')
  @UseGuards(HybridAuthGuard, ContextGuard, PermissionsGuard)
  @Permission('members.invite')
  async addMember(
    @Param('orgId') orgId: string,
    @Body() dto: AddMemberDto,
  ) {
    const member = await this.organizationsService.addMember(orgId, dto);
    return { member };
  }

  /**
   * PATCH /organizations/:orgId/members/:memberId
   * Update member role (owner only)
   */
  @Patch(':orgId/members/:memberId')
  @UseGuards(HybridAuthGuard, ContextGuard, RolesGuard)
  @Roles('owner')
  async updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    const member = await this.organizationsService.updateMemberRole(orgId, memberId, dto);
    return { member };
  }

  /**
   * DELETE /organizations/:orgId/members/:memberId
   * Remove member from organization (owner or self)
   */
  @Delete(':orgId/members/:memberId')
  @UseGuards(HybridAuthGuard, ContextGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    // Allow owner to remove anyone, or user to remove themselves
    const isOwner = req.context?.org?.role === 'owner';
    const isSelf = memberId === req.user!.userId;

    if (!isOwner && !isSelf) {
      throw new Error('Insufficient permissions');
    }

    await this.organizationsService.removeMember(orgId, memberId, req.user!.userId);
  }
}
