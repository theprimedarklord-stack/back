// src/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

// src/auth/auth.service.ts
async login(email: string, password: string) {
  console.log('=== AUTH SERVICE LOGIN DEBUG ===');
  console.log('Email received:', email);
  console.log('Password received:', password ? '[HIDDEN - length: ' + password.length + ']' : 'undefined');
  console.log('Email type:', typeof email);
  console.log('Password type:', typeof password);
  console.log('Email is empty:', !email || email.trim() === '');
  console.log('Password is empty:', !password || password.trim() === '');
  console.log('================================');
  
  const supabase = this.supabaseService.getClient();
  const admin = this.supabaseService.getAdminClient();

  // Шаг 1: Проверяем, существует ли пользователь с таким email
  const { data: userCheck, error: userError } = await admin
    .from('users') // Прямой запрос к таблице auth.users в Supabase
    .select('id')
    .eq('email', email)
    .single();

  if (userError || !userCheck) {
    throw new BadRequestException('Неверный email'); // Конкретная ошибка: email не существует
  }

  // Шаг 2: Проверяем пароль
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });


  if (error) {
    if (error.message === 'Invalid login credentials') {
      throw new BadRequestException('Неверный пароль'); // Конкретная ошибка: пароль неверный
    }
    throw new InternalServerErrorException(error.message);
  }

  // Проверяем, что пользователь успешно аутентифицирован
  if (!data.user) {
    throw new BadRequestException('Не удалось выполнить вход: пользователь не найден');
  }

  // Проверяем подтверждение email (если включено в Supabase)
  if (data.user && !data.user.confirmed_at) {
    throw new BadRequestException('Email не подтвержден');
  }

  // Получаем дополнительные данные пользователя
  const { data: userData, error: userErrorData } = await admin
    .from('users')
    .select('theme, role, username')
    .eq('user_id', data.user.id)
    .single();

  if (userErrorData) {
    throw new InternalServerErrorException('Ошибка загрузки данных пользователя');
  }

  // Генерируем JWT токен
  const payload = {
    id: data.user.id,
    email: data.user.email,
    role: userData?.role || 'user',
  };

  const expiresIn = '30d';
  const access_token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

  return {
    success: true,
    theme: userData?.theme || 'light',
    access_token,
    user_id: data.user.id,
  };
}

  async register(email: string, password: string, username: string) {
    const supabase = this.supabaseService.getClient();
    const admin = this.supabaseService.getAdminClient();

    // Проверка уникальности email
    const { data: existingEmail, error: emailError } = await admin
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingEmail) {
      throw new BadRequestException('Этот email уже зарегистрирован');
    }
    if (emailError && emailError.code !== 'PGRST116') {
      throw new InternalServerErrorException('Ошибка проверки email');
    }

    // Проверка уникальности username
    const { data: existingUsername, error: usernameError } = await admin
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUsername) {
      throw new BadRequestException('Это имя пользователя уже занято');
    }
    if (usernameError && usernameError.code !== 'PGRST116') {
      throw new InternalServerErrorException('Ошибка проверки имени пользователя');
    }

    // Регистрация в Supabase
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error || !data?.user) {
      throw new BadRequestException(error?.message || 'Регистрация не удалась');
    }

    // Вставка в таблицу users
    const { error: insertError } = await admin.from('users').insert({
      user_id: data.user.id,
      email,
      username,
      role: 'user',
      theme: 'light',
    });

    if (insertError) {
      throw new InternalServerErrorException('Ошибка при создании профиля пользователя');
    }

    const { error: insertSettingsError } = await admin.from('user_settings').insert({
      user_id: data.user.id,
    });

    if (insertSettingsError) {
     throw new InternalServerErrorException('Ошибка при создании настроек пользователя');
    }

    const payload = { id: data.user.id, email, role: 'user' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });

    return {
      success: true,
      user_id: data.user.id,
      access_token: token,
    };
  }
}