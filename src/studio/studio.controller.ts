import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Headers,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { StudioService } from './studio.service';

/**
 * StudioController — API раздела /studio (3D-редактор).
 *
 * Достаётся фронтом через универсальный BFF: /api/bff/studio/... Тот прокси
 * уже проверил сессию в Redis, обновил токен при необходимости и прокинул
 * Authorization, x-user-id, x-org-id и x-service-token.
 *
 * Формат ответов и способ получения userId/orgId повторяют CardsController,
 * чтобы фронт не разбирал два разных контракта.
 */
@Controller('studio')
@UseGuards(CognitoAuthGuard)
export class StudioController {
  private readonly logger = new Logger(StudioController.name);

  constructor(private readonly studioService: StudioService) {}

  // ---------------------------------------------------------------------------
  // Сцены
  // ---------------------------------------------------------------------------

  @Get('scenes')
  async listScenes(@Req() req: Request, @Headers('x-org-id') orgId: string) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const scenes = await this.studioService.listScenes(auth.userId, auth.orgId);
      return { success: true, scenes };
    } catch (error) {
      return this.fail('Не удалось получить список сцен', error);
    }
  }

  @Get('scenes/:id')
  async getScene(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const scene = await this.studioService.getScene(auth.userId, auth.orgId, id);
      return { success: true, scene };
    } catch (error) {
      return this.fail('Не удалось открыть сцену', error);
    }
  }

  @Post('scenes')
  async createScene(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Body() body: { name?: string; data?: unknown },
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const scene = await this.studioService.createScene(
        auth.userId,
        auth.orgId,
        body?.name,
        body?.data,
      );
      return { success: true, scene };
    } catch (error) {
      return this.fail('Не удалось создать сцену', error);
    }
  }

  @Patch('scenes/:id')
  async updateScene(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
    @Body() body: { name?: string; data?: unknown },
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const scene = await this.studioService.updateScene(auth.userId, auth.orgId, id, body ?? {});
      return { success: true, scene };
    } catch (error) {
      return this.fail('Не удалось сохранить сцену', error);
    }
  }

  @Delete('scenes/:id')
  async deleteScene(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const result = await this.studioService.deleteScene(auth.userId, auth.orgId, id);
      return { success: true, ...result };
    } catch (error) {
      return this.fail('Не удалось удалить сцену', error);
    }
  }

  // ---------------------------------------------------------------------------
  // История версий
  //
  // Пути вложены в сцену (/scenes/:id/versions/...), потому что версия вне
  // своей сцены не существует. Идентификатор сцены при этом участвует в WHERE
  // каждого запроса — чужую версию не подставить, даже зная её id.
  // ---------------------------------------------------------------------------

  @Get('scenes/:id/versions')
  async listSceneVersions(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const versions = await this.studioService.listSceneVersions(auth.userId, auth.orgId, id);
      return { success: true, versions };
    } catch (error) {
      return this.fail('Не удалось получить историю версий', error);
    }
  }

  @Get('scenes/:id/versions/:versionId')
  async getSceneVersion(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const version = await this.studioService.getSceneVersion(
        auth.userId,
        auth.orgId,
        id,
        versionId,
      );
      return { success: true, version };
    } catch (error) {
      return this.fail('Не удалось открыть версию', error);
    }
  }

  /**
   * POST, а не PATCH: восстановление — это действие, а не правка ресурса по
   * адресу. Тело не нужно, всё в пути.
   */
  @Post('scenes/:id/versions/:versionId/restore')
  async restoreSceneVersion(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const result = await this.studioService.restoreSceneVersion(
        auth.userId,
        auth.orgId,
        id,
        versionId,
      );
      return { success: true, ...result };
    } catch (error) {
      return this.fail('Не удалось восстановить версию', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Ассеты
  // ---------------------------------------------------------------------------

  @Get('assets')
  async listAssets(@Req() req: Request, @Headers('x-org-id') orgId: string) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const assets = await this.studioService.listAssets(auth.userId, auth.orgId);
      return { success: true, assets };
    } catch (error) {
      return this.fail('Не удалось получить список моделей', error);
    }
  }

  /**
   * Выдаёт подписанный URL, по которому браузер льёт файл прямо в Storage.
   * Байты через бекенд не идут — только разрешение.
   */
  @Post('assets/upload-url')
  async createUploadUrl(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Body() body: { fileName: string; sizeBytes: number; mime?: string; checksum?: string },
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    if (!body?.fileName) {
      return { success: false, error: 'fileName is required', status: HttpStatus.BAD_REQUEST };
    }

    try {
      const result = await this.studioService.createUploadUrl(auth.userId, auth.orgId, body);
      return { success: true, ...result };
    } catch (error) {
      return this.fail('Не удалось подготовить загрузку', error);
    }
  }

  /** Подписанная ссылка на чтение — бакет приватный. */
  @Get('assets/:id/download-url')
  async createDownloadUrl(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const result = await this.studioService.createDownloadUrl(auth.userId, auth.orgId, id);
      return { success: true, ...result };
    } catch (error) {
      return this.fail('Не удалось получить ссылку на модель', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Превью моделей
  // ---------------------------------------------------------------------------

  /** Ссылки на запись превью: клиент рисует кадр и льёт его прямо в Storage. */
  @Post('assets/:id/preview-upload-urls')
  async createPreviewUploadUrls(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const result = await this.studioService.createPreviewUploadUrls(auth.userId, auth.orgId, id);
      return { success: true, ...result };
    } catch (error) {
      return this.fail('Не удалось подготовить загрузку превью', error);
    }
  }

  /**
   * Ссылки на чтение превью пачкой.
   *
   * POST, а не GET, при том что это чтение: список идентификаторов на сотню
   * элементов в строку запроса не помещается — упрётся в лимит длины URL.
   */
  @Post('previews/urls')
  async getPreviewUrls(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Body() body: { assetIds?: string[] },
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    if (!Array.isArray(body?.assetIds)) {
      return { success: false, error: 'assetIds must be an array', status: HttpStatus.BAD_REQUEST };
    }

    try {
      const previews = await this.studioService.getPreviewUrls(
        auth.userId,
        auth.orgId,
        body.assetIds,
      );
      return { success: true, previews };
    } catch (error) {
      return this.fail('Не удалось получить превью', error);
    }
  }

  @Delete('assets/:id')
  async deleteAsset(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const result = await this.studioService.deleteAsset(auth.userId, auth.orgId, id);
      return { success: true, ...result };
    } catch (error) {
      return this.fail('Не удалось удалить модель', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Публикация модели
  // ---------------------------------------------------------------------------

  @Get('assets/:id/publication')
  async getAssetPublication(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const publication = await this.studioService.getAssetPublication(auth.userId, auth.orgId, id);
      return { success: true, publication };
    } catch (error) {
      return this.fail('Не удалось получить состояние публикации', error);
    }
  }

  @Post('assets/:id/publication')
  async publishAsset(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
    @Body() body: { allowModel?: boolean },
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const publication = await this.studioService.publishAsset(
        auth.userId,
        auth.orgId,
        id,
        body?.allowModel === true,
      );
      return { success: true, publication };
    } catch (error) {
      return this.fail('Не удалось опубликовать модель', error);
    }
  }

  @Patch('assets/:id/publication')
  async updateAssetPublication(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; allowModel?: boolean },
  ) {
    const auth = this.requireAuth(req, orgId);
    if ('error' in auth) return auth;

    try {
      const publication = await this.studioService.setAssetPublication(
        auth.userId,
        auth.orgId,
        id,
        body ?? {},
      );
      return { success: true, publication };
    } catch (error) {
      return this.fail('Не удалось изменить публикацию', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Общее
  // ---------------------------------------------------------------------------

  /**
   * orgId обязателен для КАЖДОГО запроса: без него RLS-контекст не выставить,
   * а значит запрос либо ничего не увидит, либо увидит не то. Лучше явный 400.
   */
  private requireAuth(req: Request, orgId: string) {
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!userId) {
      return { success: false as const, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
    }
    if (!orgId) {
      return { success: false as const, error: 'x-org-id header is required', status: HttpStatus.BAD_REQUEST };
    }

    return { userId: userId as string, orgId };
  }

  private fail(message: string, error: unknown) {
    this.logger.error(`${message}:`, error);

    // Сообщения BadRequest/NotFound из сервиса осмысленны для пользователя
    // (например про размер файла) — пробрасываем их, а не подменяем общим текстом.
    const status = (error as any)?.status;
    if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.NOT_FOUND) {
      return {
        success: false,
        error: (error as any)?.response?.message || (error as Error)?.message || message,
        // Машиночитаемый код, если сервис его дал. Нужен там, где клиент обязан
        // ПОСТУПИТЬ по-разному, а не просто показать другой текст: разбирать
        // для этого сообщение на человеческом языке — значит сломать поведение
        // при первой же правке формулировки.
        code: (error as any)?.response?.code,
        status,
      };
    }

    return { success: false, error: message, status: HttpStatus.INTERNAL_SERVER_ERROR };
  }
}
