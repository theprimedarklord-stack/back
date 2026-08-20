import {
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { SyncMapNodesDto } from './dto/sync-map-nodes.dto';

/**
 * Вузли карти як окремі рядки (`map_nodes`) замість елементів масиву всередині
 * `map_cards.data_core`.
 *
 * Контейнер карти має детермінований id `mapcard-<map_card_id>` — той самий,
 * що проставила засипка етапу 1. Завдяки цьому синхронізація потрапляє в ті
 * самі рядки, а не плодить дублікати.
 *
 * Defense in Depth: SQL-фільтри user_id + organization_id працюють поверх
 * RLS-контексту (SET LOCAL), встановленого RlsContextInterceptor.
 */
@Injectable()
export class MapNodesService {
  private rootIdOf(mapCardId: string | number): string {
    return `mapcard-${mapCardId}`;
  }

  /**
   * Усе піддерево картки одним походом: вузли + ребра між ними.
   *
   * Зв'язки картка↔картка (`kind='ref'` між контейнерами) сюди не потрапляють —
   * обидва кінці мусять бути вузлами цієї картки. У DataCore.edges їм місця
   * немає: там живуть тільки ребра канваса.
   */
  async findByMapCard(
    dbClient: PoolClient,
    mapCardId: string,
    userId: string,
    orgId: string,
  ) {
    const rootId = this.rootIdOf(mapCardId);

    try {
      // `parent_id IS NULL` — тільки те, що лежить на канвасі картки.
      // Вкладені вузли приїжджають окремо, коли відкривають їхнього батька:
      // канвас їх не малює, а тягнути піддерева всієї картки на кожне
      // відкриття означало б повернути той самий блоб, тільки рядками.
      const nodesResult = await dbClient.query(
        `SELECT id, kind, parent_id, root_id, depth, path, position,
                title, content, content_text, props, layout, tags,
                map_card_id, content_version, created_at, updated_at
           FROM map_nodes
          WHERE root_id = $1
            AND parent_id IS NULL
            AND user_id = $2::uuid
            AND organization_id = $3::uuid
            AND deleted_at IS NULL
          ORDER BY position ASC, created_at ASC`,
        [rootId, userId, orgId],
      );

      const linksResult = await dbClient.query(
        `SELECT l.id, l.from_node, l.to_node, l.kind, l.props, l.created_at
           FROM map_node_links l
           JOIN map_nodes s ON s.id = l.from_node
            AND s.root_id = $1 AND s.kind <> 'mapcard' AND s.deleted_at IS NULL
           JOIN map_nodes t ON t.id = l.to_node
            AND t.root_id = $1 AND t.kind <> 'mapcard' AND t.deleted_at IS NULL
          WHERE l.organization_id = $2::uuid`,
        [rootId, orgId],
      );

      return { nodes: nodesResult.rows, links: linksResult.rows };
    } catch (error: any) {
      if (error.code === '42501') {
        throw new ForbiddenException('Відмовлено в доступі RLS');
      }
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Корені дерева: кластери та картки, які не лежать у жодному кластері.
   *
   * `children_count` рахується одразу: без нього дерево не знає, у кого є що
   * розкривати, і малювало б стрілку розкриття геть усім. Для картки діти — це
   * вузли її канваса, для кластера — картки й вкладені кластери.
   *
   * Кластери йдуть першими: тека, загублена серед сотні карток, теку не
   * замінює.
   */
  async findRoots(dbClient: PoolClient, userId: string, orgId: string, limit = 200) {
    try {
      const result = await dbClient.query(
        `SELECT n.id, n.kind, n.title, n.map_card_id, n.updated_at,
                (SELECT count(*) FROM map_nodes c
                  WHERE c.deleted_at IS NULL
                    AND (
                      (n.kind = 'mapcard' AND c.root_id = n.id AND c.kind <> 'mapcard'
                        AND (c.parent_id IS NULL OR c.parent_id = n.id))
                      OR (n.kind = 'cluster' AND c.parent_id = n.id)
                    )) AS children_count
           FROM map_nodes n
          WHERE n.kind IN ('mapcard', 'cluster')
            AND n.parent_id IS NULL
            AND n.user_id = $1::uuid
            AND n.organization_id = $2::uuid
            AND n.deleted_at IS NULL
          ORDER BY (n.kind = 'cluster') DESC, n.updated_at DESC
          LIMIT $3::int`,
        [userId, orgId, limit],
      );
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Граф на заданому рівні.
   *
   * ## Що є вершиною
   *
   * `card` (типово) — картки. `cluster` — теки. `node` — самі вузли.
   * `expand` розкриває одну картку у її вузли, лишаючи решту згорнутими.
   *
   * ## Чому агрегація в SQL
   *
   * На рівні картки ребро — це не одне посилання, а всі посилання між двома
   * картками разом, з вагою. Порахувати це в браузері означало б спершу
   * привезти туди всі посилання всіх вузлів — тобто рівно те, чого рівень
   * картки й уникає.
   *
   * Саме заради цього запиту денормалізований `root_id`: без нього кожне ребро
   * вимагало б підйому по `path` до кореня.
   *
   * ## Чого тут немає
   *
   * Вкладеності. Вона ієрархія, а не зв'язок (MAP_NODE_MODEL.md, І7): якщо
   * малювати `parent_id` тими самими лініями, скелет дерева поглине смислові
   * зв'язки. Ребра типу `parent` з канваса теж не беремо — це розкладка
   * tree-режиму, а не те, що людина мала на увазі.
   */
  async getGraph(
    dbClient: PoolClient,
    userId: string,
    orgId: string,
    options: { level?: string; expand?: string | null; limit?: number } = {},
  ) {
    const level = ['card', 'node', 'cluster'].includes(options.level ?? '')
      ? (options.level as 'card' | 'node' | 'cluster')
      : 'card';
    const expand = level === 'card' ? options.expand ?? null : null;
    const limit = options.limit && options.limit > 0 ? options.limit : 5000;

    try {
      // ── Вершини ───────────────────────────────────────────────────────
      let vertexSql: string;
      const vertexValues: any[] = [userId, orgId, limit];

      if (level === 'cluster') {
        vertexSql = `
          SELECT id, kind, title, map_card_id
            FROM map_nodes
           WHERE kind = 'cluster'
             AND user_id = $1::uuid AND organization_id = $2::uuid
             AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $3::int`;
      } else if (level === 'node') {
        vertexSql = `
          SELECT id, kind, title, map_card_id, root_id
            FROM map_nodes
           WHERE kind NOT IN ('mapcard', 'cluster')
             AND user_id = $1::uuid AND organization_id = $2::uuid
             AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $3::int`;
      } else {
        // Розкрита картка поступається місцем своїм вузлам.
        vertexSql = `
          SELECT id, kind, title, map_card_id, root_id
            FROM map_nodes
           WHERE user_id = $1::uuid AND organization_id = $2::uuid
             AND deleted_at IS NULL
             AND (
               (kind = 'mapcard' AND ($4::text IS NULL OR id <> $4))
               OR ($4::text IS NOT NULL AND root_id = $4 AND kind NOT IN ('mapcard', 'cluster'))
             )
           ORDER BY updated_at DESC
           LIMIT $3::int`;
        vertexValues.push(expand);
      }

      const vertexResult = await dbClient.query(vertexSql, vertexValues);
      const vertices = vertexResult.rows;

      if (vertices.length === 0) {
        return { level, expand, nodes: [], edges: [], total: 0 };
      }

      // ── Ребра ─────────────────────────────────────────────────────────
      /**
       * Кінець ребра зводиться до вершини свого рівня:
       *   node    — сам вузол;
       *   card    — його картка (`root_id`), окрім розкритої;
       *   cluster — тека, в якій лежить картка.
       *
       * Один вираз на всі три рівні: інакше довелося б тримати три майже
       * однакові запити, які розходяться від першої ж правки.
       */
      let endpoint: string;
      if (level === 'node') {
        endpoint = '%s.id';
      } else if (level === 'cluster') {
        endpoint = '(SELECT c.parent_id FROM map_nodes c WHERE c.id = %s.root_id)';
      } else {
        endpoint = "CASE WHEN %s.root_id = $3::text THEN %s.id ELSE %s.root_id END";
      }

      const srcExpr = endpoint.replace(/%s/g, 's');
      const dstExpr = endpoint.replace(/%s/g, 't');

      const edgeValues: any[] = [userId, orgId];
      if (level === 'card') edgeValues.push(expand);

      const edgeResult = await dbClient.query(
        `WITH resolved AS (
           SELECT ${srcExpr} AS source, ${dstExpr} AS target, l.kind
             FROM map_node_links l
             JOIN map_nodes s ON s.id = l.from_node AND s.deleted_at IS NULL
             JOIN map_nodes t ON t.id = l.to_node   AND t.deleted_at IS NULL
            WHERE l.user_id = $1::uuid
              AND l.organization_id = $2::uuid
              AND l.kind IN ('ref', 'embed')
         )
         SELECT source, target, count(*)::int AS weight
           FROM resolved
          WHERE source IS NOT NULL AND target IS NOT NULL AND source <> target
          GROUP BY source, target`,
        edgeValues,
      );

      // Ребро, кінець якого не потрапив у вибірку вершин, малювати нікуди.
      const known = new Set(vertices.map((v: any) => v.id));
      const edges = edgeResult.rows
        .filter((e: any) => known.has(e.source) && known.has(e.target))
        .map((e: any) => ({
          id: `${e.source}::${e.target}`,
          source: e.source,
          target: e.target,
          weight: e.weight,
        }));

      // Розмір вершини в Sigma рахується з кількості зв'язків.
      const degree = new Map<string, number>();
      for (const edge of edges) {
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + edge.weight);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + edge.weight);
      }

      return {
        level,
        expand,
        nodes: vertices.map((v: any) => ({
          ...v,
          connectionCount: degree.get(v.id) ?? 0,
        })),
        edges,
        total: vertices.length,
      };
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Graph Error: ${error.message}`);
    }
  }

  /**
   * Пошук по вузлах організації.
   *
   * `ILIKE`, а не повнотекстовий запит: людина шукає по шматку слова
   * («канб» → «канбан»), а `to_tsquery` шукає по цілих лексемах і такого не
   * знайде. GIN-індекс по `content_text` лишається для того дня, коли з'явиться
   * справжній повнотекстовий режим.
   */
  async search(
    dbClient: PoolClient,
    query: string,
    userId: string,
    orgId: string,
    limit = 50,
  ) {
    try {
      const pattern = `%${query.replace(/[%_\\]/g, '\\$&')}%`;
      const result = await dbClient.query(
        `SELECT id, kind, parent_id, root_id, depth, title,
                left(content_text, 200) AS excerpt, updated_at
           FROM map_nodes
          WHERE user_id = $1::uuid
            AND organization_id = $2::uuid
            AND deleted_at IS NULL
            AND kind <> 'mapcard'
            AND (title ILIKE $3 OR content_text ILIKE $3)
          ORDER BY updated_at DESC
          LIMIT $4::int`,
        [userId, orgId, pattern, limit],
      );
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Search Error: ${error.message}`);
    }
  }

  /**
   * Предки вузла з назвами — хлібні крихти.
   *
   * `path` тримає предків у порядку від кореня, і цей порядок треба зберегти:
   * `WHERE id = ANY(path)` повертає рядки як завгодно, тому сортуємо по
   * позиції в масиві.
   */
  async findAncestors(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const result = await dbClient.query(
        `SELECT a.id, a.kind, a.title, a.map_card_id
           FROM map_nodes n
           JOIN LATERAL unnest(n.path) WITH ORDINALITY AS p(ancestor_id, ord) ON true
           JOIN map_nodes a ON a.id = p.ancestor_id
          WHERE n.id = $1
            AND n.user_id = $2::uuid
            AND n.organization_id = $3::uuid
            AND a.deleted_at IS NULL
          ORDER BY p.ord`,
        [id, userId, orgId],
      );
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /** Один вузол за id — для сторінки ноди і для панелі. */
  async findOne(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      const result = await dbClient.query(
        `SELECT id, kind, parent_id, root_id, depth, path, position,
                title, content, content_text, props, layout, tags,
                map_card_id, content_version, created_at, updated_at
           FROM map_nodes
          WHERE id = $1
            AND user_id = $2::uuid
            AND organization_id = $3::uuid
            AND deleted_at IS NULL`,
        [id, userId, orgId],
      );

      if (result.rows.length === 0) throw new NotFoundException('Node not found');
      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Прямі діти вузла — те, що показує список усередині ноди.
   *
   * Тільки один рівень: глибше йдуть, коли відкривають саму дитину. Інакше
   * відкриття однієї ноди тягнуло б усе піддерево, яким би глибоким воно не
   * було.
   */
  async findChildren(
    dbClient: PoolClient,
    parentId: string,
    userId: string,
    orgId: string,
  ) {
    try {
      /**
       * «Діти» означають різне залежно від того, хто батько.
       *
       * У картки це вузли її канваса — вони мають `root_id` картки і
       * `parent_id IS NULL`, бо всередині картки нікому не належать. Плюс ті,
       * що заведені кнопкою «+» прямо під карткою: у них `parent_id` = картка.
       * Без другої умови така нода зникала б одразу після створення.
       * У кластера і у звичайного вузла це прямий `parent_id`.
       *
       * Одна умова на обидва випадки: інакше дерево показувало б картки
       * порожніми — саме так воно й поводилося, поки тут стояв самий
       * `parent_id = $1`.
       */
      const result = await dbClient.query(
        `SELECT n.id, n.kind, n.parent_id, n.root_id, n.depth, n.path, n.position,
                n.title, n.content_text, n.props, n.map_card_id,
                n.content_version, n.updated_at,
                (SELECT count(*) FROM map_nodes c
                  WHERE c.deleted_at IS NULL
                    AND (
                      (n.kind = 'mapcard' AND c.root_id = n.id AND c.kind <> 'mapcard'
                        AND (c.parent_id IS NULL OR c.parent_id = n.id))
                      OR (n.kind <> 'mapcard' AND c.parent_id = n.id)
                    )) AS children_count
           FROM map_nodes p
           JOIN map_nodes n ON (
                  (p.kind = 'mapcard' AND n.root_id = p.id AND n.kind <> 'mapcard'
                    AND (n.parent_id IS NULL OR n.parent_id = p.id))
               OR (p.kind <> 'mapcard' AND n.parent_id = p.id)
             )
          WHERE p.id = $1
            AND p.user_id = $2::uuid
            AND p.organization_id = $3::uuid
            AND p.deleted_at IS NULL
            AND n.user_id = $2::uuid
            AND n.organization_id = $3::uuid
            AND n.deleted_at IS NULL
          ORDER BY n.position ASC, n.created_at ASC`,
        [parentId, userId, orgId],
      );
      return result.rows;
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Select Error: ${error.message}`);
    }
  }

  /**
   * Кластер — контейнер карток. Така сама нода, лише з іншим `kind`.
   *
   * `root_id` вказує сам на себе, `path` лишається порожнім: кластери живуть
   * окремою ієрархією над картками і в `path` вузлів не беруть участі. Це
   * навмисно — `path` описує вкладеність усередині картки, і домішувати туди
   * теки означало б, що видалення теки каскадиться в чужі документи.
   */
  async createCluster(
    dbClient: PoolClient,
    dto: { id: string; title?: string; parent_id?: string | null },
    userId: string,
    orgId: string,
  ) {
    try {
      const result = await dbClient.query(
        `INSERT INTO map_nodes (
            id, organization_id, user_id, kind, parent_id, root_id,
            depth, path, position, title, props
         )
         VALUES ($1, $2::uuid, $3::uuid, 'cluster', $4, $1, 0, '{}'::text[],
                 COALESCE(
                   (SELECT MAX(s.position) + 1 FROM map_nodes s
                     WHERE s.user_id = $3::uuid
                       AND s.organization_id = $2::uuid
                       AND s.kind IN ('cluster', 'mapcard')
                       AND s.parent_id IS NOT DISTINCT FROM $4),
                   0
                 ),
                 $5, '{}'::jsonb)
         RETURNING *`,
        [dto.id, orgId, userId, dto.parent_id ?? null, dto.title ?? 'Новый кластер'],
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  /**
   * Переносить картку або кластер в інший кластер.
   *
   * Тільки їх: перенос вузла всередині картки змінює `root_id`, `depth` і
   * `path` УСЬОГО піддерева однією транзакцією, і це окрема робота
   * (MAP_NODE_MODEL.md §7, пастка 3). Тут же змінюється рівно одна колонка.
   */
  async moveToCluster(
    dbClient: PoolClient,
    id: string,
    parentId: string | null,
    userId: string,
    orgId: string,
  ) {
    try {
      // Кластер не можна покласти в самого себе або у власного нащадка —
      // вийшло б кільце, з якого дерево ніколи не вибереться.
      if (parentId) {
        if (parentId === id) {
          throw new BadRequestException('Cannot move a cluster into itself');
        }

        const cycle = await dbClient.query(
          `WITH RECURSIVE up AS (
             SELECT id, parent_id FROM map_nodes
              WHERE id = $1 AND user_id = $3::uuid AND organization_id = $4::uuid
             UNION ALL
             SELECT n.id, n.parent_id FROM map_nodes n JOIN up ON n.id = up.parent_id
           )
           SELECT 1 FROM up WHERE id = $2 LIMIT 1`,
          [parentId, id, userId, orgId],
        );

        if (cycle.rows.length > 0) {
          throw new BadRequestException('Cannot move a cluster into its own descendant');
        }
      }

      const result = await dbClient.query(
        `UPDATE map_nodes
            SET parent_id = $1
          WHERE id = $2
            AND kind IN ('mapcard', 'cluster')
            AND user_id = $3::uuid
            AND organization_id = $4::uuid
            AND deleted_at IS NULL
         RETURNING id, parent_id, kind`,
        [parentId, id, userId, orgId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Card or cluster not found');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Move Error: ${error.message}`);
    }
  }

  /**
   * Створює вкладений вузол усередині батька.
   *
   * `root_id`, `depth` і `path` беруться з батьківського рядка, а не з тіла
   * запиту: клієнт не має можливості покласти дитину в чуже піддерево, навіть
   * помилково.
   */
  async createChild(
    dbClient: PoolClient,
    dto: { id: string; parent_id: string; kind: string; title?: string },
    userId: string,
    orgId: string,
  ) {
    try {
      const result = await dbClient.query(
        `INSERT INTO map_nodes (
            id, organization_id, user_id, kind, parent_id, root_id,
            depth, path, position, title, content, props
         )
         SELECT $1, $2::uuid, $3::uuid, $4, p.id, p.root_id,
                p.depth + 1, p.path || p.id,
                COALESCE(
                  (SELECT MAX(s.position) + 1 FROM map_nodes s WHERE s.parent_id = p.id),
                  0
                ),
                $5, '[]'::jsonb, '{}'::jsonb
           FROM map_nodes p
          WHERE p.id = $6
            AND p.user_id = $3::uuid
            AND p.organization_id = $2::uuid
            AND p.deleted_at IS NULL
         RETURNING *`,
        [dto.id, orgId, userId, dto.kind, dto.title ?? '', dto.parent_id],
      );

      // Порожньо — батька немає або він чужий. Обидва випадки для клієнта
      // однакові: вкладати нікуди.
      if (result.rows.length === 0) {
        throw new NotFoundException('Parent node not found');
      }

      return result.rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Insert Error: ${error.message}`);
    }
  }

  /** Зміст або назва одного вузла — те, чим користується редактор панелі. */
  async updateOne(
    dbClient: PoolClient,
    id: string,
    dto: { title?: string; content?: any[]; content_text?: string; props?: Record<string, any> },
    userId: string,
    orgId: string,
  ) {
    try {
      const sets: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (dto.title !== undefined) {
        sets.push(`title = $${i++}`);
        values.push(dto.title);
      }
      if (dto.content !== undefined) {
        sets.push(`content = $${i++}::jsonb`);
        values.push(JSON.stringify(dto.content));
      }
      if (dto.content_text !== undefined) {
        sets.push(`content_text = $${i++}`);
        values.push(dto.content_text);
      }
      if (dto.props !== undefined) {
        sets.push(`props = $${i++}::jsonb`);
        values.push(JSON.stringify(dto.props));
      }

      if (sets.length === 0) return null;

      sets.push('content_version = content_version + 1');
      values.push(id, userId, orgId);

      const result = await dbClient.query(
        `UPDATE map_nodes
            SET ${sets.join(', ')}
          WHERE id = $${i++}
            AND user_id = $${i++}::uuid
            AND organization_id = $${i++}::uuid
            AND deleted_at IS NULL
         RETURNING id, title, content_version, updated_at`,
        values,
      );

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

  /**
   * М'яко ховає вузол разом із усім, що всередині нього.
   *
   * Піддерево знаходиться через `path`: у кожного нащадка id цього вузла
   * стоїть серед предків. Рекурсія не потрібна, індекс GIN по `path` це вміє.
   *
   * Повертає позначку часу — за нею `restore` повертає рівно те, що прибрав
   * цей виклик, а не все, що колись видаляли з цього піддерева.
   */
  async removeSubtree(dbClient: PoolClient, id: string, userId: string, orgId: string) {
    try {
      // Кластери в `path` не беруть участі (див. `createCluster`), тож
      // видалення теки не забрало б із собою картки — вони просто зникли б з
      // дерева, лишившись без батька. Тому непорожню теку не видаляємо взагалі:
      // хай спершу скажуть, що робити з тим, що в ній лежить.
      const nonEmptyCluster = await dbClient.query(
        `SELECT 1
           FROM map_nodes c
          WHERE c.parent_id = $1
            AND c.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM map_nodes p
               WHERE p.id = $1 AND p.kind = 'cluster'
                 AND p.user_id = $2::uuid AND p.organization_id = $3::uuid
            )
          LIMIT 1`,
        [id, userId, orgId],
      );

      if (nonEmptyCluster.rows.length > 0) {
        throw new BadRequestException('Cluster is not empty');
      }

      const result = await dbClient.query(
        `UPDATE map_nodes
            SET deleted_at = now()
          WHERE (id = $1 OR $1 = ANY(path))
            AND user_id = $2::uuid
            AND organization_id = $3::uuid
            AND deleted_at IS NULL
         RETURNING id, deleted_at`,
        [id, userId, orgId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Node not found or already deleted');
      }

      return {
        removed: result.rows.map((row: any) => row.id),
        deleted_at: result.rows[0].deleted_at,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Delete Error: ${error.message}`);
    }
  }

  /** Скасування видалення: повертає рівно ті рядки, що прибрав один виклик. */
  async restoreSubtree(
    dbClient: PoolClient,
    id: string,
    deletedAt: string,
    userId: string,
    orgId: string,
  ) {
    try {
      const result = await dbClient.query(
        `UPDATE map_nodes
            SET deleted_at = NULL
          WHERE (id = $1 OR $1 = ANY(path))
            AND deleted_at = $2::timestamptz
            AND user_id = $3::uuid
            AND organization_id = $4::uuid
         RETURNING id`,
        [id, deletedAt, userId, orgId],
      );

      return { restored: result.rows.map((row: any) => row.id) };
    } catch (error: any) {
      if (error.code === '42501') throw new ForbiddenException('Відмовлено в доступі RLS');
      throw new InternalServerErrorException(`DB Restore Error: ${error.message}`);
    }
  }

  /**
   * Приводить рядки картки до стану, який щойно зберігся в `data_core`.
   *
   * Шлеться картка цілком, а не «брудні» вузли. Це свідомо: на перехідному
   * етапі рядки мусять збігатися з блобом байт у байт, інакше перемикання
   * читання (наступний етап) покаже не те, що бачить користувач. Обсяг той
   * самий, що вже йде в блобі, тож зайвого трафіку це не додає.
   *
   * Усе одним транзакційним походом: dbClient уже всередині транзакції
   * (`withUserContext`), тож або застосується все, або нічого.
   */
  async sync(
    dbClient: PoolClient,
    dto: SyncMapNodesDto,
    userId: string,
    orgId: string,
  ) {
    const rootId = this.rootIdOf(dto.map_card_id);
    const partial = dto.mode === 'partial';

    try {
      // ── Контейнер картки ────────────────────────────────────────────────
      // ON CONFLICT з перевіркою власника: id детермінований, і без цієї
      // умови чужа картка з тим самим номером могла б бути перезаписана.
      //
      // У частковому режимі контейнер надсилають лише коли він змінився —
      // тоді ж він і оновлюється. Але створити його треба в будь-якому разі:
      // без цього рядка ребра нема на що вішати.
      const container = await dbClient.query(
        `INSERT INTO map_nodes (
            id, organization_id, user_id, kind, parent_id, root_id, depth, path,
            position, title, props, map_card_id
         )
         VALUES ($1, $2::uuid, $3::uuid, 'mapcard', NULL, $1, 0, '{}'::text[],
                 0, $4, $5::jsonb, $6::bigint)
         ON CONFLICT (id) DO UPDATE
            SET title = CASE WHEN $7::boolean THEN EXCLUDED.title ELSE map_nodes.title END,
                props = CASE WHEN $7::boolean THEN EXCLUDED.props ELSE map_nodes.props END,
                updated_at = now()
          WHERE map_nodes.user_id = EXCLUDED.user_id
            AND map_nodes.organization_id = EXCLUDED.organization_id
         RETURNING id`,
        [
          rootId,
          orgId,
          userId,
          dto.container?.title ?? '',
          JSON.stringify(dto.container?.props ?? {}),
          dto.map_card_id,
          dto.container !== undefined,
        ],
      );

      if (container.rows.length === 0) {
        throw new ForbiddenException('Map card belongs to another owner');
      }

      const nodes = dto.nodes ?? [];
      const ids = nodes.map((n) => n.id);
      const versions: Array<{ id: string; content_version: number }> = [];
      let conflicts: Array<{ id: string; content_version: number }> = [];

      // ── Вузли ───────────────────────────────────────────────────────────
      if (nodes.length > 0) {
        // Повторений id в одному стейтменті завалив би весь INSERT
        // («cannot affect row a second time»).
        const unique = new Map<string, (typeof nodes)[number]>();
        for (const node of nodes) unique.set(node.id, node);

        const values: any[] = [];
        const tuples = [...unique.values()]
          .map((node, index) => {
            const p = values.length;
            values.push(
              node.id,
              orgId,
              userId,
              node.kind,
              rootId,
              node.position ?? index,
              node.title ?? '',
              node.content == null ? null : JSON.stringify(node.content),
              node.content_text ?? null,
              JSON.stringify(node.props ?? {}),
              node.layout == null ? null : JSON.stringify(node.layout),
              // Версія, яку клієнт вважає поточною. Для нового рядка вона ж
              // стає початковою; для наявного — звіряється нижче.
              node.expected_version ?? 1,
            );
            return (
              `($${p + 1}, $${p + 2}::uuid, $${p + 3}::uuid, $${p + 4}, NULL, $${p + 5}, ` +
              `1, ARRAY[$${p + 5}]::text[], $${p + 6}::int, $${p + 7}, ` +
              `$${p + 8}::jsonb, $${p + 9}, $${p + 10}::jsonb, $${p + 11}::jsonb, $${p + 12}::int)`
            );
          })
          .join(', ');

        /**
         * Версію звіряємо тільки в частковому режимі.
         *
         * `EXCLUDED.content_version` — це очікувана клієнтом версія: збіглася зі
         * збереженою — пишемо і піднімаємо на одиницю; ні — рядок не чіпаємо, і
         * він не потрапить у RETURNING. Так правка іншої вкладки не зникає
         * мовчки.
         *
         * Повна синхронізація авторитетна за визначенням (нею відновлюють
         * картку, про стан якої клієнт нічого не знає), тому там версія просто
         * зростає.
         */
        const versionGuard = partial
          ? 'AND map_nodes.content_version = EXCLUDED.content_version'
          : '';
        const versionSet = partial
          ? 'EXCLUDED.content_version + 1'
          : 'map_nodes.content_version + 1';

        const upserted = await dbClient.query(
          `INSERT INTO map_nodes (
              id, organization_id, user_id, kind, parent_id, root_id,
              depth, path, position, title, content, content_text, props, layout,
              content_version
           )
           VALUES ${tuples}
           ON CONFLICT (id) DO UPDATE
              SET kind            = EXCLUDED.kind,
                  root_id         = EXCLUDED.root_id,
                  position        = EXCLUDED.position,
                  title           = EXCLUDED.title,
                  content         = EXCLUDED.content,
                  content_text    = EXCLUDED.content_text,
                  props           = EXCLUDED.props,
                  layout          = EXCLUDED.layout,
                  content_version = ${versionSet},
                  deleted_at      = NULL,
                  updated_at      = now()
            WHERE map_nodes.user_id = EXCLUDED.user_id
              AND map_nodes.organization_id = EXCLUDED.organization_id
              ${versionGuard}
           RETURNING id, content_version`,
          values,
        );

        versions.push(...upserted.rows);

        // Не повернувся — або версія розійшлася, або рядок чужий. Клієнту
        // потрібна поточна версія, інакше наступна спроба розіб'ється так само.
        if (upserted.rows.length < unique.size) {
          const applied = new Set(upserted.rows.map((row: any) => row.id));
          const missed = [...unique.keys()].filter((id) => !applied.has(id));

          if (missed.length > 0) {
            const current = await dbClient.query(
              `SELECT id, content_version FROM map_nodes
                WHERE id = ANY($1::text[])
                  AND user_id = $2::uuid
                  AND organization_id = $3::uuid`,
              [missed, userId, orgId],
            );
            conflicts = current.rows;
          }
        }
      }

      // ── Вузли, яких у картці більше немає ───────────────────────────────
      // М'яко: undo-тост у MapCardEditor ще може повернути вузол, а наступна
      // синхронізація зніме мітку через `deleted_at = NULL` вище.
      //
      // Повний режим: видаленим вважається все, чого немає в тілі.
      // Частковий: тільки те, що клієнт назвав явно, — інакше кожне
      // збереження ховало б усі вузли, які просто не змінювалися.
      if (partial) {
        const removed = dto.removed_node_ids ?? [];
        if (removed.length > 0) {
          await dbClient.query(
            `UPDATE map_nodes
                SET deleted_at = now()
              WHERE root_id = $1
                AND kind <> 'mapcard'
                AND user_id = $2::uuid
                AND organization_id = $3::uuid
                AND deleted_at IS NULL
                AND id = ANY($4::text[])`,
            [rootId, userId, orgId, removed],
          );
        }
      } else {
        // `parent_id IS NULL` — тільки верхній рівень.
        //
        // Вкладені вузли в `data_core` не потрапляють узагалі: канвас малює
        // вузли картки, а вкладені живуть усередині свого батька. Для повної
        // синхронізації, тілом якої є картка, їх просто не існує — і без цієї
        // умови вона ховала б їх усі як «зайві».
        await dbClient.query(
          `UPDATE map_nodes
              SET deleted_at = now()
            WHERE root_id = $1
              AND kind <> 'mapcard'
              AND parent_id IS NULL
              AND user_id = $2::uuid
              AND organization_id = $3::uuid
              AND deleted_at IS NULL
              AND NOT (id = ANY($4::text[]))`,
          [rootId, userId, orgId, ids],
        );
      }

      // ── Ребра канваса ───────────────────────────────────────────────────
      // Перезаписуємо цілком: ребер у картці одиниці, а звіряти їх поштучно
      // означало б тримати для них окремий id, якого в DataCore немає.
      // Зв'язки картка↔картка не чіпаються — у них інший кінець (контейнер).
      //
      // У частковому режимі `links` без значення означає «ребра не змінювалися,
      // не чіпати». Порожній масив — інша річ: це «ребер більше немає».
      const links = (dto.links ?? []).filter(
        (link) => link.from_node && link.to_node,
      );
      const touchLinks = !partial || dto.links !== undefined;

      if (touchLinks) {
        await dbClient.query(
          `DELETE FROM map_node_links l
            USING map_nodes s
            WHERE s.id = l.from_node
              AND s.root_id = $1
              AND s.kind <> 'mapcard'
              AND l.organization_id = $2::uuid`,
          [rootId, orgId],
        );
      }

      if (touchLinks && links.length > 0) {
        const values: any[] = [];
        const tuples = links
          .map((link) => {
            const p = values.length;
            values.push(
              orgId,
              userId,
              link.from_node,
              link.to_node,
              link.kind || 'arrow',
              JSON.stringify(link.props ?? {}),
            );
            return `($${p + 1}::uuid, $${p + 2}::uuid, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}::jsonb)`;
          })
          .join(', ');

        // Кінці мусять існувати — FK інакше завалить увесь стейтмент через
        // одне ребро, що вказує на вже видалений вузол.
        await dbClient.query(
          `INSERT INTO map_node_links (organization_id, user_id, from_node, to_node, kind, props)
           SELECT v.org, v.usr, v.src, v.dst, v.kind, v.props
             FROM (VALUES ${tuples}) AS v(org, usr, src, dst, kind, props)
             JOIN map_nodes s ON s.id = v.src AND s.root_id = $${values.length + 1}
             JOIN map_nodes t ON t.id = v.dst AND t.root_id = $${values.length + 1}
           ON CONFLICT DO NOTHING`,
          [...values, rootId],
        );
      }

      return {
        nodes: ids.length,
        links: touchLinks ? links.length : null,
        /** Версії записаних рядків — клієнт кладе їх у свій знімок. */
        versions,
        /**
         * Рядки, які змінила інша вкладка: повертаємо їхню поточну версію,
         * щоб наступна спроба не розбилася об ту саму розбіжність.
         */
        conflicts,
      };
    } catch (error: any) {
      if (error instanceof ForbiddenException) throw error;
      if (error.code === '42501') {
        throw new ForbiddenException('Відмовлено в доступі RLS');
      }
      throw new InternalServerErrorException(`DB Sync Error: ${error.message}`);
    }
  }
}
