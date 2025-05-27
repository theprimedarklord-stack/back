import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CardsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getCards(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cards')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async createCard(userId: string, cardData: any) {
    const newCard = {
      user_id: userId,
      ...cardData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('cards')
      .insert(newCard)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async updateCard(userId: string, id: string, cardData: any) {
    const updateData = {
      ...cardData,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('cards')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async deleteCard(userId: string, id: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('cards')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return true;
  }
}
