import { Injectable, InternalServerErrorException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CreateMapCardDto } from './dto/create-mapcard.dto';
import { UpdateMapCardDto } from './dto/update-mapcard.dto';

@Injectable()
export class MapCardsService {

  /**
   * Defense in Depth: SQL WHERE фільтри user_id + organization_id
   * працюють поверх RLS-контексту (SET LOCAL), вже встановленого
   * в dbClient через RlsContextInterceptor.
   */
  async findAll(dbClient: PoolClient, userId: string, orgId: string) {
    try {
      const query = `
        SELECT * FROM map_cards
        WHERE user_id = $1::uuid AND organization_id = $2::uuid
        ORDER BY updated_at DESC
      `;
      const result = await dbClient.query(query, [userId, orgId]);
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Отримати одну map card по ID.
   * Defense in Depth: user_id + organization_id у WHERE.
   */
  async findOne(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const query = `
        SELECT * FROM map_cards
        WHERE id = $1::bigint AND user_id = $2::uuid AND organization_id = $3::uuid
      `;
      const result = await dbClient.query(query, [id, userId, orgId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Map card not found');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async create(dbClient: PoolClient, dto: CreateMapCardDto, userId: string, orgId: string) {
    try {
      const query = `
        INSERT INTO map_cards (card_id, data_core, user_id, organization_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const values = [
        dto.card_id ?? null,
        dto.data_core ? JSON.stringify(dto.data_core) : '{}',
        userId,
        orgId,
      ];

      const result = await dbClient.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Ця картка не належить вашій організації або доступ заборонено`);
      }
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  /**
   * Оновити map card.
   * Defense in Depth: user_id + organization_id у WHERE.
   * Динамічне формування SET clause тільки для переданих полів.
   */
  async update(dbClient: PoolClient, id: string, dto: UpdateMapCardDto, userId: string, orgId: string) {
    try {
      // Whitelist дозволених колонок для динамічного UPDATE
      const ALLOWED_COLUMNS = [
        'data_core', 'card_id', 'title', 'tags', 'aliases',
        'note_type', 'manual_links', 'main_idea', 'own_understanding',
        'created_date', 'source',
      ];

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const col of ALLOWED_COLUMNS) {
        const value = (dto as any)[col];
        if (value !== undefined) {
          const dbValue = col === 'data_core' ? JSON.stringify(value) : value;
          setClauses.push(`${col} = $${paramIndex}`);
          values.push(dbValue);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        // Нічого оновлювати — повертаємо поточний стан
        return this.findOne(dbClient, id, userId, orgId);
      }

      // Defense in Depth: user_id + organization_id у WHERE
      values.push(id, userId, orgId);
      const query = `
        UPDATE map_cards
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}::bigint
          AND user_id = $${paramIndex + 1}::uuid
          AND organization_id = $${paramIndex + 2}::uuid
        RETURNING *
      `;

      const result = await dbClient.query(query, values);

      if (result.rows.length === 0) {
        throw new NotFoundException('Map card not found');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Update Error: ${error.message}`);
    }
  }

  /**
   * Видалити map card.
   * Defense in Depth: user_id + organization_id у WHERE.
   */
  async remove(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const query = `
        DELETE FROM map_cards
        WHERE id = $1::bigint AND user_id = $2::uuid AND organization_id = $3::uuid
        RETURNING id
      `;
      const result = await dbClient.query(query, [id, userId, orgId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Map card not found');
      }

      return { success: true, id: result.rows[0].id };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Delete Error: ${error.message}`);
    }
  }

  async toggleFavorite(
    dbClient: PoolClient,
    id: number,
    userId: string,
    orgId: string,
    isFavorite: boolean,
  ): Promise<{ id: number; isFavorite: boolean }> {
    try {
      const result = await dbClient.query<{ id: string; is_favorite: boolean }>(
        `UPDATE map_cards
         SET is_favorite = $1, updated_at = NOW()
         WHERE id = $2::bigint
           AND user_id = $3::uuid
           AND organization_id = $4::uuid
         RETURNING id, is_favorite`,
        [isFavorite, id, userId, orgId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundException(`MapCard #${id} not found`);
      }

      return {
        id: parseInt(result.rows[0].id, 10),
        isFavorite: result.rows[0].is_favorite,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Update Favorite Error: ${error.message}`);
    }
  }

  async updateCanvas(
    dbClient: PoolClient,
    id: number,
    userId: string,
    orgId: string,
    dataCore: Record<string, unknown>,
  ): Promise<{ id: number }> {
    try {
      const result = await dbClient.query<{ id: string }>(
        `UPDATE map_cards
         SET data_core = $1, updated_at = NOW()
         WHERE id = $2::bigint
           AND user_id = $3::uuid
           AND organization_id = $4::uuid
         RETURNING id`,
        [JSON.stringify(dataCore), id, userId, orgId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundException(`MapCard #${id} not found`);
      }

      return { id: parseInt(result.rows[0].id, 10) };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Update Canvas Error: ${error.message}`);
    }
  }
}
