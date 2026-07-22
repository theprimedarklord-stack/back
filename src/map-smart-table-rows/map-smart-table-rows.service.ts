import { Injectable, InternalServerErrorException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CreateTableRowDto } from './dto/create-table-row.dto';
import { UpdateTableRowDto } from './dto/update-table-row.dto';
import { ReorderRowsDto } from './dto/reorder-rows.dto';

@Injectable()
export class MapSmartTableRowsService {

  async findByTableNode(dbClient: PoolClient, tableNodeId: string, userId: string, orgId: string) {
    try {
      const query = `
        SELECT * FROM map_smart_table_rows
        WHERE table_node_id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
        ORDER BY position ASC, created_at ASC
      `;
      const result = await dbClient.query(query, [tableNodeId, userId, orgId]);
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async findOne(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const query = `
        SELECT * FROM map_smart_table_rows
        WHERE id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
      `;
      const result = await dbClient.query(query, [id, userId, orgId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Row not found');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException(`Відмовлено в доступі RLS`);
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async create(dbClient: PoolClient, dto: CreateTableRowDto, userId: string, orgId: string) {
    try {
      // Find max position
      const posQuery = `
        SELECT COALESCE(MAX(position), -1) + 1 as next_pos
        FROM map_smart_table_rows
        WHERE table_node_id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
      `;
      const posRes = await dbClient.query(posQuery, [dto.table_node_id, userId, orgId]);
      const nextPos = posRes.rows[0].next_pos;

      const query = `
        INSERT INTO map_smart_table_rows (
          id, table_node_id, map_card_id, user_id, organization_id,
          position, height, properties, content_blocks
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const values = [
        dto.id,
        dto.table_node_id,
        dto.map_card_id,
        userId,
        orgId,
        nextPos,
        dto.height || 'normal',
        dto.properties ? JSON.stringify(dto.properties) : '{}',
        dto.content_blocks ? JSON.stringify(dto.content_blocks) : '[]'
      ];
      
      const result = await dbClient.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  async bulkCreate(dbClient: PoolClient, dtos: CreateTableRowDto[], userId: string, orgId: string) {
    if (!dtos || dtos.length === 0) return [];
    
    try {
      // Find max position
      const tableNodeId = dtos[0].table_node_id;
      const posQuery = `
        SELECT COALESCE(MAX(position), -1) + 1 as next_pos
        FROM map_smart_table_rows
        WHERE table_node_id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
      `;
      const posRes = await dbClient.query(posQuery, [tableNodeId, userId, orgId]);
      let nextPos = parseInt(posRes.rows[0].next_pos, 10);

      const rowsToInsert = dtos.map(dto => {
        const pos = nextPos++;
        return `(
          '${dto.id}', 
          '${dto.table_node_id}', 
          ${dto.map_card_id}, 
          '${userId}'::uuid, 
          '${orgId}'::uuid, 
          ${pos}, 
          '${dto.height || 'normal'}', 
          '${JSON.stringify(dto.properties || {}).replace(/'/g, "''")}'::jsonb, 
          '${JSON.stringify(dto.content_blocks || []).replace(/'/g, "''")}'::jsonb
        )`;
      }).join(', ');

      const query = `
        INSERT INTO map_smart_table_rows (
          id, table_node_id, map_card_id, user_id, organization_id,
          position, height, properties, content_blocks
        )
        VALUES ${rowsToInsert}
        RETURNING *
      `;
      
      const result = await dbClient.query(query);
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Bulk Insert Error: ${error.message}`);
    }
  }

  async update(dbClient: PoolClient, id: string, dto: UpdateTableRowDto, userId: string, orgId: string) {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (dto.properties !== undefined) {
        updates.push(`properties = $${idx++}::jsonb`);
        values.push(JSON.stringify(dto.properties));
      }
      if (dto.content_blocks !== undefined) {
        updates.push(`content_blocks = $${idx++}::jsonb`);
        values.push(JSON.stringify(dto.content_blocks));
      }
      if (dto.content_text !== undefined) {
        updates.push(`content_text = $${idx++}`);
        values.push(dto.content_text);
      }
      if (dto.height !== undefined) {
        updates.push(`height = $${idx++}`);
        values.push(dto.height);
      }

      if (updates.length === 0) return null;

      updates.push(`updated_at = NOW()`);
      
      values.push(id, userId, orgId);

      const query = `
        UPDATE map_smart_table_rows
        SET ${updates.join(', ')}
        WHERE id = $${idx++} AND user_id = $${idx++}::uuid AND organization_id = $${idx++}::uuid
        RETURNING *
      `;

      const result = await dbClient.query(query, values);

      if (result.rows.length === 0) {
        throw new NotFoundException('Row not found or access denied');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Update Error: ${error.message}`);
    }
  }

  async reorder(dbClient: PoolClient, dto: ReorderRowsDto, userId: string, orgId: string) {
    try {
      // Build CASE statement for updating positions
      const cases = dto.order.map((item, index) => {
        return `WHEN id = '${item.id}' THEN ${item.position}`;
      }).join(' ');

      const ids = dto.order.map(item => `'${item.id}'`).join(', ');

      if (!ids) return { success: true };

      const query = `
        UPDATE map_smart_table_rows
        SET position = CASE ${cases} END,
            updated_at = NOW()
        WHERE id IN (${ids}) AND user_id = $1::uuid AND organization_id = $2::uuid
      `;
      
      await dbClient.query(query, [userId, orgId]);
      return { success: true };
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Reorder Error: ${error.message}`);
    }
  }

  async remove(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const query = `
        DELETE FROM map_smart_table_rows
        WHERE id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
        RETURNING id
      `;
      const result = await dbClient.query(query, [id, userId, orgId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Row not found or access denied');
      }

      return { success: true, id };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Delete Error: ${error.message}`);
    }
  }

  async bulkRemove(dbClient: PoolClient, ids: string[], userId: string, orgId: string) {
    if (!ids || ids.length === 0) return { success: true };
    try {
      const idsString = ids.map(id => `'${id}'`).join(', ');
      const query = `
        DELETE FROM map_smart_table_rows
        WHERE id IN (${idsString}) AND user_id = $1::uuid AND organization_id = $2::uuid
      `;
      await dbClient.query(query, [userId, orgId]);
      return { success: true };
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Bulk Delete Error: ${error.message}`);
    }
  }
}
