import { Controller, Get, Patch, Param, Body, UseGuards, Req, HttpStatus } from '@nestjs/common';
import { ArchitectureService } from './architecture.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { RequireOrg } from '../common/decorators/require-org.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role?: string;
  };
}

@Controller('architecture')
@UseGuards(CognitoAuthGuard)
@RequireOrg(false)
export class ArchitectureController {
  constructor(
    private readonly architectureService: ArchitectureService,
    private readonly supabaseService: SupabaseService
  ) {}

  // Проверка роли администратора
  private async checkAdminRole(userId: string) {
    const { data: userData, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error || userData?.role !== 'admin') {
      return false;
    }
    return true;
  }

  @Get('modules')
  @RequireOrg(false)
  async getModules(@Req() req: AuthenticatedRequest) {
    const isAdmin = await this.checkAdminRole(req.user.id);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
      };
    }
    
    const modules = await this.architectureService.getModules();
    return { modules };
  }

  @Get('modules/:id')
  @RequireOrg(false)
  async getModuleById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const isAdmin = await this.checkAdminRole(req.user.id);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
      };
    }

    const moduleData = await this.architectureService.getModuleById(id);
    return { module: moduleData };
  }

  @Patch('modules/:id')
  @RequireOrg(false)
  async updateModule(@Param('id') id: string, @Body() body: any, @Req() req: AuthenticatedRequest) {
    const isAdmin = await this.checkAdminRole(req.user.id);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
      };
    }

    const updatedModule = await this.architectureService.updateModule(id, body);
    return { module: updatedModule };
  }

  @Get('agent-context')
  @RequireOrg(false)
  async getAgentContext(@Req() req: AuthenticatedRequest) {
    const isAdmin = await this.checkAdminRole(req.user.id);
    if (!isAdmin) {
      return {
        success: false,
        error: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
      };
    }

    return await this.architectureService.getAgentContext();
  }
}
