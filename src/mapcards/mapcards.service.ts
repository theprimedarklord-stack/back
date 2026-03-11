import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class MapCardsService {
  constructor(private readonly supabase: SupabaseService) { }

  async findAll() {
    // Получаем клиент, который уже проинициализирован контекстом тенанта (rls-context.interceptor.ts)
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('map_cards')
      .select('*');

    if (error) {
      throw new InternalServerErrorException(`Supabase Error: ${error.message}`);
    }

    return data;
  }
}
