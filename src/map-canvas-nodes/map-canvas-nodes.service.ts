import { Injectable, InternalServerErrorException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CreateCanvasNodeDto } from './dto/create-canvas-node.dto';
import { UpdateCanvasNodeDto } from './dto/update-canvas-node.dto';

@Injectable()
export class MapCanvasNodesService {

  async findByMapCard(dbClient: PoolClient, mapCardId: string, userId: string, orgId: string) {
    try {
      const query = `
        SELECT * FROM map_canvas_nodes
        WHERE map_card_id = $1::bigint AND user_id = $2::uuid AND organization_id = $3::uuid
        ORDER BY created_at
      `;
      const result = await dbClient.query(query, [mapCardId, userId, orgId]);
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
        SELECT * FROM map_canvas_nodes
        WHERE id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
      `;
      const result = await dbClient.query(query, [id, userId, orgId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Node not found');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException(`Відмовлено в доступі RLS`);
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async create(dbClient: PoolClient, dto: CreateCanvasNodeDto, userId: string, orgId: string) {
    try {
      const query = `
        INSERT INTO map_canvas_nodes (
          id, map_card_id, user_id, organization_id, node_type, content_blocks, title, tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const values = [
        dto.id,
        dto.map_card_id,
        userId,
        orgId,
        dto.node_type,
        dto.content_blocks ? JSON.stringify(dto.content_blocks) : '[]',
        dto.title || '',
        dto.tags || '{}'
      ];
      
      const result = await dbClient.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  async update(dbClient: PoolClient, id: string, dto: UpdateCanvasNodeDto, userId: string, orgId: string) {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (dto.content_blocks !== undefined) {
        updates.push(`content_blocks = $${idx++}::jsonb`);
        values.push(JSON.stringify(dto.content_blocks));
      }
      if (dto.content_text !== undefined) {
        updates.push(`content_text = $${idx++}`);
        values.push(dto.content_text);
      }
      if (dto.title !== undefined) {
        updates.push(`title = $${idx++}`);
        values.push(dto.title);
      }
      if (dto.tags !== undefined) {
        updates.push(`tags = $${idx++}::text[]`);
        values.push(dto.tags);
      }

      if (updates.length === 0) return null;

      updates.push(`updated_at = NOW()`);
      
      // Add id, user_id, org_id for WHERE clause
      values.push(id, userId, orgId);

      const query = `
        UPDATE map_canvas_nodes
        SET ${updates.join(', ')}
        WHERE id = $${idx++} AND user_id = $${idx++}::uuid AND organization_id = $${idx++}::uuid
        RETURNING *
      `;

      const result = await dbClient.query(query, values);

      if (result.rows.length === 0) {
        throw new NotFoundException('Node not found or access denied');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Update Error: ${error.message}`);
    }
  }

  async remove(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const query = `
        DELETE FROM map_canvas_nodes
        WHERE id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
        RETURNING id
      `;
      const result = await dbClient.query(query, [id, userId, orgId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Node not found or access denied');
      }

      return { success: true, id };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Delete Error: ${error.message}`);
    }
  }
}
