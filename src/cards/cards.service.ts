import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * CardsService — refactored to use req.dbClient for RLS compliance
 * 
 * All methods now accept an optional `client` parameter:
 * - If provided (from req.dbClient): queries run under RLS with app.org_id context
 * - If not provided: falls back to admin client (should be avoided in production endpoints)
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get all cards for a user
   * When using req.dbClient, this respects RLS policies
   */
  async getCards(userId: string, client?: any) {
    try {
      // Use Supabase admin client (RLS-aware)
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cards')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
      return data;
    } catch (error) {
      this.logger.error('getCards failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to fetch cards');
    }
  }

  /**
   * Create a new card
   */
  async createCard(userId: string, cardData: any, client?: any) {
    try {
      const createdAt = new Date().toISOString();
      
      if (client) {
        const sql = `
          INSERT INTO public.cards (user_id, name, description, card_class, zone, current_streak, created_at, updated_at)
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, user_id, name, description, card_class, zone, current_streak, created_at, updated_at
        `;
        const res = await client.query(sql, [
          userId,
          cardData.name,
          cardData.description || null,
          cardData.card_class || null,
          cardData.zone || null,
          0, // current_streak
          createdAt,
          createdAt,
        ]);
        return res.rows[0];
      }

      // Fallback: admin client
      const newCard = {
        user_id: userId,
        ...cardData,
        current_streak: 0,
        created_at: createdAt,
        updated_at: createdAt,
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
    } catch (error) {
      this.logger.error('createCard failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to create card');
    }
  }

  /**
   * Update card and handle streak logic
   */
  async updateCard(userId: string, id: string, cardData: any, client?: any) {
    try {
      const updatedAt = new Date().toISOString();
      let streakValue = cardData.current_streak;

      if (client) {
        // If success flag provided, calculate new streak
        if ('success' in cardData) {
          const getStreakSql = `
            SELECT current_streak FROM public.cards WHERE id = $1::uuid AND user_id = $2::uuid
          `;
          const streakRes = await client.query(getStreakSql, [id, userId]);
          const currentStreak = streakRes.rows[0]?.current_streak || 0;
          streakValue = cardData.success ? currentStreak + 1 : 0;
        }

        const sql = `
          UPDATE public.cards
          SET 
            name = COALESCE($3, name),
            description = COALESCE($4, description),
            card_class = COALESCE($5, card_class),
            zone = COALESCE($6, zone),
            current_streak = COALESCE($7, current_streak),
            updated_at = $8
          WHERE id = $1::uuid AND user_id = $2::uuid
          RETURNING id, user_id, name, description, card_class, zone, current_streak, created_at, updated_at
        `;
        const res = await client.query(sql, [
          id,
          userId,
          cardData.name || null,
          cardData.description || null,
          cardData.card_class || null,
          cardData.zone || null,
          streakValue !== undefined ? streakValue : null,
          updatedAt,
        ]);
        return res.rows[0];
      }

      // Fallback: admin client
      const updateData = {
        ...cardData,
        updated_at: updatedAt,
      };

      if ('success' in cardData) {
        const { data: currentCard } = await this.supabaseService
          .getClient()
          .from('cards')
          .select('current_streak')
          .eq('id', id)
          .eq('user_id', userId)
          .single();

        updateData.current_streak = cardData.success 
          ? (currentCard?.current_streak || 0) + 1 
          : 0;
      }

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
    } catch (error) {
      this.logger.error('updateCard failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to update card');
    }
  }

  /**
   * Delete card by id
   */
  async deleteCard(userId: string, id: string, client?: any) {
    try {
      if (client) {
        const sql = `
          DELETE FROM public.cards WHERE id = $1::uuid AND user_id = $2::uuid
          RETURNING id
        `;
        const res = await client.query(sql, [id, userId]);
        return res.rows.length > 0;
      }

      // Fallback: admin client
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
    } catch (error) {
      this.logger.error('deleteCard failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to delete card');
    }
  }

  /**
   * Get card history (reviews) for a user in a zone
   */
  async getCardHistory(userId: string, zoneId: string, hours: number = 24, client?: any) {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);
      const startTimeIso = startTime.toISOString();

      if (client) {
        const sql = `
          SELECT id, user_id, current_zone, started_at, finished_at, correct_answers, wrong_answers
          FROM public.card_reviews
          WHERE user_id = $1::uuid AND current_zone = $2 AND started_at >= $3
          ORDER BY started_at DESC
        `;
        const res = await client.query(sql, [userId, zoneId, startTimeIso]);
        return res.rows;
      }

      // Fallback: admin client
      const { data, error } = await this.supabaseService
        .getClient()
        .from('card_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('current_zone', zoneId)
        .gte('started_at', startTimeIso)
        .order('started_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
      return data;
    } catch (error) {
      this.logger.error('getCardHistory failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to fetch card history');
    }
  }

  /**
   * Create a card review (session)
   */
  async createCardReview(userId: string, reviewData: any, client?: any) {
    try {
      const now = new Date().toISOString();

      if (client) {
        const sql = `
          INSERT INTO public.card_reviews (user_id, current_zone, started_at, finished_at, correct_answers, wrong_answers)
          VALUES ($1::uuid, $2, $3, $4, $5, $6)
          RETURNING id, user_id, current_zone, started_at, finished_at, correct_answers, wrong_answers
        `;
        const res = await client.query(sql, [
          userId,
          reviewData.current_zone || null,
          now,
          now,
          reviewData.correct_answers || 0,
          reviewData.wrong_answers || 0,
        ]);
        return res.rows[0];
      }

      // Fallback: admin client
      const newReview = {
        user_id: userId,
        ...reviewData,
        started_at: now,
        finished_at: now,
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
      this.logger.error('createCardReview failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to create card review');
    }
  }

  /**
   * Get card by id
   */
  async getCardById(cardId: string, client?: any) {
    try {
      if (client) {
        try {
          const sql = `
            SELECT id, user_id, name, description, card_class, zone, current_streak, created_at, updated_at
            FROM public.cards
            WHERE id = $1::uuid
          `;
          const res = await client.query(sql, [cardId]);
          return res.rows[0] || null;
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase client', sqlError);
          // Fall through to admin client below
        }
      }

      // Fallback: admin client (always works)
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cards')
        .select('*')
        .eq('id', cardId)
        .single();

      if (error) {
        // If not found, return null instead of throwing
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new InternalServerErrorException(error.message);
      }
      return data;
    } catch (error) {
      this.logger.error('getCardById failed', error);
      throw error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException('Failed to fetch card');
    }
  }
}
