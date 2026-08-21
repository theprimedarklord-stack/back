import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { MapNodesService } from './map-nodes.service';
import { SyncMapNodesDto } from './dto/sync-map-nodes.dto';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('map-nodes')
@UseGuards(CognitoAuthGuard)
export class MapNodesController {
  constructor(private readonly mapNodesService: MapNodesService) {}

  /** Усе піддерево картки: вузли + ребра канваса між ними. */
  @Get()
  async getByMapCard(
    @Req() req: AuthenticatedRequest,
    @Query('map_card_id') mapCardId: string,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!mapCardId) throw new BadRequestException('map_card_id query parameter is required');

    return this.mapNodesService.findByMapCard(dbClient, mapCardId, req.user.userId, orgId);
  }

  /** Корені дерева — контейнери карток організації. */
  @Get('roots')
  async getRoots(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.findRoots(
      dbClient,
      req.user.userId,
      orgId,
      limit ? Number(limit) : undefined,
    );
  }

  /**
   * Закріплені вузли будь-якого рівня.
   *
   * Окрема ручка, а не фільтр над `roots`: закріпити можна і вкладену ноду,
   * а `roots` за визначенням бачить лише верхній рівень.
   */
  @Get('pinned')
  async getPinned(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.findPinned(
      dbClient,
      req.user.userId,
      orgId,
      limit ? Number(limit) : undefined,
    );
  }

  /**
   * Нещодавно змінене — плаский перелік для «Бібліотеки».
   *
   * `kind` звужує до одного типу (`mapcard`, `cluster` або будь-який вузол),
   * `q` шукає по назві. Групування по теках рахує клієнт: назва батька вже
   * приїжджає в рядку.
   */
  @Get('recent')
  async getRecent(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.findRecent(dbClient, req.user.userId, orgId, {
      limit: limit ? Number(limit) : undefined,
      kind,
      query: q,
    });
  }

  /**
   * Граф на заданому рівні: `card` (типово), `node`, `cluster`.
   * `expand` розкриває одну картку в її вузли.
   */
  @Get('graph')
  async getGraph(
    @Req() req: AuthenticatedRequest,
    @Query('level') level?: string,
    @Query('expand') expand?: string,
    @Query('limit') limit?: string,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.getGraph(dbClient, req.user.userId, orgId, {
      level,
      expand: expand || null,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Пошук по вузлах організації. */
  @Get('search')
  async search(
    @Req() req: AuthenticatedRequest,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const { dbClient, orgId } = this.context(req);
    // Порожній запит — це не «нічого не знайдено», а «меню щойно відкрилось».
    // Саме так його бачить `[[`: підказка з'являється до першої букви, і
    // порожній список у цю мить читається як «нод тут не буває».
    // Тому віддаємо найсвіжіші — те саме робить пошук карток поруч.
    const query = (q ?? '').trim();

    return this.mapNodesService.search(
      dbClient,
      query,
      req.user.userId,
      orgId,
      limit ? Number(limit) : undefined,
    );
  }

  /** Прямі діти вузла — список усередині ноди. */
  @Get('children')
  async getChildren(
    @Req() req: AuthenticatedRequest,
    @Query('parent_id') parentId: string,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!parentId) throw new BadRequestException('parent_id query parameter is required');

    return this.mapNodesService.findChildren(dbClient, parentId, req.user.userId, orgId);
  }

  /**
   * Привести рядки картки до стану, який щойно зберігся в `data_core`.
   *
   * POST, а не PATCH: тіло описує картку цілком, і результат не залежить від
   * того, скільки разів його надіслати.
   */
  @Post('sync')
  async sync(@Body() dto: SyncMapNodesDto, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.sync(dbClient, dto, req.user.userId, orgId);
  }

  /** Створити кластер — теку для карток. */
  @Post('cluster')
  async createCluster(
    @Body() dto: { id: string; title?: string; parent_id?: string | null },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!dto?.id) throw new BadRequestException('id is required');

    return this.mapNodesService.createCluster(dbClient, dto, req.user.userId, orgId);
  }

  /** Створити вкладений вузол усередині батька. */
  @Post('child')
  async createChild(
    @Body() dto: { id: string; parent_id: string; kind: string; title?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!dto?.id || !dto?.parent_id || !dto?.kind) {
      throw new BadRequestException('id, parent_id and kind are required');
    }

    return this.mapNodesService.createChild(dbClient, dto, req.user.userId, orgId);
  }

  /**
   * Один вузол за id.
   *
   * Стоїть нижче за `children` і `sync` навмисно: `:id` перехопив би їх,
   * оскільки Nest зіставляє маршрути в порядку оголошення.
   */
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.findOne(dbClient, id, req.user.userId, orgId);
  }

  /** Перенести картку або кластер в інший кластер. `parent_id: null` — у корінь. */
  @Post(':id/move')
  async move(
    @Param('id') id: string,
    @Body() body: { parent_id: string | null },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.moveToCluster(
      dbClient,
      id,
      body?.parent_id ?? null,
      req.user.userId,
      orgId,
    );
  }

  /** Закріпити або відкріпити вузол чи картку. */
  @Post(':id/pin')
  async pin(
    @Param('id') id: string,
    @Body() body: { pinned: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.setPinned(dbClient, id, !!body?.pinned, req.user.userId, orgId);
  }

  /** Предки вузла з назвами — хлібні крихти. */
  @Get(':id/ancestors')
  async getAncestors(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.findAncestors(dbClient, id, req.user.userId, orgId);
  }

  @Patch(':id')
  async updateOne(
    @Param('id') id: string,
    @Body() dto: {
      title?: string;
      content?: any[];
      content_text?: string;
      props?: Record<string, any>;
      refs?: string[];
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.updateOne(dbClient, id, dto, req.user.userId, orgId);
  }

  /** М'яко ховає вузол разом із усім вкладеним. */
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.mapNodesService.removeSubtree(dbClient, id, req.user.userId, orgId);
  }

  /** Скасування видалення за позначкою часу, яку повернув DELETE. */
  @Post(':id/restore')
  async restore(
    @Param('id') id: string,
    @Body() body: { deleted_at: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!body?.deleted_at) throw new BadRequestException('deleted_at is required');

    return this.mapNodesService.restoreSubtree(
      dbClient,
      id,
      body.deleted_at,
      req.user.userId,
      orgId,
    );
  }

  /** Спільна для всіх ручок перевірка: RLS-клієнт і організація. */
  private context(req: AuthenticatedRequest) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return { dbClient, orgId };
  }
}
