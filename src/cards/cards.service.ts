import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DatabaseService } from '../db/database.service';

/**
 * CardsService — refactored to use DatabaseService.withUserContext for RLS compliance
 * 
 * All methods now use withUserContext to establish proper RLS session context
 * before executing SQL queries against the database.
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly databaseService: DatabaseService,
  ) { }

  /**
   * Get all cards for a user using proper RLS context
   */
  async getCards(userId: string) {
    try {
      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
          const sql = `
            SELECT id, user_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
            FROM public.cards
            WHERE user_id = $1::uuid
            ORDER BY created_at DESC
          `;
          this.logger.debug(`Executing SQL: ${sql} with userId=${userId}`);
          const res = await client.query(sql, [userId]);
          return res.rows;
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          // Fall through to Supabase
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase admin client if withUserContext fails
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('cards')
          .select('*')
          .eq('user_id', userId);

        if (supabaseError) {
          throw new InternalServerErrorException(supabaseError.message);
        }
        return data;
      } catch (fallbackError) {
        this.logger.error('getCards failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to fetch cards');
      }
    }
  }

  /**
   * Create a new card using proper RLS context
   */
  async createCard(userId: string, cardData: any) {
    try {
      const createdAt = new Date().toISOString();

      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
          const sql = `
            INSERT INTO public.cards (user_id, name, description, card_class, zone, current_streak, created_at, last_edited_at)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
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
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const newCard = {
          user_id: userId,
          ...cardData,
          current_streak: 0,
          created_at: new Date().toISOString(),
          last_edited_at: new Date().toISOString(),
        };

        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('cards')
          .insert(newCard)
          .select()
          .single();

        if (supabaseError) {
          throw new InternalServerErrorException(supabaseError.message);
        }
        return data;
      } catch (fallbackError) {
        this.logger.error('createCard failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to create card');
      }
    }
  }

  /**
   * Update card and handle streak logic using proper RLS context
   */
  async updateCard(userId: string, id: string, cardData: any) {
    try {
      const updatedAt = new Date().toISOString();

      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
          let streakValue = cardData.current_streak;

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
              last_edited_at = $8
            WHERE id = $1::uuid AND user_id = $2::uuid
            RETURNING id, user_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
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
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const updateData: any = {
          ...cardData,
          last_edited_at: new Date().toISOString(),
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

        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('cards')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single();

        if (supabaseError) {
          throw new InternalServerErrorException(supabaseError.message);
        }
        return data;
      } catch (fallbackError) {
        this.logger.error('updateCard failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to update card');
      }
    }
  }

  /**
   * Delete card by id using proper RLS context
   */
  async deleteCard(userId: string, id: string) {
    try {
      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
          const sql = `
            DELETE FROM public.cards WHERE id = $1::uuid AND user_id = $2::uuid
            RETURNING id
          `;
          const res = await client.query(sql, [id, userId]);
          return res.rows.length > 0;
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const { error: supabaseError } = await this.supabaseService
          .getClient()
          .from('cards')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (supabaseError) {
          throw new InternalServerErrorException(supabaseError.message);
        }
        return true;
      } catch (fallbackError) {
        this.logger.error('deleteCard failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to delete card');
      }
    }
  }

  /**
   * Get card history (reviews) for a user in a zone using proper RLS context
   */
  async getCardHistory(userId: string, zoneId: string, hours: number = 24) {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);
      const startTimeIso = startTime.toISOString();

      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
          const sql = `
            SELECT id, user_id, current_zone, started_at, finished_at, correct_answers, wrong_answers
            FROM public.card_reviews
            WHERE user_id = $1::uuid AND current_zone = $2 AND started_at >= $3
            ORDER BY started_at DESC
          `;
          const res = await client.query(sql, [userId, zoneId, startTimeIso]);
          return res.rows;
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const startTime = new Date();
        startTime.setHours(startTime.getHours() - hours);
        const startTimeIso = startTime.toISOString();

        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('card_reviews')
          .select('*')
          .eq('user_id', userId)
          .eq('current_zone', zoneId)
          .gte('started_at', startTimeIso)
          .order('started_at', { ascending: false });

        if (supabaseError) {
          throw new InternalServerErrorException(supabaseError.message);
        }
        return data;
      } catch (fallbackError) {
        this.logger.error('getCardHistory failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to fetch card history');
      }
    }
  }

  /**
   * Create a card review (session) using proper RLS context
   */
  async createCardReview(userId: string, reviewData: any) {
    try {
      const now = new Date().toISOString();

      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
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
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const newReview = {
          user_id: userId,
          ...reviewData,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        };

        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('card_reviews')
          .insert(newReview)
          .select()
          .single();

        if (supabaseError) {
          throw new InternalServerErrorException(supabaseError.message);
        }
        return data;
      } catch (fallbackError) {
        this.logger.error('createCardReview failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to create card review');
      }
    }
  }

  /**
   * Get card by id using proper RLS context
   */
  async getCardById(cardId: string, userId: string) {
    try {
      return await this.databaseService.withUserContext(userId, async (client) => {
        try {
          const sql = `
            SELECT id, user_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
            FROM public.cards
            WHERE id = $1::uuid AND user_id = $2::uuid
          `;
          const res = await client.query(sql, [cardId, userId]);
          return res.rows[0] || null;
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
          throw sqlError;
        }
      });
    } catch (error) {
      // Fallback to Supabase admin client
      this.logger.warn('withUserContext failed, using Supabase fallback', error);
      try {
        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('cards')
          .select('*')
          .eq('id', cardId)
          .eq('user_id', userId)
          .single();

        if (supabaseError) {
          // If not found, return null instead of throwing
          if (supabaseError.code === 'PGRST116') {
            return null;
          }
          throw new InternalServerErrorException(supabaseError.message);
        }
        return data;
      } catch (fallbackError) {
        this.logger.error('getCardById failed completely', fallbackError);
        throw fallbackError instanceof InternalServerErrorException
          ? fallbackError
          : new InternalServerErrorException('Failed to fetch card');
      }
    }
  }
}
