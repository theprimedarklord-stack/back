// src/org-projects/org-projects.controller.ts
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
import { ProjectGuard } from '../auth/project.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Permission } from '../auth/permission.decorator';
import { RlsContextInterceptor } from '../common/interceptors/rls-context.interceptor';
import { OrgProjectsService } from './org-projects.service';
import {
  CreateOrgProjectDto,
  UpdateOrgProjectDto,
  AddProjectMemberDto,
  UpdateProjectMemberRoleDto,
  SwitchProjectDto,
} from './dto';

@Controller('org_projects')
@UseInterceptors(RlsContextInterceptor)
export class OrgProjectsController {
  constructor(private readonly orgProjectsService: OrgProjectsService) {}

  /**
   * GET /org_projects
   * Get all projects in the active organization
   * Requires: CognitoAuthGuard + ContextGuard (x-org-id header)
   */
  @Get()
  @UseGuards(HybridAuthGuard, ContextGuard)
  async findAll(@Req() req: Request) {
    const projects = await this.orgProjectsService.findAllInOrganization(
      req.context!.org.id,
      req.user!.userId,
    );
    return { projects };
  }

  /**
   * POST /org_projects
   * Create a new project in the active organization
   * Requires: owner/admin role in org
   */
  @Post()
  @UseGuards(HybridAuthGuard, ContextGuard, PermissionsGuard)
  @Permission('projects.create')
  async create(@Body() dto: CreateOrgProjectDto, @Req() req: Request) {
    const project = await this.orgProjectsService.create(
      req.context!.org.id,
      dto,
      req.user!.userId,
    );
    return { project };
  }

  /**
   * POST /org_projects/switch
   * Switch active project (sets cookie)
   */
  @Post('switch')
  @UseGuards(HybridAuthGuard, ContextGuard)
  @HttpCode(HttpStatus.OK)
  async switchProject(
    @Body() dto: SwitchProjectDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const canSwitch = await this.orgProjectsService.canSwitchTo(
      dto.projectId,
      req.user!.userId,
      req.context!.org.id,
    );

    if (!canSwitch) {
      return { 
        success: false, 
        message: 'Not a member of this project or project not in active organization',
      };
    }

    // Set active_project_id cookie
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('active_project_id', dto.projectId, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      success: true,
      projectId: dto.projectId,
      message: 'Project switched successfully',
    };
  }

  /**
   * GET /org_projects/:projectId
   * Get single project details
   */
  @Get(':projectId')
  @UseGuards(HybridAuthGuard, ContextGuard)
  async findOne(@Param('projectId') projectId: string, @Req() req: Request) {
    const project = await this.orgProjectsService.findOne(projectId, req.user!.userId);
    
    // Verify project belongs to active org
    if (project.organization_id !== req.context!.org.id) {
      throw new ForbiddenException('Project not in active organization');
    }

    return { project };
  }

  /**
   * PATCH /org_projects/:projectId
   * Update project (project_owner/project_admin only)
   */
  @Patch(':projectId')
  @UseGuards(HybridAuthGuard, ContextGuard, ProjectGuard, PermissionsGuard)
  @Permission('content.edit', 'project')
  async update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateOrgProjectDto,
  ) {
    const project = await this.orgProjectsService.update(projectId, dto);
    return { project };
  }

  /**
   * DELETE /org_projects/:projectId
   * Delete project (project_owner only)
   */
  @Delete(':projectId')
  @UseGuards(HybridAuthGuard, ContextGuard, ProjectGuard, RolesGuard)
  @Roles('project_owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('projectId') projectId: string) {
    await this.orgProjectsService.delete(projectId);
  }

  // ==================== Project Members ====================

  /**
   * GET /org_projects/:projectId/members
   * Get all members of a project
   */
  @Get(':projectId/members')
  @UseGuards(HybridAuthGuard, ContextGuard, ProjectGuard)
  async getMembers(@Param('projectId') projectId: string) {
    const members = await this.orgProjectsService.getMembers(projectId);
    return { members };
  }

  /**
   * POST /org_projects/:projectId/members
   * Add member to project (project_owner/project_admin only)
   */
  @Post(':projectId/members')
  @UseGuards(HybridAuthGuard, ContextGuard, ProjectGuard, RolesGuard)
  @Roles('project_owner', 'project_admin')
  async addMember(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @Req() req: Request,
  ) {
    const member = await this.orgProjectsService.addMember(
      projectId,
      req.context!.org.id,
      dto,
    );
    return { member };
  }

  /**
   * PATCH /org_projects/:projectId/members/:memberId
   * Update project member role (project_owner only)
   */
  @Patch(':projectId/members/:memberId')
  @UseGuards(HybridAuthGuard, ContextGuard, ProjectGuard, RolesGuard)
  @Roles('project_owner')
  async updateMemberRole(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
  ) {
    const member = await this.orgProjectsService.updateMemberRole(
      projectId,
      memberId,
      dto,
    );
    return { member };
  }

  /**
   * DELETE /org_projects/:projectId/members/:memberId
   * Remove member from project (project_owner or self)
   */
  @Delete(':projectId/members/:memberId')
  @UseGuards(HybridAuthGuard, ContextGuard, ProjectGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    // Allow project_owner to remove anyone, or user to remove themselves
    const isOwner = req.context?.project?.role === 'project_owner';
    const isSelf = memberId === req.user!.userId;

    if (!isOwner && !isSelf) {
      throw new ForbiddenException('Insufficient permissions');
    }

    await this.orgProjectsService.removeMember(projectId, memberId);
  }
}
