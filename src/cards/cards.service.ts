import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DatabaseService } from '../db/database.service';

/**
 * CardsService — refactored for B2B multi-tenant isolation
 * 
 * All methods now accept orgId and use withUserContext(userId, orgId, callback)
 * to establish proper RLS session context (app.user_id + app.org_id).
 * SQL queries include organization_id in WHERE/INSERT for defense-in-depth.
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly databaseService: DatabaseService,
  ) { }

  /**
   * Get all cards for a user within an organization
   */
  async getCards(userId: string, orgId: string) {
    try {
      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          const sql = `
            SELECT id, user_id, organization_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
            FROM public.cards
            WHERE user_id = $1::uuid AND organization_id = $2::uuid
            ORDER BY created_at DESC
          `;
          this.logger.debug(`Executing SQL: ${sql} with userId=${userId}, orgId=${orgId}`);
          const res = await client.query(sql, [userId, orgId]);
          return res.rows;
        } catch (sqlError) {
          this.logger.warn('Direct SQL failed, falling back to Supabase', sqlError);
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
          .eq('user_id', userId)
          .eq('organization_id', orgId);

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
   * Create a new card within an organization
   */
  async createCard(userId: string, orgId: string, cardData: any) {
    // Игнорируем/удаляем createdAt от фронтенда, БД сама проставит время
    delete cardData.createdAt;
    delete cardData.created_at;

    try {
      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          const sql = `
            INSERT INTO public.cards (user_id, organization_id, name, description, card_class, zone, current_streak, last_edited_at)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, organization_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
          `;
          const res = await client.query(sql, [
            userId,
            orgId,
            cardData.name,
            cardData.description || null,
            cardData.card_class || null,
            cardData.zone || null,
            0, // current_streak
            new Date().toISOString(), // last_edited_at
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
          organization_id: orgId,
          name: cardData.name,
          description: cardData.description || null,
          card_class: cardData.card_class || null,
          zone: cardData.zone || null,
          current_streak: 0,
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
   * Update card and handle streak logic within an organization
   */
  async updateCard(userId: string, orgId: string, id: string, cardData: any) {
    try {
      const updatedAt = new Date().toISOString();

      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          let streakValue = cardData.current_streak;

          // If success flag provided, calculate new streak
          if ('success' in cardData) {
            const getStreakSql = `
              SELECT current_streak FROM public.cards
              WHERE id = $1::uuid AND user_id = $2::uuid AND organization_id = $3::uuid
            `;
            const streakRes = await client.query(getStreakSql, [id, userId, orgId]);
            const currentStreak = streakRes.rows[0]?.current_streak || 0;
            streakValue = cardData.success ? currentStreak + 1 : 0;
          }

          const sql = `
            UPDATE public.cards
            SET 
              name = COALESCE($4, name),
              description = COALESCE($5, description),
              card_class = COALESCE($6, card_class),
              zone = COALESCE($7, zone),
              current_streak = COALESCE($8, current_streak),
              last_edited_at = $9
            WHERE id = $1::uuid AND user_id = $2::uuid AND organization_id = $3::uuid
            RETURNING id, user_id, organization_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
          `;
          const res = await client.query(sql, [
            id,
            userId,
            orgId,
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
          last_edited_at: new Date().toISOString(),
        };
        if (cardData.name !== undefined) updateData.name = cardData.name;
        if (cardData.description !== undefined) updateData.description = cardData.description;
        if (cardData.card_class !== undefined) updateData.card_class = cardData.card_class;
        if (cardData.zone !== undefined) updateData.zone = cardData.zone;

        if ('success' in cardData) {
          const { data: currentCard } = await this.supabaseService
            .getClient()
            .from('cards')
            .select('current_streak')
            .eq('id', Number(id))
            .eq('user_id', userId)
            .eq('organization_id', orgId)
            .single();

          updateData.current_streak = cardData.success
            ? (currentCard?.current_streak || 0) + 1
            : 0;
        }

        const { data, error: supabaseError } = await this.supabaseService
          .getClient()
          .from('cards')
          .update(updateData)
          .eq('id', Number(id))
          .eq('user_id', userId)
          .eq('organization_id', orgId)
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
   * Delete card by id within an organization
   */
  async deleteCard(userId: string, orgId: string, id: string) {
    try {
      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          const sql = `
            DELETE FROM public.cards
            WHERE id = $1::uuid AND user_id = $2::uuid AND organization_id = $3::uuid
            RETURNING id
          `;
          const res = await client.query(sql, [id, userId, orgId]);
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
          .eq('id', Number(id))
          .eq('user_id', userId)
          .eq('organization_id', orgId);

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
   * Get card history (reviews) for a user in a zone within an organization
   */
  async getCardHistory(userId: string, orgId: string, zoneId: string, hours: number = 24) {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);
      const startTimeIso = startTime.toISOString();

      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          const sql = `
            SELECT id, user_id, organization_id, current_zone, started_at, finished_at, correct_answers, wrong_answers
            FROM public.card_reviews
            WHERE user_id = $1::uuid AND organization_id = $2::uuid AND current_zone = $3 AND started_at >= $4
            ORDER BY started_at DESC
          `;
          const res = await client.query(sql, [userId, orgId, zoneId, startTimeIso]);
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
          .eq('current_zone', Number(zoneId))
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
   * Create a card review (session) within an organization
   */
  async createCardReview(userId: string, orgId: string, reviewData: any) {
    try {
      const now = new Date().toISOString();

      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          const sql = `
            INSERT INTO public.card_reviews (user_id, organization_id, current_zone, started_at, finished_at, correct_answers, wrong_answers)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
            RETURNING id, user_id, organization_id, current_zone, started_at, finished_at, correct_answers, wrong_answers
          `;
          const res = await client.query(sql, [
            userId,
            orgId,
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
          current_zone: reviewData.current_zone || null,
          correct_answers: reviewData.correct_answers || 0,
          wrong_answers: reviewData.wrong_answers || 0,
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
   * Get card by id within an organization
   */
  async getCardById(cardId: string, userId: string, orgId: string) {
    try {
      return await this.databaseService.withUserContext(userId, orgId, async (client) => {
        try {
          const sql = `
            SELECT id, user_id, organization_id, name, description, card_class, zone, current_streak, created_at, last_edited_at
            FROM public.cards
            WHERE id = $1::uuid AND user_id = $2::uuid AND organization_id = $3::uuid
          `;
          const res = await client.query(sql, [cardId, userId, orgId]);
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
          .eq('id', Number(cardId))
          .eq('user_id', userId)
          .eq('organization_id', orgId)
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
