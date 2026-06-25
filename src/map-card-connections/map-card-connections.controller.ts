import {
  Controller, Get, Post, Delete,
  Body, Param, Query, Req, UseGuards,
  BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { MapCardConnectionsService } from './map-card-connections.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateMapCardConnectionDto } from './dto/create-map-card-connection.dto';
import { BulkSyncConnectionsDto } from './dto/bulk-sync-connections.dto';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('map-card-connections')
@UseGuards(CognitoAuthGuard)
export class MapCardConnectionsController {
  constructor(private readonly mapCardConnectionsService: MapCardConnectionsService) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    return this.mapCardConnectionsService.findAll(dbClient, req.user.userId, orgId);
  }

  @Get('graph')
  async getGraph(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    return this.mapCardConnectionsService.getGraph(dbClient, req.user.userId, orgId, parsedLimit, parsedOffset);
  }

  @Get('card/:mapCardId')
  async findByCard(
    @Param('mapCardId') mapCardId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    return this.mapCardConnectionsService.findByCard(dbClient, mapCardId, req.user.userId, orgId);
  }

  @Post()
  async create(
    @Body() dto: CreateMapCardConnectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    return this.mapCardConnectionsService.create(dbClient, dto, req.user.userId, orgId);
  }

  @Post('bulk')
  async bulkSync(
    @Body() dto: BulkSyncConnectionsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    return this.mapCardConnectionsService.bulkSync(dbClient, dto.connections, req.user.userId, orgId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    return this.mapCardConnectionsService.remove(dbClient, id, req.user.userId, orgId);
  }
}
