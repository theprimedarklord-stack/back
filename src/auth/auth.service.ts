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

    console.log('Supabase response:', { data, error });

    if (error?.message === 'Invalid login credentials') {
      throw new Error('Неверный email или пароль');
    }
    if (error) {
      throw new Error(error.message);
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('theme, role, username')
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

    const expiresIn = '30d'; // Токен живе 30 днів
    const access_token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
    console.log('Generated JWT token:', access_token); // Додаємо лог

    return {
      success: true,
      theme: userData?.theme || 'light',
      access_token,
      user_id: data.user.id,
    };
  }
}