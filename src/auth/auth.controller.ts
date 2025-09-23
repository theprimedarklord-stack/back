// src/auth/auth.controller.ts
import { Response } from 'express';
import { Res, Req, Body, Patch, Controller, Post, Get, HttpStatus, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { LoginDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get('user_list')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getAllUsers(@Req() req) {
    try {
      // Перевіряємо, чи є користувач адміністратором
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

      // Отримуємо список усіх користувачів
      const { data: users, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('user_id, email, username, role');

      if (error) {
        console.error('Помилка отримання користувачів:', error);
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
    @Req() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      // Логирование для диагностики
      console.log('=== LOGIN REQUEST DEBUG ===');
      console.log('Content-Type header:', req.headers['content-type']);
      console.log('Accept-Encoding header:', req.headers['accept-encoding']);
      console.log('User-Agent header:', req.headers['user-agent']);
      console.log('Content-Length header:', req.headers['content-length']);
      console.log('Raw body received:', JSON.stringify(body, null, 2));
      console.log('Body type:', typeof body);
      console.log('Body keys:', Object.keys(body || {}));
      console.log('Body.email value:', body?.email);
      console.log('Body.password value:', body?.password ? '[HIDDEN - length: ' + body.password.length + ']' : 'undefined');
      console.log('Body.rememberMe value:', body?.rememberMe);
      console.log('Request method:', req.method);
      console.log('Request URL:', req.url);
      console.log('Request IP:', req.ip);
      console.log('Request headers (all):', JSON.stringify(req.headers, null, 2));
      
      // Проверяем, что body содержит необходимые поля
      if (!body || !body.email || !body.password) {
        console.error('=== VALIDATION ERROR ===');
        console.error('Body is null/undefined:', !body);
        console.error('Email present:', !!body?.email);
        console.error('Password present:', !!body?.password);
        console.error('Email value:', body?.email);
        console.error('Password value:', body?.password ? '[HIDDEN]' : 'undefined');
        console.error('Full body:', JSON.stringify(body, null, 2));
        console.error('========================');
        throw new BadRequestException('Отсутствуют обязательные поля: email и password');
      }
      
      console.log('=== VALIDATION PASSED ===');
      console.log('Email:', body.email);
      console.log('Password length:', body.password.length);
      console.log('RememberMe:', body.rememberMe);
      console.log('==========================');
      console.log('================================');

      const result = await this.authService.login(body.email, body.password);
      
  
      if (!result.access_token) {
        throw new InternalServerErrorException('Access token not returned from auth service');
      }
  
      const isProd = process.env.NODE_ENV === 'production';
      const maxAge = body.rememberMe ? 30 * 24 * 60 * 60 : 60 * 60; // 30 дней или 1 час
  
      res.cookie('access_token', result.access_token, {
        httpOnly: true,
        secure: isProd, // true в продакшене
        sameSite: isProd ? 'none' : 'lax', // 'none' в продакшене для кросс-доменных запросов
        maxAge: maxAge * 1000, // В миллисекундах
        path: '/',
      });
  

  
      return {
        success: true,
        theme: result.theme,
        user_id: result.user_id,
      };
    } catch (error) {
      console.error('Login error:', error.message, error.stack);
      throw error; // Позволяем AllExceptionsFilter обработать ошибку
    }
  }

  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { user_id, access_token } = await this.authService.register(
        body.email,
        body.password,
        body.username,
      );

      res.cookie('access_token', access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, user_id };
    } catch (error) {
      console.error('Registration error:', error.message || error);
      return {
        success: false,
        error: error.message || 'Ошибка регистрации',
        status: HttpStatus.BAD_REQUEST,
      };
    }
  }

  @Post('logout')
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    try {

      const accessToken = req.cookies?.access_token;

      if (accessToken) {
        const { error } = await this.supabaseService.getClient().auth.signOut();
        if (error) {
          console.error('Supabase signOut error:', error.message);
          return {
            success: false,
            error: 'Ошибка при завершении сессии',
            status: HttpStatus.INTERNAL_SERVER_ERROR,
          };
        }
      }

      res.clearCookie('access_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
      });



      return { success: true, message: 'Выход выполнен успешно' };
    } catch (error) {
      console.error('Logout error:', error.message);
      return {
        success: false,
        error: 'Ошибка при выходе',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {

    if (!req.user) {
      return { success: false, error: 'Не авторизован' };
    }

    try {
      const supabase = this.supabaseService.getAdminClient();

      // Получаем данные из таблицы users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      if (userError) {
        console.error('User data error:', userError);
        throw new InternalServerErrorException('Ошибка загрузки данных пользователя');
      }

      // Получаем данные из таблицы user_settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      if (settingsError) {
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
          settings: settingsData, // Добавляем настройки пользователя
        },
      };
    } catch (error) {
      console.error('Profile error:', error);
      return { success: false, error: 'Ошибка загрузки профиля' };
    }
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req, @Body() body: { userId: string; settings?: any }) {
    try {

      
      const supabase = this.supabaseService.getAdminClient();

      if (body.settings) {
        // Сначала получаем текущие настройки
        const { data: currentSettings, error: fetchError } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', req.user.id)
          .single();

        if (fetchError) {
          console.error('Ошибка получения текущих настроек:', fetchError);
          throw new InternalServerErrorException('Ошибка получения настроек');
        }

        // Объединяем текущие настройки с новыми (частичное обновление)
        const updatedSettings = {
          ...currentSettings,
          ...body.settings,
          // Обновляем временную метку
          updated_at: new Date().toISOString()
        };

        // Обновляем настройки в БД
        const { error: updateError } = await this.supabaseService
          .getAdminClient()
          .from('user_settings')
          .update(updatedSettings)
          .eq('user_id', req.user.id);

        if (updateError) {
          console.error('Ошибка обновления настроек:', updateError);
          throw new InternalServerErrorException('Ошибка обновления настроек');
        }


      }

      return { success: true, message: 'Настройки обновлены' };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Ошибка обновления настроек' };
    }
  }
}