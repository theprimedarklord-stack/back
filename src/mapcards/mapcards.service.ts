import { Injectable, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { CreateMapCardDto } from './dto/create-mapcard.dto';

@Injectable()
export class MapCardsService {
  constructor() { }

  async findAll(dbClient: any) {
    try {
      const result = await dbClient.query('SELECT * FROM map_cards');
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async create(dto: CreateMapCardDto, userId: string, orgId: string, dbClient: any) {
    try {
      const query = `
        INSERT INTO map_cards (card_id, user_id, organization_id)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      const values = [dto.card_id, userId, orgId];

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
