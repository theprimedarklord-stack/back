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
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { ContextGuard } from '../auth/context.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Permission } from '../auth/permission.decorator';
import { RlsContextInterceptor } from '../auth/rls-context.interceptor';
import { RequireOrg } from '../common/decorators/require-org.decorator';
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
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
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
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async create(@Body() dto: CreateOrganizationDto, @Req() req: Request) {
    const organization = await this.organizationsService.create(dto, req.user!.userId);
    return { organization };
  }

  /**
   * POST /organizations/switch
   * Switch active organization (sets cookie)
   */
  @Post('switch')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
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
   * For now protected by CognitoAuthGuard to ensure user is logged in.
   */
  @Get('by-slug/:slug')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async findBySlug(@Param('slug') slug: string, @Req() req: Request) {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length > 32) {
      throw new BadRequestException('Invalid slug format');
    }

    const organization = await this.organizationsService.findBySlug(slug);
    // Note: findBySlug currently queries admin client. 
    // Ideally we should verify membership, but this matches the requested behavior or existing one.
    return { organization };
  }

  /**
   * GET /organizations/slug/check/:slug
   * Check if slug is available
   */
  @Get('slug/check/:slug')
  @RequireOrg(false)
  async checkSlug(@Param('slug') slug: string) {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3 || slug.length > 32) {
      return { available: false, reason: 'invalid_format' };
    }

    const RESERVED = [
      // Инфраструктура
      'www', 'app', 'api', 'api2', 'apiv1', 'apiv2',
      'admin', 'superadmin', 'root', 'system', 'internal',
      'static', 'cdn', 'assets', 'media', 'files', 'uploads',
      'img', 'images', 'video', 'videos', 'audio',

      // Сеть и безопасность
      'mail', 'email', 'smtp', 'imap', 'pop', 'mx',
      'ftp', 'sftp', 'ssh', 'vpn', 'proxy',
      'ns', 'ns1', 'ns2', 'dns', 'rdns',
      'ssl', 'tls', 'cert', 'certs',
      'localhost', 'local', 'intranet', 'gateway',

      // Auth / сессии
      'auth', 'login', 'logout', 'signin', 'signout',
      'signup', 'register', 'registration',
      'oauth', 'sso', 'saml', 'openid',
      'token', 'callback', 'verify', 'confirm',
      'password', 'reset', 'invite',

      // Бизнес-сервисы
      'billing', 'payment', 'payments', 'checkout',
      'invoice', 'invoices', 'subscription', 'pricing',
      'stripe', 'paypal',

      // Коммуникация / поддержка
      'support', 'help', 'helpdesk', 'ticket', 'tickets',
      'chat', 'feedback', 'contact', 'report',

      // Продукт / контент
      'docs', 'documentation', 'wiki', 'kb', 'faq',
      'blog', 'news', 'press', 'updates', 'changelog',
      'landing', 'home', 'welcome', 'about', 'info',
      'careers', 'jobs', 'legal', 'privacy', 'terms',

      // Среды и деплой
      'dev', 'develop', 'development',
      'test', 'testing', 'qa',
      'staging', 'stage', 'uat',
      'demo', 'sandbox', 'preview',
      'prod', 'production',
      'beta', 'alpha', 'canary',
      'v1', 'v2', 'v3',

      // Мониторинг / служебные
      'status', 'health', 'metrics', 'monitor',
      'logs', 'analytics', 'stats',
      'grafana', 'sentry', 'datadog',

      // Зарезервировано на будущее
      'marketplace', 'store', 'shop',
      'integrations', 'webhooks', 'events',
      'mobile', 'ios', 'android',
      'download', 'downloads', 'releases',
    ];
    if (RESERVED.includes(slug)) {
      return { available: false, reason: 'reserved' };
    }

    const available = await this.organizationsService.checkSlugAvailable(slug);
    return { available };
  }

  /**
   * GET /organizations/:orgId
   * Get single organization details
   */
  @Get(':orgId')
  @UseGuards(CognitoAuthGuard)
  async findOne(@Param('orgId') orgId: string, @Req() req: Request) {
    const organization = await this.organizationsService.findOne(orgId, req.user!.userId);
    return { organization };
  }

  /**
   * PATCH /organizations/:orgId
   * Update organization (owner only)
   */
  @Patch(':orgId')
  @UseGuards(CognitoAuthGuard, ContextGuard, RolesGuard)
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
  @UseGuards(CognitoAuthGuard, ContextGuard, RolesGuard)
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
  @UseGuards(CognitoAuthGuard) // ContextGuard removed as it blocks access if not "switched" into org
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
  @UseGuards(CognitoAuthGuard, ContextGuard, PermissionsGuard)
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
  @UseGuards(CognitoAuthGuard, ContextGuard, RolesGuard)
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
  @UseGuards(CognitoAuthGuard, ContextGuard)
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
