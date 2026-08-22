import {
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { PRIMITIVE_SEEDS, STANDARD_LIBRARY } from './standard-library';

/**
 * Computer Lab: чипи, деталі та дроти.
 *
 * Чіп — це нода (`map_nodes.kind='circuit'`), і саме вона дає йому ім'я, теку,
 * права та публічне посилання. Тут лежить тільки те, чого в ноди немає:
 * інтерфейс (порти), швидка модель і сама схема.
 *
 * Схема розкладена рядками, а не jsonb у ноді, з тієї ж причини, з якої це
 * зробили зі SmartTable і з самими нодами: зсув однієї деталі не має
 * переписувати документ, а «де застосований цей чіп» — це запит по зовнішньому
 * ключу, якого в блобі немає (LAB_ARCHITECTURE.md).
 */
@Injectable()
export class LabService {
  /** Чіп за нодою. Порожньо — схему для цієї ноди ще не заводили. */
  async findChipByNode(dbClient: PoolClient, nodeId: string, userId: string, orgId: string) {
    try {
      const result = await dbClient.query(
        `SELECT c.*, n.title AS name
           FROM lab_chips c
           JOIN map_nodes n ON n.id = c.node_id
          WHERE c.node_id = $1
            AND c.user_id = $2::uuid
            AND c.organization_id = $3::uuid
            AND c.deleted_at IS NULL`,
        [nodeId, userId, orgId],
      );
      return result.rows[0] ?? null;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /** Бібліотека: усі чіпи організації. З них ставлять деталі. */
  async listChips(dbClient: PoolClient, userId: string, orgId: string, limit = 500) {
    try {
      const result = await dbClient.query(
        `SELECT c.*, n.title AS name
           FROM lab_chips c
           JOIN map_nodes n ON n.id = c.node_id
          WHERE c.user_id = $1::uuid
            AND c.organization_id = $2::uuid
            AND c.deleted_at IS NULL
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
          LIMIT $3::int`,
        [userId, orgId, limit],
      );
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async createChip(
    dbClient: PoolClient,
    dto: { id: string; node_id: string; ports?: any[]; behavior?: any },
    userId: string,
    orgId: string,
  ) {
    try {
      const result = await dbClient.query(
        `INSERT INTO lab_chips (id, organization_id, user_id, node_id, ports, behavior)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5::jsonb, $6::jsonb)
         -- Нода одна, чіп у неї один: повторний виклик має віддати наявний,
         -- а не впасти. Редактор кличе це на кожне відкриття.
         ON CONFLICT (node_id) DO UPDATE SET updated_at = now()
         RETURNING *`,
        [
          dto.id,
          orgId,
          userId,
          dto.node_id,
          JSON.stringify(dto.ports ?? []),
          JSON.stringify(dto.behavior ?? { kind: 'none' }),
        ],
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      if (error.code === '23503') throw new NotFoundException('Node not found');
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  /**
   * Інтерфейс і швидка модель.
   *
   * `version` росте при кожній зміні: по ній скидається кеш розгортки в усіх,
   * хто цей чіп використовує. Без цього чужа схема лічилася б за старим
   * інтерфейсом до перезавантаження вкладки.
   */
  async updateChip(
    dbClient: PoolClient,
    id: string,
    dto: { ports?: any[]; behavior?: any },
    userId: string,
    orgId: string,
  ) {
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (dto.ports !== undefined) {
      sets.push(`ports = $${i++}::jsonb`);
      values.push(JSON.stringify(dto.ports));
    }
    if (dto.behavior !== undefined) {
      sets.push(`behavior = $${i++}::jsonb`);
      values.push(JSON.stringify(dto.behavior));
    }
    if (sets.length === 0) return null;

    sets.push('version = version + 1');
    values.push(id, userId, orgId);

    try {
      const result = await dbClient.query(
        `UPDATE lab_chips SET ${sets.join(', ')}
          WHERE id = $${i++} AND user_id = $${i++}::uuid AND organization_id = $${i++}::uuid
            AND deleted_at IS NULL
         RETURNING *`,
        values,
      );
      if (result.rows.length === 0) throw new NotFoundException('Chip not found');
      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Update Error: ${error.message}`);
    }
  }

  /** Схема цілком: деталі та дроти одним походом. */
  async getSchematic(dbClient: PoolClient, chipId: string, userId: string, orgId: string) {
    try {
      const chip = await dbClient.query(
        `SELECT c.*, n.title AS name
           FROM lab_chips c
           JOIN map_nodes n ON n.id = c.node_id
          WHERE c.id = $1 AND c.user_id = $2::uuid AND c.organization_id = $3::uuid
            AND c.deleted_at IS NULL`,
        [chipId, userId, orgId],
      );
      if (chip.rows.length === 0) throw new NotFoundException('Chip not found');

      const [parts, wires] = await Promise.all([
        dbClient.query(
          `SELECT * FROM lab_parts
            WHERE chip_id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
            ORDER BY created_at ASC`,
          [chipId, userId, orgId],
        ),
        dbClient.query(
          `SELECT * FROM lab_wires
            WHERE chip_id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
            ORDER BY created_at ASC`,
          [chipId, userId, orgId],
        ),
      ]);

      return { chip: chip.rows[0], parts: parts.rows, wires: wires.rows };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  async createPart(
    dbClient: PoolClient,
    chipId: string,
    dto: {
      id: string;
      type_chip_id?: string | null;
      role?: string;
      x: number;
      y: number;
      props?: any;
    },
    userId: string,
    orgId: string,
  ) {
    try {
      const result = await dbClient.query(
        `INSERT INTO lab_parts (id, organization_id, user_id, chip_id, type_chip_id, role, x, y, props)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::int, $8::int, $9::jsonb)
         RETURNING *`,
        [
          dto.id,
          orgId,
          userId,
          chipId,
          dto.type_chip_id ?? null,
          dto.role ?? 'part',
          Math.round(dto.x),
          Math.round(dto.y),
          JSON.stringify(dto.props ?? {}),
        ],
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      // Тригер `lab_parts_no_cycle`: чіп усередині самого себе.
      if (error.code === 'P0001') throw new BadRequestException(error.message);
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  async updatePart(
    dbClient: PoolClient,
    id: string,
    dto: { x?: number; y?: number; rotation?: number; props?: any },
    userId: string,
    orgId: string,
  ) {
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (dto.x !== undefined) {
      sets.push(`x = $${i++}::int`);
      values.push(Math.round(dto.x));
    }
    if (dto.y !== undefined) {
      sets.push(`y = $${i++}::int`);
      values.push(Math.round(dto.y));
    }
    if (dto.rotation !== undefined) {
      sets.push(`rotation = $${i++}::smallint`);
      values.push(dto.rotation);
    }
    if (dto.props !== undefined) {
      sets.push(`props = $${i++}::jsonb`);
      values.push(JSON.stringify(dto.props));
    }
    if (sets.length === 0) return null;

    values.push(id, userId, orgId);

    try {
      const result = await dbClient.query(
        `UPDATE lab_parts SET ${sets.join(', ')}
          WHERE id = $${i++} AND user_id = $${i++}::uuid AND organization_id = $${i++}::uuid
         RETURNING *`,
        values,
      );
      if (result.rows.length === 0) throw new NotFoundException('Part not found');
      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Update Error: ${error.message}`);
    }
  }

  async deletePart(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      // Дроти йдуть каскадом: провід без кінця — не дані, а сміття.
      const result = await dbClient.query(
        `DELETE FROM lab_parts
          WHERE id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
         RETURNING id`,
        [id, userId, orgId],
      );
      if (result.rows.length === 0) throw new NotFoundException('Part not found');
      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Delete Error: ${error.message}`);
    }
  }

  async createWire(
    dbClient: PoolClient,
    chipId: string,
    dto: {
      id: string;
      from_part: string;
      from_port: string;
      to_part: string;
      to_port: string;
      path?: any;
    },
    userId: string,
    orgId: string,
  ) {
    try {
      const result = await dbClient.query(
        `INSERT INTO lab_wires
           (id, organization_id, user_id, chip_id, from_part, from_port, to_part, to_port, path)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING *`,
        [
          dto.id,
          orgId,
          userId,
          chipId,
          dto.from_part,
          dto.from_port,
          dto.to_part,
          dto.to_port,
          JSON.stringify(dto.path ?? []),
        ],
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      // `uq_lab_wires_sink`: другий провід у той самий вхід. Це помилка збірки,
      // а не «спірний стан», і сказати про неї треба одразу.
      if (error.code === '23505') {
        throw new BadRequestException('У цей вхід уже підключено інший провід');
      }
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  async deleteWire(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const result = await dbClient.query(
        `DELETE FROM lab_wires
          WHERE id = $1 AND user_id = $2::uuid AND organization_id = $3::uuid
         RETURNING id`,
        [id, userId, orgId],
      );
      if (result.rows.length === 0) throw new NotFoundException('Wire not found');
      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Delete Error: ${error.message}`);
    }
  }

  /**
   * Стандартна бібліотека: примітиви і чіпи, зібрані з них.
   *
   * Засипається один раз на людину: примітиви мусять бути рядками (деталь
   * посилається на чіп зовнішнім ключем), а `NOT`, `AND`, `OR`, `XOR` і
   * суматори — справжніми схемами, інакше шлях «дійти до NAND» обривається на
   * першому ж вентилі.
   *
   * Повторний виклик нічого не робить: наявність теки «Standard Library» і є
   * ознакою того, що засипка вже пройшла.
   */
  async seedStandardLibrary(dbClient: PoolClient, userId: string, orgId: string) {
    try {
      const existing = await dbClient.query(
        `SELECT id FROM map_nodes
          WHERE kind = 'cluster' AND title = 'Standard Library'
            AND user_id = $1::uuid AND organization_id = $2::uuid AND deleted_at IS NULL
          LIMIT 1`,
        [userId, orgId],
      );

      if (existing.rows.length > 0) {
        return { seeded: false, clusterId: existing.rows[0].id };
      }

      const clusterId = `cluster-${randomUUID()}`;
      await dbClient.query(
        `INSERT INTO map_nodes (id, organization_id, user_id, kind, parent_id, root_id, depth, path, position, title, props)
         VALUES ($1, $2::uuid, $3::uuid, 'cluster', NULL, $1, 0, '{}'::text[], 0, 'Standard Library', '{}'::jsonb)`,
        [clusterId, orgId, userId],
      );

      /** Створює ноду-чіп і сам чіп; повертає id чіпа. */
      const makeChip = async (title: string, ports: any[], behavior: any, isPrimitive: boolean) => {
        const nodeId = `circuit-${randomUUID()}`;
        const chipId = `chip-${randomUUID()}`;

        await dbClient.query(
          `INSERT INTO map_nodes (id, organization_id, user_id, kind, parent_id, root_id, depth, path, position, title, props)
           VALUES ($1, $2::uuid, $3::uuid, 'circuit', $4, $1, 1, ARRAY[$4]::text[], 0, $5, '{}'::jsonb)`,
          [nodeId, orgId, userId, clusterId, title],
        );

        await dbClient.query(
          `INSERT INTO lab_chips (id, organization_id, user_id, node_id, ports, behavior, is_primitive)
           VALUES ($1, $2::uuid, $3::uuid, $4, $5::jsonb, $6::jsonb, $7)`,
          [chipId, orgId, userId, nodeId, JSON.stringify(ports), JSON.stringify(behavior), isPrimitive],
        );

        return chipId;
      };

      // Примітиви: схеми всередині немає, поведінку рахує рушій.
      const byName = new Map<string, string>();
      for (const primitive of PRIMITIVE_SEEDS) {
        const chipId = await makeChip(
          primitive.title,
          primitive.ports,
          { kind: 'builtin', name: primitive.name },
          true,
        );
        byName.set(primitive.name, chipId);
      }

      // Чіпи-схеми. Порядок у списку — порядок залежностей: `XOR` не зібрати,
      // поки немає NAND, а `Full Adder` — поки немає `Half Adder`.
      const byKey = new Map<string, string>();

      for (const def of STANDARD_LIBRARY) {
        const chipId = await makeChip(def.title, def.ports, { kind: 'none' }, false);
        byKey.set(def.key, chipId);

        const partIds = new Map<string, string>();

        for (const part of def.parts) {
          const partId = `part-${randomUUID()}`;
          const typeChipId = byName.get(part.type) ?? byKey.get(part.type);
          if (!typeChipId) {
            throw new InternalServerErrorException(
              `Стандартна бібліотека посилається на невідомий тип: ${part.type}`,
            );
          }

          await dbClient.query(
            `INSERT INTO lab_parts (id, organization_id, user_id, chip_id, type_chip_id, role, x, y, props)
             VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::int, $8::int, $9::jsonb)`,
            [
              partId,
              orgId,
              userId,
              chipId,
              typeChipId,
              part.role ?? 'part',
              part.x,
              part.y,
              JSON.stringify(part.props ?? {}),
            ],
          );

          partIds.set(part.ref, partId);
        }

        for (const [fromRef, fromPort, toRef, toPort] of def.wires) {
          await dbClient.query(
            `INSERT INTO lab_wires (id, organization_id, user_id, chip_id, from_part, from_port, to_part, to_port)
             VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)`,
            [
              `wire-${randomUUID()}`,
              orgId,
              userId,
              chipId,
              partIds.get(fromRef),
              fromPort,
              partIds.get(toRef),
              toPort,
            ],
          );
        }
      }

      return {
        seeded: true,
        clusterId,
        chips: [...byName.keys(), ...byKey.keys()],
      };
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Seed Error: ${error.message}`);
    }
  }

  /**
   * Де застосований цей чіп.
   *
   * Питається перед зміною портів і перед видаленням: зникнення порту рве
   * дроти в чужих схемах, і людина має побачити список, а не наслідки.
   */
  async getUsages(dbClient: PoolClient, chipId: string, userId: string, orgId: string) {
    try {
      const result = await dbClient.query(
        `SELECT p.chip_id, c.node_id, count(*)::int AS count
           FROM lab_parts p
           JOIN lab_chips c ON c.id = p.chip_id
          WHERE p.type_chip_id = $1
            AND p.user_id = $2::uuid
            AND p.organization_id = $3::uuid
          GROUP BY p.chip_id, c.node_id`,
        [chipId, userId, orgId],
      );
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }
}
