// src/auth/auth.controller.ts
import {
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
  async login(@Body() body: LoginDto) {
    try {
      if (!body || !body.email || !body.password) {
        throw new BadRequestException('Отсутствуют обязательные поля: email и password');
      }

      const result = await this.authService.login(body.email, body.password);

      if (!result.accessToken) {
        throw new InternalServerErrorException('Access token not returned from auth service');
      }

      // Возвращаем токены в формате JSON.
      // NestJS больше не трогает куки! BFF сам их прочитает и сохранит.
      return {
        success: true,
        theme: result.theme,
        user_id: result.user_id,
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
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
  async logout() {
    // Куки не трогаем — BFF сам удалит auth_acc_{sub}_access при вызове этого эндпоинта.
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
          ...userData,
          id: req.user.id || (userData && userData.user_id),
          email: req.user.email || (userData && userData.email),
          role: userData?.role || 'user',
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