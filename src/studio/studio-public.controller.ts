import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { StudioService } from './studio.service';

/**
 * StudioPublicController — просмотр опубликованной модели БЕЗ авторизации.
 *
 * Отдельный контроллер, а не ветка в основном: там висит CognitoAuthGuard на
 * весь класс, и «почти публичный» маршрут внутри него — это ровно тот случай,
 * когда однажды забывают исключение и открывают лишнее. Здесь весь класс
 * помечен @Public, и что он публичный, видно с первой строки. Тем же способом
 * разделён PublicSharesController.
 *
 * ПРАВО ДОСТУПА — САМ СЛАГ. Организация в запросе не участвует: её неоткуда
 * взять у постороннего зрителя. Строка ищется по слагу и признаку активности,
 * а организация читается из найденной строки. Отзыв ссылки прекращает выдачу
 * немедленно, потому что каждый запрос перечитывает строку заново.
 */
@Public()
@Controller('public/model')
export class StudioPublicController {
  constructor(private readonly studioService: StudioService) {}

  /** Сведения для страницы: имя, размер, разрешено ли скачивание. */
  @Get(':slug')
  async getModel(@Param('slug') slug: string) {
    const link = await this.studioService.getPublicAsset(slug);
    if (!link) throw new NotFoundException('Model not found or not published');

    // Наружу отдаём только то, что можно показать постороннему. Ни
    // организации, ни владельца, ни пути в хранилище: зрителю они не нужны,
    // а утечь через публичный ответ могут ровно один раз.
    return {
      fileName: link.fileName,
      sizeBytes: link.sizeBytes,
      allowModel: link.allowModel,
    };
  }

  /**
   * Подписанная ссылка на файл.
   *
   * Отдаём адрес, а не байты: проксировать модель на десятки мегабайт через
   * бекенд незачем, а картинки маленькие и всё равно уедут через кеш Next.
   */
  @Get(':slug/file')
  async getFileUrl(
    @Param('slug') slug: string,
    @Query('kind') kind: 'still' | 'spin' | 'model',
  ) {
    const allowed = ['still', 'spin', 'model'];
    if (!allowed.includes(kind)) throw new NotFoundException('Unknown file kind');

    const url = await this.studioService.getPublicAssetFileUrl(slug, kind);
    // null означает и «ссылки нет», и «скачивание модели не разрешено».
    // Различать их наружу не нужно: посторонний не должен по коду ответа
    // узнавать, существует ли модель, доступ к которой ему закрыт.
    if (!url) throw new NotFoundException('File not available');

    return { url };
  }
}
