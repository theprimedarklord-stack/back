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
import { LabService } from './lab.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

/**
 * Computer Lab.
 *
 * Модель — у `LAB_ARCHITECTURE.md` фронта: чіп це нода, схема це рядки.
 */
@Controller('lab')
@UseGuards(CognitoAuthGuard)
export class LabController {
  constructor(private readonly labService: LabService) {}

  private context(req: AuthenticatedRequest) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return { dbClient, orgId };
  }

  /** Бібліотека чіпів. Стоїть вище за `:id`, інакше той перехопив би слово. */
  @Get('chips/list')
  async listChips(@Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.listChips(dbClient, req.user.userId, orgId);
  }

  /**
   * Засипка стандартної бібліотеки.
   *
   * POST, бо створює дані; повторний виклик безпечний — засипка перевіряє, чи
   * вже є тека «Standard Library», і другий раз нічого не робить.
   */
  @Post('standard-library')
  async seedStandardLibrary(@Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.seedStandardLibrary(dbClient, req.user.userId, orgId);
  }

  @Get('chips')
  async getChipByNode(@Req() req: AuthenticatedRequest, @Query('node_id') nodeId: string) {
    const { dbClient, orgId } = this.context(req);
    if (!nodeId) throw new BadRequestException('node_id query parameter is required');

    return this.labService.findChipByNode(dbClient, nodeId, req.user.userId, orgId);
  }

  @Post('chips')
  async createChip(
    @Body() dto: { id: string; node_id: string; ports?: any[]; behavior?: any },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!dto?.id || !dto?.node_id) {
      throw new BadRequestException('id and node_id are required');
    }

    return this.labService.createChip(dbClient, dto, req.user.userId, orgId);
  }

  @Get('chips/:id/schematic')
  async getSchematic(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.getSchematic(dbClient, id, req.user.userId, orgId);
  }

  @Get('chips/:id/usages')
  async getUsages(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.getUsages(dbClient, id, req.user.userId, orgId);
  }

  @Patch('chips/:id')
  async updateChip(
    @Param('id') id: string,
    @Body() dto: { ports?: any[]; behavior?: any },
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.updateChip(dbClient, id, dto, req.user.userId, orgId);
  }

  @Post('chips/:id/parts')
  async createPart(
    @Param('id') chipId: string,
    @Body() dto: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!dto?.id) throw new BadRequestException('id is required');

    return this.labService.createPart(dbClient, chipId, dto, req.user.userId, orgId);
  }

  @Post('chips/:id/wires')
  async createWire(
    @Param('id') chipId: string,
    @Body() dto: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    if (!dto?.id || !dto?.from_part || !dto?.to_part) {
      throw new BadRequestException('id, from_part and to_part are required');
    }

    return this.labService.createWire(dbClient, chipId, dto, req.user.userId, orgId);
  }

  @Patch('parts/:id')
  async updatePart(
    @Param('id') id: string,
    @Body() dto: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.updatePart(dbClient, id, dto, req.user.userId, orgId);
  }

  @Delete('parts/:id')
  async deletePart(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.deletePart(dbClient, id, req.user.userId, orgId);
  }

  @Patch('wires/:id')
  async updateWire(
    @Param('id') id: string,
    @Body() dto: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.updateWire(dbClient, id, dto, req.user.userId, orgId);
  }

  @Delete('wires/:id')
  async deleteWire(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const { dbClient, orgId } = this.context(req);
    return this.labService.deleteWire(dbClient, id, req.user.userId, orgId);
  }
}
