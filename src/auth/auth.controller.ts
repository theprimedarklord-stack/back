import { Response } from 'express';
import { Res, Req } from '@nestjs/common';
import { Body, Controller, Post, Get, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UseGuards } from '@nestjs/common';


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
        console.log("result.access_token + ",result.access_token)


      res.cookie('access_token', result.access_token, {
        httpOnly: true,
        secure: true, // всегда true для кросс-доменных запросов
        sameSite: 'none', // всегда 'none' для кросс-доменных запросов
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
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    console.log('Request user:', req.user);
    if (!req.user) {
      return { success: false, error: 'Не авторизован' };
    }
    try {
      const { data: userData } = await this.supabaseService.getClient()
        .from('users')
        .select('*')
        .eq('user_id', req.user.id)
        .single();
        
      return {
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          ...userData
        }
      };
    } catch (error) {
      console.error('Profile error:', error);
      return { success: false, error: 'Ошибка загрузки профиля' };
    }
  }
}