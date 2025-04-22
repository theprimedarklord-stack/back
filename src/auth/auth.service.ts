// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

  async login(email: string, password: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error?.message === 'Invalid login credentials') {
      throw new Error('Неверный email или пароль');
    }

    if (error) {
      throw new Error(error.message);
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('theme, role, username') // сразу подтяни все, что нужно
      .eq('user_id', data.user.id)
      .single();

    if (userError) {
      throw new Error('Ошибка загрузки данных пользователя');
    }

    const payload = {
      id: data.user.id,
      email: data.user.email,
      role: userData?.role || 'user',
    };

    const access_token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '30d', // или 1h — можешь выбирать
    });

    return {
      success: true,
      theme: userData?.theme || 'light',
      access_token,
      user_id: data.user.id,
    };
  }
}
