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

  /**
   * Upsert rather than a plain insert.
   *
   * The canvas mints node ids in memory and only later finds out whether a row
   * exists, so the same create legitimately arrives more than once — a reconcile
   * racing a debounced save, a second tab, a StrictMode double mount. A hard
   * insert answers that with a 500 and (in the bulk case) drops every other node
   * in the batch with it.
   *
   * `content_blocks`, `title` and `tags` are deliberately absent from the DO
   * UPDATE list: a repeat create carries an empty body, and overwriting with it
   * would erase the content this row exists to hold.
   */
  async create(dbClient: PoolClient, dto: CreateCanvasNodeDto, userId: string, orgId: string) {
    try {
      const query = `
        INSERT INTO map_canvas_nodes (
          id, map_card_id, user_id, organization_id, node_type, content_blocks, title, tags
        )
        VALUES ($1, $2::bigint, $3::uuid, $4::uuid, $5, $6::jsonb, $7, $8::text[])
        ON CONFLICT (id) DO UPDATE
           SET node_type = EXCLUDED.node_type,
               updated_at = NOW()
         WHERE map_canvas_nodes.user_id = EXCLUDED.user_id
           AND map_canvas_nodes.organization_id = EXCLUDED.organization_id
           AND map_canvas_nodes.map_card_id = EXCLUDED.map_card_id
        RETURNING *
      `;
      const values = [
        dto.id,
        dto.map_card_id,
        userId,
        orgId,
        dto.node_type,
        JSON.stringify(dto.content_blocks ?? []),
        dto.title ?? '',
        dto.tags ?? [],
      ];

      const result = await dbClient.query(query, values);

      if (result.rows.length === 0) {
        // The primary key is a bare id and node ids are minted from a timestamp
        // (`NodeFactory`), so a row belonging to another owner — or to another
        // card of the same owner — can collide on it. The DO UPDATE guard turns
        // that into a no-op instead of letting this node adopt that row and
        // write its content there.
        throw new ForbiddenException('Node id already belongs to another owner or map card');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof ForbiddenException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  /**
   * Same upsert, one statement for the whole batch — the reconcile pass creates
   * every missing node of a card at once.
   */
  async bulkCreate(dbClient: PoolClient, dtos: CreateCanvasNodeDto[], userId: string, orgId: string) {
    if (!dtos || dtos.length === 0) return [];

    // `ON CONFLICT DO UPDATE` refuses to touch the same row twice in one
    // statement, so a repeated id in the batch would fail the whole insert.
    const unique = new Map<string, CreateCanvasNodeDto>();
    for (const dto of dtos) unique.set(dto.id, dto);

    try {
      // Values are bound, never interpolated: ids and block contents are
      // user-controlled text.
      const values: any[] = [];
      const tuples = [...unique.values()]
        .map((dto) => {
          const p = values.length;
          values.push(
            dto.id,
            dto.map_card_id,
            userId,
            orgId,
            dto.node_type,
            JSON.stringify(dto.content_blocks ?? []),
            dto.title ?? '',
            dto.tags ?? [],
          );
          return `($${p + 1}, $${p + 2}::bigint, $${p + 3}::uuid, $${p + 4}::uuid, $${p + 5}, $${p + 6}::jsonb, $${p + 7}, $${p + 8}::text[])`;
        })
        .join(', ');

      const query = `
        INSERT INTO map_canvas_nodes (
          id, map_card_id, user_id, organization_id, node_type, content_blocks, title, tags
        )
        VALUES ${tuples}
        ON CONFLICT (id) DO UPDATE
           SET node_type = EXCLUDED.node_type,
               updated_at = NOW()
         WHERE map_canvas_nodes.user_id = EXCLUDED.user_id
           AND map_canvas_nodes.organization_id = EXCLUDED.organization_id
           AND map_canvas_nodes.map_card_id = EXCLUDED.map_card_id
        RETURNING *
      `;

      const result = await dbClient.query(query, values);
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Bulk Insert Error: ${error.message}`);
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
