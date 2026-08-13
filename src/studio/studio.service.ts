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
  // История версий
  //
  // Снимки создаёт ТРИГГЕР trg_studio_scenes_archive_version на UPDATE
  // studio_scenes (см. db/migrations/20260813_create_studio_scene_versions.sql).
  // Здесь только чтение и восстановление — писать историю из кода нельзя,
  // иначе снимок и инкремент version перестанут быть атомарными.
  // ---------------------------------------------------------------------------

  /**
   * Точки восстановления сцены, свежие сверху.
   *
   * data НЕ выбирается СОЗНАТЕЛЬНО: снимок сцены весит от десятков килобайт до
   * мегабайт, а держим мы до 50 снимков на сцену. Отдать их одним списком
   * значило бы слать мегабайты ради колонки, которую список даже не показывает.
   * Содержимое достаётся отдельно, по одной версии.
   *
   * instance_count — сколько моделей было в сцене на момент снимка. Без него
   * список превращается в столбец одинаковых дат, по которому невозможно
   * выбрать, куда возвращаться. jsonb_array_length падает на не-массиве,
   * поэтому тип проверяется явно: в старых снимках поля может не быть.
   */
  async listSceneVersions(userId: string, orgId: string, sceneId: string) {
    return this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, version, name, created_by, created_at,
               CASE WHEN jsonb_typeof(data->'instances') = 'array'
                    THEN jsonb_array_length(data->'instances')
                    ELSE 0
               END AS instance_count
        FROM public.studio_scene_versions
        WHERE scene_id = $1::uuid AND organization_id = $2::uuid
        ORDER BY created_at DESC
      `;
      const res = await client.query(sql, [sceneId, orgId]);
      return res.rows;
    });
  }

  /** Содержимое одной версии — для предпросмотра без восстановления. */
  async getSceneVersion(userId: string, orgId: string, sceneId: string, versionId: string) {
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const sql = `
        SELECT id, version, name, data, created_by, created_at
        FROM public.studio_scene_versions
        WHERE id = $1::uuid AND scene_id = $2::uuid AND organization_id = $3::uuid
      `;
      const res = await client.query(sql, [versionId, sceneId, orgId]);
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Version not found');
    return rows[0];
  }

  /**
   * Возвращает сцену к состоянию снимка.
   *
   * ВОССТАНОВЛЕНИЕ САМО ОБРАТИМО. Перед перезаписью текущее состояние явно
   * кладётся в историю — иначе человек, откатившийся не туда, терял бы работу
   * безвозвратно. Полагаться на триггер здесь нельзя: он прореживает снимки и
   * пропускает запись, если предыдущая моложе 5 минут, а откат сразу после
   * сохранения — как раз этот случай.
   *
   * Ручная вставка и триггер друг друга не дублируют: триггер в той же
   * транзакции увидит только что вставленную строку, посчитает её свежей и
   * пропустит свою запись.
   *
   * Имя сцены снимок НЕ возвращает, хотя и хранит. Переименование версию не
   * создаёт (см. функцию триггера), поэтому имя в снимке может быть сколь
   * угодно устаревшим — откат содержимого не повод менять название документа.
   */
  async restoreSceneVersion(
    userId: string,
    orgId: string,
    sceneId: string,
    versionId: string,
  ) {
    return this.databaseService.withUserContext(userId, orgId, async (client) => {
      const snapshot = await client.query(
        `SELECT data, version
         FROM public.studio_scene_versions
         WHERE id = $1::uuid AND scene_id = $2::uuid AND organization_id = $3::uuid`,
        [versionId, sceneId, orgId],
      );

      if (snapshot.rows.length === 0) throw new NotFoundException('Version not found');

      const restoredData = JSON.stringify(snapshot.rows[0].data);

      // Архивируем то, что есть сейчас. Условие data IS DISTINCT FROM отсекает
      // откат на состояние, которое и так открыто, — плодить одинаковые снимки
      // незачем.
      //
      // Отсечка «последние 50» тут не повторяется: лишняя строка проживёт до
      // следующего сохранения, когда триггер подрежет историю штатно.
      await client.query(
        `INSERT INTO public.studio_scene_versions
           (scene_id, organization_id, version, name, data, created_by)
         SELECT id, organization_id, version, name, data, $3
         FROM public.studio_scenes
         WHERE id = $1::uuid
           AND organization_id = $2::uuid
           AND data IS DISTINCT FROM $4::jsonb`,
        [sceneId, orgId, userId, restoredData],
      );

      const updated = await client.query(
        `UPDATE public.studio_scenes
         SET data = $3::jsonb,
             version = version + 1,
             updated_at = now()
         WHERE id = $1::uuid AND organization_id = $2::uuid
         RETURNING id, organization_id, owner_id, name, version, created_at, updated_at`,
        [sceneId, orgId, restoredData],
      );

      if (updated.rows.length === 0) throw new NotFoundException('Scene not found');

      return { scene: updated.rows[0], restoredFrom: snapshot.rows[0].version as number };
    });
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

    // -------------------------------------------------------------------------
    // Дедупликация: тот же checksum в той же организации — переиспользуем.
    //
    // ВАЖНО: наличие строки в studio_assets НЕ доказывает, что файл лежит в
    // Storage. Строка пишется ДО загрузки байтов (чтобы получить id для пути),
    // поэтому любая неудача после неё — оборванная сеть, закрытая вкладка,
    // отказ Storage — оставляет запись без файла.
    //
    // Раньше дедупликация верила такой записи на слово: клиент получал
    // deduplicated=true, байты не отправлял, модель рисовалась из локального
    // файла и выглядела рабочей. Ломалось всё только при восстановлении сцены
    // на другом устройстве — «Object not found», причём чинить это было нечем:
    // повторная загрузка того же файла снова дедуплицировалась на битую строку.
    //
    // Теперь наличие объекта проверяется, и запись без файла лечится выдачей
    // новой ссылки на ту же строку — id ассета сохраняется, поэтому уже
    // сохранённые сцены, которые на него ссылаются, после повторной загрузки
    // начинают работать.
    // -------------------------------------------------------------------------
    if (input.checksum) {
      const existing = await this.findAssetByChecksum(userId, orgId, input.checksum);
      if (existing) {
        if (await this.objectExists(existing.storage_path)) {
          this.logger.debug(`Asset deduplicated by checksum for org ${orgId}`);
          return {
            asset: existing,
            uploadUrl: null,
            deduplicated: true,
            expiresInSec: this.UPLOAD_URL_TTL_SEC,
          };
        }

        this.logger.warn(
          `Asset ${existing.id} has a row but no object at "${existing.storage_path}" — ` +
            `re-issuing upload URL instead of deduplicating`,
        );

        // storage_path пуст только если прошлая попытка упала между INSERT и
        // UPDATE. Восстанавливаем его по тому же правилу, что и для новой строки.
        let storagePath: string = existing.storage_path;
        if (!storagePath) {
          storagePath = `${orgId}/${existing.id}.${ext}`;
          await this.setAssetStoragePath(userId, orgId, existing.id, storagePath);
        }

        return {
          asset: { ...existing, storage_path: storagePath },
          uploadUrl: await this.issueUploadUrl(storagePath),
          deduplicated: false,
          expiresInSec: this.UPLOAD_URL_TTL_SEC,
        };
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

    let uploadUrl: { signedUrl: string; token: string; path: string };
    try {
      uploadUrl = await this.issueUploadUrl(storagePath);
    } catch (err) {
      // Ссылку выдать не смогли — убираем строку, чтобы не осталась запись
      // без файла.
      await this.hardDeleteAssetRow(userId, orgId, asset.id);
      throw err;
    }

    await this.setAssetStoragePath(userId, orgId, asset.id, storagePath);

    return {
      asset: { id: asset.id, file_name: input.fileName, storage_path: storagePath },
      uploadUrl,
      deduplicated: false,
      expiresInSec: this.UPLOAD_URL_TTL_SEC,
    };
  }

  /**
   * Лежит ли объект по пути в Storage.
   *
   * Через createSignedUrl намеренно: это ровно та операция, которая потом
   * выполняется при восстановлении сцены. Проверять другим способом (list,
   * info) значило бы проверять не то, что сломается.
   */
  private async objectExists(storagePath: string | null | undefined): Promise<boolean> {
    if (!storagePath) return false;

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .storage.from(this.BUCKET)
      .createSignedUrl(storagePath, 60);

    return !error && !!data;
  }

  /** Подписанная ссылка на ЗАГРУЗКУ по готовому пути. */
  private async issueUploadUrl(storagePath: string) {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .storage.from(this.BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (error || !data) {
      this.logger.error(`createSignedUploadUrl failed for ${storagePath}`, error);
      throw new BadRequestException(error?.message || 'Failed to create upload URL');
    }

    return { signedUrl: data.signedUrl, token: data.token, path: storagePath };
  }

  private async setAssetStoragePath(
    userId: string,
    orgId: string,
    assetId: string,
    storagePath: string,
  ) {
    await this.databaseService.withUserContext(userId, orgId, async (client) => {
      await client.query(
        `UPDATE public.studio_assets SET storage_path = $3
         WHERE id = $1::uuid AND organization_id = $2::uuid`,
        [assetId, orgId, storagePath],
      );
    });
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
  // Превью моделей
  //
  // ПОЧЕМУ БЕЗ КОЛОНКИ В БАЗЕ. Путь превью выводится из id ассета, а не
  // хранится: адрес детерминирован, значит колонка была бы копией того, что и
  // так известно, плюс лишний источник рассинхрона. Наличие превью узнаётся
  // попыткой подписать путь — тем же способом, каким проверяется наличие
  // самой модели.
  //
  // ПОЧЕМУ ТОТ ЖЕ БАКЕТ. Превью лежат в studio-models под префиксом
  // thumbnails/. Отдельный бакет означал бы отдельные политики и отдельную
  // выдачу прав, а изоляция по организации здесь ровно та же — первым
  // сегментом пути идёт orgId. Разнести можно позже копированием, ничего в
  // коде не меняя, кроме префикса.
  //
  // ВЕРСИЯ В ПУТИ. Улучшили пайплайн отрисовки — подняли PREVIEW_VERSION, и
  // все клиенты берут новые файлы. Без версии пришлось бы сбрасывать кеши
  // параметром в адресе, а он ломает кеширование на CDN.
  // ---------------------------------------------------------------------------

  private readonly PREVIEW_VERSION = 1;
  private readonly PREVIEW_URL_TTL_SEC = 3600;

  /** Детерминированный путь превью. Единственное место, где он собирается. */
  private previewPath(orgId: string, assetId: string, kind: 'still' | 'spin') {
    return `thumbnails/${orgId}/${assetId}/v${this.PREVIEW_VERSION}/${kind}.webp`;
  }

  /**
   * Подписанные ссылки на ЗАПИСЬ превью.
   *
   * Ассет проверяется на принадлежность организации до выдачи: без этого
   * знание чужого id позволило бы писать файлы в чужую папку.
   */
  async createPreviewUploadUrls(userId: string, orgId: string, assetId: string) {
    const rows = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const res = await client.query(
        `SELECT id FROM public.studio_assets
         WHERE id = $1::uuid AND organization_id = $2::uuid`,
        [assetId, orgId],
      );
      return res.rows;
    });

    if (rows.length === 0) throw new NotFoundException('Asset not found');

    const [still, spin] = await Promise.all([
      this.issueUploadUrl(this.previewPath(orgId, assetId, 'still')),
      this.issueUploadUrl(this.previewPath(orgId, assetId, 'spin')),
    ]);

    return { still, spin, expiresInSec: this.UPLOAD_URL_TTL_SEC };
  }

  /**
   * Подписанные ссылки на ЧТЕНИЕ превью — пачкой.
   *
   * Пачкой принципиально: сетка витрины показывает десятки моделей, и запрос
   * на каждую превратил бы открытие страницы в лавину round-trip'ов.
   * createSignedUrls подписывает весь список одним обращением к Storage.
   *
   * Отсутствующий файл — не ошибка, а нормальное состояние: превью для старых
   * ассетов ещё не нарисованы. Такой ассет получает null, и витрина ставит его
   * в очередь на отрисовку.
   */
  async getPreviewUrls(userId: string, orgId: string, assetIds: string[]) {
    if (assetIds.length === 0) return {};

    // Ограничение сверху: список приходит от клиента, и без потолка одним
    // запросом можно было бы попросить подписать десятки тысяч путей.
    const MAX_BATCH = 200;
    const ids = assetIds.slice(0, MAX_BATCH);

    // Проверяем принадлежность организации ОДНИМ запросом, а не по одному на
    // ассет. Чужие id просто не вернутся из выборки и до подписи не дойдут.
    const owned = await this.databaseService.withUserContext(userId, orgId, async (client) => {
      const res = await client.query(
        `SELECT id FROM public.studio_assets
         WHERE organization_id = $1::uuid AND id = ANY($2::uuid[])`,
        [orgId, ids],
      );
      return res.rows.map((r: { id: string }) => r.id);
    });

    if (owned.length === 0) return {};

    const paths = owned.flatMap((id: string) => [
      this.previewPath(orgId, id, 'still'),
      this.previewPath(orgId, id, 'spin'),
    ]);

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .storage.from(this.BUCKET)
      .createSignedUrls(paths, this.PREVIEW_URL_TTL_SEC);

    if (error) {
      this.logger.error('createSignedUrls failed for previews', error);
      throw new BadRequestException(error.message || 'Failed to sign preview URLs');
    }

    // Ответ Storage сопоставляем по пути, а не по порядку: полагаться на
    // порядок в массиве — молчаливое допущение, которое однажды перестанет
    // выполняться и перепутает превью между моделями.
    const byPath = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.signedUrl && !row.error && row.path) byPath.set(row.path, row.signedUrl);
    }

    const result: Record<string, { still: string | null; spin: string | null }> = {};
    for (const id of owned) {
      result[id] = {
        still: byPath.get(this.previewPath(orgId, id, 'still')) ?? null,
        spin: byPath.get(this.previewPath(orgId, id, 'spin')) ?? null,
      };
    }

    return result;
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
