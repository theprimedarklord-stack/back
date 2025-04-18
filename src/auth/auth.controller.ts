import { Response } from 'express';
import { Res, Req } from '@nestjs/common';
import { Body, Controller, Post, Get, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService // Добавили инъекцию SupabaseService
  ) {}

  @Post('login')
  async login(
    @Body() body: { email: string; password: string; rememberMe: boolean },
    @Res({ passthrough: true }) res: Response
  ) {
    try {
      const result = await this.authService.login(body.email, body.password);
  
      const maxAge = body.rememberMe
        ? 30 * 24 * 60 * 60 // 30 дней
        : 60 * 60; // 1 час
  
      res.cookie('access_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: maxAge * 1000,
        path: '/',
      });
  
      return {
        success: true,
        theme: result.theme,
        user_id: result.user_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return { success: true };
  }

  @Get('profile')
  async getProfile(@Req() req) {
    const user = req['user'];
    
    if (!user) {
      return {
        success: false,
        error: 'Не авторизован'
      };
    }
    
    // Теперь можем использовать this.supabaseService
    const supabase = this.supabaseService.getClient();
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', user.id)
      .single();
      
    if (userError) {
      return {
        success: false,
        error: 'Ошибка получения данных пользователя'
      };
    }
    
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        ...userData
      }
    };
  }
}