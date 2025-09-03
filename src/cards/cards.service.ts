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

  async getCardHistory(userId: string, zoneId: string, hours: number = 24) {
    try {
      // Розраховуємо час початку (скільки годин назад)
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('card_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('current_zone', zoneId)
        .gte('started_at', startTime.toISOString())
        .order('started_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return data;
    } catch (error) {
      throw new InternalServerErrorException(`Помилка отримання історії карток: ${error.message}`);
    }
  }

  async createCardReview(userId: string, reviewData: any) {
    try {
      const newReview = {
        user_id: userId,
        ...reviewData,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabaseService
        .getClient()
        .from('card_reviews')
        .insert(newReview)
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return data;
    } catch (error) {
      throw new InternalServerErrorException(`Помилка створення review карточки: ${error.message}`);
    }
  }

  async getCardById(cardId: string) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cards')
        .select('id, name, description, card_class, zone')
        .eq('id', cardId)
        .single();

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return data;
    } catch (error) {
      throw new InternalServerErrorException(`Помилка отримання картки: ${error.message}`);
    }
  }
}
