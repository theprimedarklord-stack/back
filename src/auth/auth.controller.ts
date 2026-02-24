// src/auth/auth.controller.ts
import { Response } from 'express';
import {
  Res,
  Req,
  Body,
  Patch,
  Controller,
  Post,
  Get,
  HttpStatus,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { UseGuards } from '@nestjs/common';
import { LoginDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) { }

  @Get('user_list')
  @UseGuards(CognitoAuthGuard)
  async getUserList() {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('user_id, email, username, avatar_url');
      if (error) {
        return {
          success: false,
          error: 'Ошибка получения пользователей',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }
      return { success: true, users: data };
    } catch (error) {
      console.error('Ошибка при получении user_list:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('users')
  @UseGuards(CognitoAuthGuard)
  async getAllUsers(@Req() req) {
    try {
      const { data: userData, error: userError } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('role')
        .eq('user_id', req.user.id)
        .single();

      if (userError || userData?.role !== 'admin') {
        return {
          success: false,
          error: 'Доступ заборонено: потрібна роль адміністратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      const { data: users, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('user_id, email, username, role');

      if (error) {
        return {
          success: false,
          error: 'Не вдалося отримати список користувачів',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { success: true, users };
    } catch (error) {
      console.error('Серверна помилка при отриманні користувачів:', error);
      return {
        success: false,
        error: 'Серверна помилка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      if (!body || !body.email || !body.password) {
        throw new BadRequestException('Отсутствуют обязательные поля: email и password');
      }

      const result = await this.authService.login(body.email, body.password);

      if (!result.accessToken) {
        throw new InternalServerErrorException('Access token not returned from auth service');
      }

      const maxAge = body.rememberMe ? 30 * 24 * 60 * 60 : 60 * 60; // 30 days or 1 hour

      const cookieOptions = {
        httpOnly: true,
        secure: true, // Обязательно true для HTTPS (Особенно на Render)
        sameSite: 'none' as const, // Обязательно 'none' для кросс-доменных кук
        path: '/',
      };

      // Set Cognito access_token as HttpOnly cookie
      // res.cookie('access_token', result.accessToken, {
      res.cookie('access_token', result.idToken, {
        ...cookieOptions,
        maxAge: maxAge * 1000,
      });

      // Set refresh_token as HttpOnly cookie (longer lived)
      if (result.refreshToken) {
        res.cookie('refresh_token', result.refreshToken, {
          ...cookieOptions,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
      }

      return {
        success: true,
        theme: result.theme,
        user_id: result.user_id,
      };
    } catch (error) {
      console.error('Login error:', error.message);
      throw error;
    }
  }

  @Post('register')
  async register(@Body() body: RegisterDto) {
    try {
      const result = await this.authService.register(
        body.email,
        body.password,
        body.username,
      );

      return {
        success: true,
        userConfirmed: result.userConfirmed,
        message: result.message,
      };
    } catch (error) {
      console.error('Registration error:', error.message || error);
      throw error;
    }
  }

  @Post('confirm')
  async confirmSignUp(@Body() body: { email: string; code: string }) {
    try {
      if (!body.email || !body.code) {
        throw new BadRequestException('Email и код подтверждения обязательны');
      }

      const result = await this.authService.confirmSignUp(body.email, body.code);
      return result;
    } catch (error) {
      console.error('Confirm error:', error.message);
      throw error;
    }
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      path: '/',
    };

    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
    res.clearCookie('active_org_id', cookieOptions);

    return { success: true, message: 'Выход выполнен успешно' };
  }

  @Get('profile')
  @UseGuards(CognitoAuthGuard)
  async getProfile(@Req() req) {
    if (!req.user) {
      return { success: false, error: 'Не авторизован' };
    }

    try {
      const supabase = this.supabaseService.getAdminClient();

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      if (userError) {
        console.error('User data error:', userError);
        throw new InternalServerErrorException('Ошибка загрузки данных пользователя');
      }

      let { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      // If no settings row exists — auto-create default one (self-heal for old users)
      if (settingsError && settingsError.code === 'PGRST116') {
        const { data: newSettings, error: insertError } = await supabase
          .from('user_settings')
          .insert({ user_id: req.user.id })
          .select('*')
          .single();

        if (insertError) {
          console.error('Failed to auto-create user_settings:', insertError);
          throw new InternalServerErrorException('Ошибка загрузки настроек пользователя');
        }
        settingsData = newSettings;
        settingsError = null;
      } else if (settingsError) {
        console.error('Settings data error:', settingsError);
        throw new InternalServerErrorException('Ошибка загрузки настроек пользователя');
      }

      return {
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          role: userData?.role || 'user',
          ...userData,
          settings: settingsData,
        },
      };
    } catch (error) {
      console.error('Profile error:', error);
      return { success: false, error: 'Ошибка загрузки профиля' };
    }
  }

  @Patch('profile')
  @UseGuards(CognitoAuthGuard)
  async updateProfile(@Req() req, @Body() body: { userId: string; settings?: any }) {
    try {
      const supabase = this.supabaseService.getAdminClient();

      if (body.settings) {
        const { data: currentSettings, error: fetchError } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', req.user.id)
          .single();

        if (fetchError && fetchError.code === 'PGRST116') {
          // No settings row yet — create one with the provided settings
          const { error: insertError } = await supabase
            .from('user_settings')
            .insert({
              user_id: req.user.id,
              ...body.settings,
              updated_at: new Date().toISOString(),
            });

          if (insertError) {
            console.error('Ошибка создания настроек:', insertError);
            throw new InternalServerErrorException('Ошибка создания настроек');
          }
        } else if (fetchError) {
          console.error('Ошибка получения текущих настроек:', fetchError);
          throw new InternalServerErrorException('Ошибка получения настроек');
        } else {
          const updatedSettings = {
            ...currentSettings,
            ...body.settings,
            updated_at: new Date().toISOString(),
          };

          const { error: updateError } = await supabase
            .from('user_settings')
            .update(updatedSettings)
            .eq('user_id', req.user.id);

          if (updateError) {
            console.error('Ошибка обновления настроек:', updateError);
            throw new InternalServerErrorException('Ошибка обновления настроек');
          }
        }
      }

      return { success: true, message: 'Настройки обновлены' };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Ошибка обновления настроек' };
    }
  }
}