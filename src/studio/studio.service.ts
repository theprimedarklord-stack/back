import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DatabaseService } from '../db/database.service';

/**
 * StudioService — раздел /studio, 3D-редактор моделей.
 *
 * РАЗДЕЛЕНИЕ ДАННЫХ (см. SmartMemory--NextJS/STUDIO_SETUP.txt):
 *   файлы моделей (.glb/.gltf) → Supabase Storage, бакет studio-models
 *   описание сцены            → studio_scenes.data (jsonb)
 *
 * Файлы НЕ проходят через бекенд. Клиент получает здесь подписанный URL и
 * льёт байты прямо в Storage. Причины: универсальный BFF во фронте читает
 * тело как req.text() и портит бинарь, плюс гнать сотни мегабайт через два
 * прокси незачем. Решение о правах при этом остаётся за бекендом — он
 * выдаёт или не выдаёт ссылку.
 *
 * Все запросы к БД идут через withUserContext(userId, orgId), который ставит
 * app.user_id и app.org_id для RLS. organization_id дополнительно
 * присутствует в WHERE/INSERT — defense-in-depth, как в CardsService.
 */
@Injectable()
export class StudioService {
  private readonly logger = new Logger(StudioService.name);

  private readonly BUCKET = 'studio-models';

  /** Разрешённые расширения моделей. */
  private readonly ALLOWED_EXT = ['glb', 'gltf'];

  /**
   * Лимит на файл. 50 МБ — ограничение free-тарифа Supabase Storage,
   * поднять выше в бакете нельзя. Проверяем и здесь, чтобы вернуть
   * понятную ошибку до выдачи ссылки, а не отказ от Storage после.
   */
  private readonly MAX_SIZE_BYTES = 50 * 1024 * 1024;

  /** Время жизни подписанной ссылки. Хватает начать загрузку, не больше. */
  private readonly UPLOAD_URL_TTL_SEC = 300;
  private readonly DOWNLOAD_URL_TTL_SEC = 3600;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly databaseService: DatabaseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Сцены
  // ---------------------------------------------------------------------------

  async listScenes(userId: string, orgId: string) {
    return this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, organization_id, owner_id, name, version, created_at, updated_at
        FROM public.studio_scenes
        WHERE organization_id = $1::uuid
        ORDER BY updated_at DESC
      `;
      const res = await client.query(sql, [orgId]);
      return res.rows;
    });
  }

  async getScene(userId: string, orgId: string, sceneId: string) {
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, organization_id, owner_id, name, data, version, created_at, updated_at
        FROM public.studio_scenes
        WHERE id = $1::uuid AND organization_id = $2::uuid
      `;
      const res = await client.query(sql, [sceneId, orgId]);
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Scene not found');
    return rows[0];
  }

  async createScene(userId: string, orgId: string, name?: string, data?: unknown) {
    return this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        INSERT INTO public.studio_scenes (organization_id, owner_id, name, data)
        VALUES ($1::uuid, $2, $3, $4::jsonb)
        RETURNING id, organization_id, owner_id, name, data, version, created_at, updated_at
      `;
      const res = await client.query(sql, [
        orgId,
        userId,
        name?.trim() || 'Untitled scene',
        JSON.stringify(data ?? {}),
      ]);
      return res.rows[0];
    });
  }

  /**
   * Сохранение сцены.
   *
   * version инкрементируется на стороне БД. Это не оптимистичная блокировка —
   * последняя запись побеждает. Полноценный контроль конфликтов появится
   * вместе с историей версий (см. ЧАСТЬ 6 в STUDIO_SETUP.txt).
   */
  async updateScene(
    userId: string,
    orgId: string,
    sceneId: string,
    patch: { name?: string; data?: unknown },
  ) {
    if (patch.name === undefined && patch.data === undefined) {
      throw new BadRequestException('Nothing to update: pass name and/or data');
    }

    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        UPDATE public.studio_scenes
        SET name       = COALESCE($3, name),
            data       = COALESCE($4::jsonb, data),
            version    = version + 1,
            updated_at = now()
        WHERE id = $1::uuid AND organization_id = $2::uuid
        RETURNING id, organization_id, owner_id, name, version, created_at, updated_at
      `;
      const res = await client.query(sql, [
        sceneId,
        orgId,
        patch.name?.trim() ?? null,
        patch.data === undefined ? null : JSON.stringify(patch.data),
      ]);
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Scene not found');
    return rows[0];
  }

  async deleteScene(userId: string, orgId: string, sceneId: string) {
    // Файлы в Storage сознательно НЕ удаляются: один ассет может
    // использоваться несколькими сценами, а таблицы-связки пока нет.
    // Сборка мусора — отдельная задача, см. STUDIO_SETUP.txt, ЧАСТЬ 6.
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        DELETE FROM public.studio_scenes
        WHERE id = $1::uuid AND organization_id = $2::uuid
        RETURNING id
      `;
      const res = await client.query(sql, [sceneId, orgId]);
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Scene not found');
    return { id: rows[0].id };
  }

  // ---------------------------------------------------------------------------
  // Ассеты
  // ---------------------------------------------------------------------------

  /**
   * Выдаёт подписанный URL на загрузку файла модели.
   *
   * Порядок намеренно такой: сначала пишем строку в studio_assets, чтобы
   * получить её id, и только потом строим путь {orgId}/{assetId}.ext.
   * Так путь в Storage детерминирован и всегда имеет владельца в БД —
   * не бывает файлов-сирот, про которые никто не знает.
   */
  async createUploadUrl(
    userId: string,
    orgId: string,
    input: { fileName: string; sizeBytes: number; mime?: string; checksum?: string },
  ) {
    const ext = this.extensionOf(input.fileName);
    if (!this.ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException(`Unsupported model format: .${ext}. Allowed: .glb, .gltf`);
    }

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be a positive number');
    }

    if (input.sizeBytes > this.MAX_SIZE_BYTES) {
      const limitMb = Math.floor(this.MAX_SIZE_BYTES / (1024 * 1024));
      throw new BadRequestException(
        `File is too large: ${(input.sizeBytes / 1048576).toFixed(1)} MB, limit is ${limitMb} MB. ` +
          `Compress the model (Draco / meshopt) or reduce texture size.`,
      );
    }

    // Дедупликация: тот же checksum в той же организации — переиспользуем.
    if (input.checksum) {
      const existing = await this.findAssetByChecksum(userId, orgId, input.checksum);
      if (existing) {
        this.logger.debug(`Asset deduplicated by checksum for org ${orgId}`);
        return { asset: existing, uploadUrl: null, deduplicated: true };
      }
    }

    const asset = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        INSERT INTO public.studio_assets
          (organization_id, owner_id, file_name, storage_path, mime, size_bytes, checksum)
        VALUES ($1::uuid, $2, $3, '', $4, $5, $6)
        RETURNING id
      `;
      const res = await client.query(sql, [
        orgId,
        userId,
        input.fileName,
        input.mime ?? null,
        input.sizeBytes,
        input.checksum ?? null,
      ]);
      return res.rows[0];
    });

    const storagePath = `${orgId}/${asset.id}.${ext}`;

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .storage.from(this.BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (error || !data) {
      // Ссылку выдать не смогли — убираем строку, чтобы не осталась запись
      // без файла.
      await this.hardDeleteAssetRow(userId, orgId, asset.id);
      this.logger.error(`createSignedUploadUrl failed for ${storagePath}`, error);
      throw new BadRequestException(error?.message || 'Failed to create upload URL');
    }

    await this.databaseService.withUserContext(userId, orgId, async (client) => {
      await client.query(
        `UPDATE public.studio_assets SET storage_path = $3
         WHERE id = $1::uuid AND organization_id = $2::uuid`,
        [asset.id, orgId, storagePath],
      );
    });

    return {
      asset: { id: asset.id, file_name: input.fileName, storage_path: storagePath },
      uploadUrl: { signedUrl: data.signedUrl, token: data.token, path: storagePath },
      deduplicated: false,
      expiresInSec: this.UPLOAD_URL_TTL_SEC,
    };
  }

  async listAssets(userId: string, orgId: string) {
    return this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, file_name, storage_path, mime, size_bytes, checksum, created_at
        FROM public.studio_assets
        WHERE organization_id = $1::uuid
        ORDER BY created_at DESC
      `;
      const res = await client.query(sql, [orgId]);
      return res.rows;
    });
  }

  /**
   * Подписанная ссылка на ЧТЕНИЕ. Нужна потому, что бакет приватный:
   * модели клиентов не должны лежать по угадываемым публичным URL.
   */
  async createDownloadUrl(userId: string, orgId: string, assetId: string) {
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, file_name, storage_path, mime, size_bytes
        FROM public.studio_assets
        WHERE id = $1::uuid AND organization_id = $2::uuid
      `;
      const res = await client.query(sql, [assetId, orgId]);
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Asset not found');
    const asset = rows[0];

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .storage.from(this.BUCKET)
      .createSignedUrl(asset.storage_path, this.DOWNLOAD_URL_TTL_SEC);

    if (error || !data) {
      this.logger.error(`createSignedUrl failed for ${asset.storage_path}`, error);
      throw new BadRequestException(error?.message || 'Failed to create download URL');
    }

    return {
      asset,
      signedUrl: data.signedUrl,
      expiresInSec: this.DOWNLOAD_URL_TTL_SEC,
    };
  }

  async deleteAsset(userId: string, orgId: string, assetId: string) {
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        DELETE FROM public.studio_assets
        WHERE id = $1::uuid AND organization_id = $2::uuid
        RETURNING id, storage_path
      `;
      const res = await client.query(sql, [assetId, orgId]);
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Asset not found');

    const { error } = await this.supabaseService
      .getAdminClient()
      .storage.from(this.BUCKET)
      .remove([rows[0].storage_path]);

    // Строку уже удалили. Если файл не убрался — это мусор в Storage, но не
    // повод возвращать ошибку клиенту: с точки зрения пользователя ассет удалён.
    if (error) {
      this.logger.warn(`Storage remove failed for ${rows[0].storage_path}: ${error.message}`);
    }

    return { id: rows[0].id };
  }

  // ---------------------------------------------------------------------------
  // Вспомогательное
  // ---------------------------------------------------------------------------

  private extensionOf(fileName: string): string {
    const parts = fileName.toLowerCase().split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  private async findAssetByChecksum(userId: string, orgId: string, checksum: string) {
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, file_name, storage_path, mime, size_bytes, checksum, created_at
        FROM public.studio_assets
        WHERE organization_id = $1::uuid AND checksum = $2
        LIMIT 1
      `;
      const res = await client.query(sql, [orgId, checksum]);
      return res.rows;
    });
    return rows[0] ?? null;
  }

  private async hardDeleteAssetRow(userId: string, orgId: string, assetId: string) {
    try {
      await this.databaseService.withUserContext(userId, orgId, async (client) => {
        await client.query(
          `DELETE FROM public.studio_assets WHERE id = $1::uuid AND organization_id = $2::uuid`,
          [assetId, orgId],
        );
      });
    } catch (e) {
      this.logger.warn(`Failed to roll back asset row ${assetId}`, e);
    }
  }
}
