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
  try {
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
  console.log('=== STEP 1: Checking user existence ===');
  console.log('Querying users table for email:', email);
  
  const { data: userCheck, error: userError } = await admin
    .from('users') // Прямой запрос к таблице auth.users в Supabase
    .select('id')
    .eq('email', email)
    .single();

  console.log('User check result:', { userCheck, userError });
  console.log('User exists:', !!userCheck);
  console.log('User error:', userError);

  if (userError || !userCheck) {
    console.log('=== USER NOT FOUND ERROR ===');
    console.log('UserError:', userError);
    console.log('UserCheck:', userCheck);
    console.log('============================');
    throw new BadRequestException('Неверный email'); // Конкретная ошибка: email не существует
  }
  
  console.log('User found successfully, proceeding to password check');

  // Шаг 2: Проверяем пароль
  console.log('=== STEP 2: Checking password with Supabase ===');
  console.log('Attempting Supabase signInWithPassword...');
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  console.log('Supabase auth result:', { 
    hasData: !!data, 
    hasError: !!error,
    errorMessage: error?.message,
    userId: data?.user?.id 
  });

  if (error) {
    console.log('=== SUPABASE AUTH ERROR ===');
    console.log('Error message:', error.message);
    console.log('Error code:', error.status);
    console.log('Full error:', error);
    console.log('===========================');
    
    if (error.message === 'Invalid login credentials') {
      throw new BadRequestException('Неверный пароль'); // Конкретная ошибка: пароль неверный
    }
    throw new InternalServerErrorException(error.message);
  }
  
  console.log('Supabase authentication successful');

  // Проверяем, что пользователь успешно аутентифицирован
  console.log('=== STEP 3: Validating user data ===');
  console.log('User data from Supabase:', { 
    id: data.user?.id, 
    email: data.user?.email,
    confirmed_at: data.user?.confirmed_at 
  });
  
  if (!data.user) {
    console.log('=== USER DATA MISSING ERROR ===');
    console.log('No user data returned from Supabase');
    console.log('================================');
    throw new BadRequestException('Не удалось выполнить вход: пользователь не найден');
  }

  // Проверяем подтверждение email (если включено в Supabase)
  if (data.user && !data.user.confirmed_at) {
    console.log('=== EMAIL NOT CONFIRMED ERROR ===');
    console.log('User email not confirmed:', data.user.email);
    console.log('Confirmed at:', data.user.confirmed_at);
    console.log('=================================');
    throw new BadRequestException('Email не подтвержден');
  }
  
  console.log('User validation passed, fetching additional data');

  // Получаем дополнительные данные пользователя
  console.log('=== STEP 4: Fetching user additional data ===');
  console.log('Querying users table for user_id:', data.user.id);
  
  const { data: userData, error: userErrorData } = await admin
    .from('users')
    .select('theme, role, username')
    .eq('user_id', data.user.id)
    .single();

  console.log('User additional data result:', { userData, userErrorData });

  if (userErrorData) {
    console.log('=== USER DATA FETCH ERROR ===');
    console.log('Error fetching user data:', userErrorData);
    console.log('=============================');
    throw new InternalServerErrorException('Ошибка загрузки данных пользователя');
  }
  
  console.log('User additional data fetched successfully');

  // Генерируем JWT токен
  console.log('=== STEP 5: Generating JWT token ===');
  console.log('JWT payload:', { 
    id: data.user.id, 
    email: data.user.email, 
    role: userData?.role || 'user' 
  });
  
  const payload = {
    id: data.user.id,
    email: data.user.email,
    role: userData?.role || 'user',
  };

  const expiresIn = '30d';
  const access_token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
  
  console.log('JWT token generated successfully');
  console.log('Token length:', access_token.length);

  const result = {
    success: true,
    theme: userData?.theme || 'light',
    access_token,
    user_id: data.user.id,
  };
  
  console.log('=== LOGIN SUCCESS ===');
  console.log('Returning result:', { 
    success: result.success, 
    theme: result.theme, 
    user_id: result.user_id,
    hasToken: !!result.access_token 
  });
  console.log('====================');
  
  return result;
  } catch (error) {
    console.log('=== AUTH SERVICE LOGIN ERROR ===');
    console.log('Error type:', error?.constructor?.name);
    console.log('Error message:', error?.message);
    console.log('Error stack:', error?.stack);
    console.log('Full error:', error);
    console.log('================================');
    throw error; // Перебрасываем ошибку дальше
  }
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