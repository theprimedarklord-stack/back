import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateMapCardDto } from './dto/create-mapcard.dto';

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

  async create(dto: CreateMapCardDto, userId: string, orgId: string) {
    const client = this.supabase.getClient(); // Інтерцептор вже застосував RLS-контекст

    const { data, error } = await client
      .from('map_cards')
      .insert([{
        ...dto,
        user_id: userId,
        organization_id: orgId
      }])
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Supabase Insert Error: ${error.message}`);
    }

    return data;
  }
}
