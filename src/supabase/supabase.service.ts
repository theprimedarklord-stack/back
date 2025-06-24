// src/supabase/supabase.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private adminSupabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !anonKey) {
      throw new Error('SUPABASE_URL или SUPABASE_ANON_KEY не определены в переменных окружения.');
    }

    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY не определен в переменных окружения.');
    }

    // Клиент для обычных операций
    this.supabase = createClient(url, anonKey);
    
    // Админ клиент для операций с хранилищем (обходит RLS)
    this.adminSupabase = createClient(url, serviceRoleKey);
  }

  getClient() {
    return this.supabase;
  }

  // Метод для получения админ клиента (для операций с файлами)
  getAdminClient() {
    return this.adminSupabase;
  }
}