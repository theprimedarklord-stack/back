import { Injectable, InternalServerErrorException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CreateMapCardConnectionDto } from './dto/create-map-card-connection.dto';

@Injectable()
export class MapCardConnectionsService {

  /**
   * Defense in Depth: SQL WHERE фільтри user_id + organization_id
   * працюють поверх RLS-контексту (SET LOCAL), вже встановленого
   * в dbClient через RlsContextInterceptor.
   */

  /**
   * Отримати всі з'єднання користувача в організації.
   */
  async findAll(dbClient: PoolClient, userId: string, orgId: string) {
    try {
      const query = `
        SELECT mcc.*,
               src.title AS source_title,
               tgt.title AS target_title
        FROM map_card_connections mcc
        LEFT JOIN map_cards src ON src.id = mcc.source_map_card_id
        LEFT JOIN map_cards tgt ON tgt.id = mcc.target_map_card_id
        WHERE mcc.user_id = $1::uuid
        ORDER BY mcc.created_at DESC
      `;
      const result = await dbClient.query(query, [userId]);
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Отримати всі з'єднання для конкретної map card (обидва напрямки — undirected).
   * Повертає також title з'єднаної картки.
   */
  async findByCard(dbClient: PoolClient, mapCardId: string, userId: string, orgId: string) {
    try {
      const query = `
        SELECT mcc.*,
               CASE
                 WHEN mcc.source_map_card_id = $1::bigint THEN tgt.title
                 ELSE src.title
               END AS connected_card_title,
               CASE
                 WHEN mcc.source_map_card_id = $1::bigint THEN tgt.id
                 ELSE src.id
               END AS connected_card_id
        FROM map_card_connections mcc
        LEFT JOIN map_cards src ON src.id = mcc.source_map_card_id
        LEFT JOIN map_cards tgt ON tgt.id = mcc.target_map_card_id
        WHERE (mcc.source_map_card_id = $1::bigint OR mcc.target_map_card_id = $1::bigint)
          AND mcc.user_id = $2::uuid
        ORDER BY mcc.created_at DESC
      `;
      const result = await dbClient.query(query, [mapCardId, userId]);
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Отримати граф для Graph View: nodes (map_cards) + edges (connections).
   * Пагінація по нодах; edges — тільки між поверненими нодами.
   */
  async getGraph(dbClient: PoolClient, userId: string, orgId: string, limit = 100, offset = 0) {
    try {
      // 1. Загальна кількість map_cards
      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM map_cards
        WHERE user_id = $1::uuid AND organization_id = $2::uuid
      `;
      const countResult = await dbClient.query(countQuery, [userId, orgId]);
      const total = countResult.rows[0].total;

      // 2. Ноди з пагінацією
      const nodesQuery = `
        SELECT id, title, data_core->'metadata' AS metadata
        FROM map_cards
        WHERE user_id = $1::uuid AND organization_id = $2::uuid
        ORDER BY updated_at DESC
        LIMIT $3::int OFFSET $4::int
      `;
      const nodesResult = await dbClient.query(nodesQuery, [userId, orgId, limit, offset]);
      const nodes = nodesResult.rows;

      if (nodes.length === 0) {
        return { nodes: [], edges: [], total };
      }

      // 3. Edges між цими нодами
      const nodeIds = nodes.map((n: any) => n.id);
      const edgesQuery = `
        SELECT id, source_map_card_id, target_map_card_id, connection_type, metadata, created_at
        FROM map_card_connections
        WHERE user_id = $1::uuid
          AND source_map_card_id = ANY($2::bigint[])
          AND target_map_card_id = ANY($3::bigint[])
      `;
      const edgesResult = await dbClient.query(edgesQuery, [userId, nodeIds, nodeIds]);
      const edges = edgesResult.rows;

      // 4. Підрахунок connectionCount для кожної ноди
      const connectionCountMap = new Map<string, number>();
      for (const edge of edges) {
        const srcId = String(edge.source_map_card_id);
        const tgtId = String(edge.target_map_card_id);
        connectionCountMap.set(srcId, (connectionCountMap.get(srcId) || 0) + 1);
        connectionCountMap.set(tgtId, (connectionCountMap.get(tgtId) || 0) + 1);
      }

      const enrichedNodes = nodes.map((node: any) => ({
        ...node,
        connectionCount: connectionCountMap.get(String(node.id)) || 0,
      }));

      return { nodes: enrichedNodes, edges, total };
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Graph Query Error: ${error.message}`);
    }
  }

  /**
   * Створити одне з'єднання.
   * Тригер БД нормалізує source < target для undirected edges.
   * ON CONFLICT DO NOTHING — ідемпотентність.
   */
  async create(dbClient: PoolClient, dto: CreateMapCardConnectionDto, userId: string, orgId: string) {
    try {
      const query = `
        INSERT INTO map_card_connections (source_map_card_id, target_map_card_id, connection_type, metadata, user_id)
        VALUES ($1::bigint, $2::bigint, $3, $4::jsonb, $5::uuid)
        ON CONFLICT DO NOTHING
        RETURNING *
      `;
      const values = [
        dto.source_map_card_id,
        dto.target_map_card_id,
        dto.connection_type ?? 'reference',
        dto.metadata ? JSON.stringify(dto.metadata) : null,
        userId,
      ];

      const result = await dbClient.query(query, values);

      // ON CONFLICT DO NOTHING — з'єднання вже існує, повертаємо існуюче
      if (result.rows.length === 0) {
        const existing = await dbClient.query(
          `SELECT * FROM map_card_connections
           WHERE user_id = $1::uuid
             AND source_map_card_id = LEAST($2::bigint, $3::bigint)
             AND target_map_card_id = GREATEST($2::bigint, $3::bigint)`,
          [userId, dto.source_map_card_id, dto.target_map_card_id],
        );
        return existing.rows[0] ?? { message: 'Connection already exists' };
      }

      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  /**
   * Масове створення з'єднань (для парсингу wiki-links).
   * INSERT ... ON CONFLICT DO NOTHING для кожного.
   */
  async bulkSync(
    dbClient: PoolClient,
    connections: { source_map_card_id: number; target_map_card_id: number; connection_type?: string }[],
    userId: string,
    orgId: string,
  ) {
    try {
      const results: any[] = [];

      for (const conn of connections) {
        const query = `
          INSERT INTO map_card_connections (source_map_card_id, target_map_card_id, connection_type, user_id)
          VALUES ($1::bigint, $2::bigint, $3, $4::uuid)
          ON CONFLICT DO NOTHING
          RETURNING *
        `;
        const values = [
          conn.source_map_card_id,
          conn.target_map_card_id,
          conn.connection_type ?? 'reference',
          userId,
        ];

        const result = await dbClient.query(query, values);
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      return { created: results.length, connections: results };
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException(`Відмовлено в доступі RLS`);
      }
      throw new InternalServerErrorException(`DB Bulk Insert Error: ${error.message}`);
    }
  }

  /**
   * Видалити з'єднання по ID.
   * Defense in Depth: user_id + organization_id у WHERE.
   */
  async remove(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const query = `
        DELETE FROM map_card_connections
        WHERE id = $1::uuid AND user_id = $2::uuid
        RETURNING id
      `;
      const result = await dbClient.query(query, [id, userId]);

      if (result.rows.length === 0) {
        throw new NotFoundException('Connection not found');
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
}
