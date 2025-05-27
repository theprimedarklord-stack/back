import { Body, Controller, Get, Post, Req, Res, UseGuards, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response, Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role?: string;
  };
}

@Controller('user')
export class UserController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('theme')
  @UseGuards(JwtAuthGuard)
  async getTheme(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const { data: userData, error } = await this.supabaseService
        .getClient()
        .from('users')
        .select('theme')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        return {
          success: false,
          error: 'Failed to fetch theme',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      const theme = userData?.theme || 'light';
      res.cookie('theme', theme, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, theme };
    } catch (error) {
      console.error('Get theme error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('theme')
  @UseGuards(JwtAuthGuard)
  async updateTheme(
    @Body() body: { theme: string },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { theme } = body;
      if (!theme || !['light', 'dark'].includes(theme)) {
        return {
          success: false,
          error: 'Invalid theme',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      const { error } = await this.supabaseService
        .getClient()
        .from('users')
        .update({ theme })
        .eq('user_id', req.user.id);

      if (error) {
        return {
          success: false,
          error: 'Failed to update theme',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      res.cookie('theme', theme, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, theme };
    } catch (error) {
      console.error('Update theme error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('sidebar')
  @UseGuards(JwtAuthGuard)
  async getSidebarSettings(@Req() req: AuthenticatedRequest) {
    try {
      const { data: settingsData, error } = await this.supabaseService
        .getClient()
        .from('user_settings')
        .select('sidebar_pinned, sidebar_width')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        console.error('Get sidebar settings error:', error);
        return {
          success: false,
          error: 'Failed to fetch sidebar settings',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { 
        success: true, 
        sidebar_pinned: settingsData?.sidebar_pinned || false,
        sidebar_width: settingsData?.sidebar_width || 234
      };
    } catch (error) {
      console.error('Get sidebar settings error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('sidebar')
  @UseGuards(JwtAuthGuard)
  async updateSidebarSettings(
    @Body() body: { sidebar_pinned?: boolean; sidebar_width?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const { sidebar_pinned, sidebar_width } = body;
      
      // Валидация данных
      if (sidebar_pinned !== undefined && typeof sidebar_pinned !== 'boolean') {
        return {
          success: false,
          error: 'Invalid sidebar_pinned value',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      if (sidebar_width !== undefined && (typeof sidebar_width !== 'number' || sidebar_width < 150 || sidebar_width > 700)) {
        return {
          success: false,
          error: 'Invalid sidebar_width value',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Готовим объект для обновления - УБРАЛИ updated_at
      const updateData: any = {};

      if (sidebar_pinned !== undefined) {
        updateData.sidebar_pinned = sidebar_pinned;
      }

      if (sidebar_width !== undefined) {
        updateData.sidebar_width = sidebar_width;
      }

      console.log('Updating sidebar settings:', { user_id: req.user.id, updateData });

      const { error } = await this.supabaseService
        .getClient()
        .from('user_settings')
        .update(updateData)
        .eq('user_id', req.user.id);

      if (error) {
        console.error('Update sidebar settings error:', error);
        return {
          success: false,
          error: 'Failed to update sidebar settings',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      console.log('Sidebar settings updated successfully');

      return { 
        success: true, 
        settings: {
          sidebar_pinned,
          sidebar_width
        }
      };
    } catch (error) {
      console.error('Update sidebar settings error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }
}