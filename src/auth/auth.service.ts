// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

  async login(email: string, password: string) {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('theme')
      .eq('user_id', data.user.id)
      .single();

    if (userError) {
      throw new Error('Failed to fetch user theme');
    }

    return {
      success: true,
      theme: userData?.theme || 'light',
    };
  }
}