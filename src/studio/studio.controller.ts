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
        status,
      };
    }

    return { success: false, error: message, status: HttpStatus.INTERNAL_SERVER_ERROR };
  }
}
