import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ArchitectureService } from './architecture.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { RequireOrg } from '../common/decorators/require-org.decorator';

@Controller('architecture')
@UseGuards(CognitoAuthGuard, SuperAdminGuard)
@RequireOrg(false)
export class ArchitectureController {
  constructor(
    private readonly architectureService: ArchitectureService,
  ) {}

  @Get('modules')
  @RequireOrg(false)
  async getModules() {
    const modules = await this.architectureService.getModules();
    return { modules };
  }

  @Get('modules/:id')
  @RequireOrg(false)
  async getModuleById(@Param('id') id: string) {
    const moduleData = await this.architectureService.getModuleById(id);
    return { module: moduleData };
  }

  @Patch('modules/:id')
  @RequireOrg(false)
  async updateModule(@Param('id') id: string, @Body() body: any) {
    const updatedModule = await this.architectureService.updateModule(id, body);
    return { module: updatedModule };
  }

  @Get('agent-context')
  @RequireOrg(false)
  async getAgentContext() {
    return await this.architectureService.getAgentContext();
  }
}
