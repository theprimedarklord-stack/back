import { Injectable, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CreateMapCardDto } from './dto/create-mapcard.dto';

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
}
