import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Req, Query, UseGuards,
  BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { MapCanvasNodesService } from './map-canvas-nodes.service';
import { CreateCanvasNodeDto } from './dto/create-canvas-node.dto';
import { UpdateCanvasNodeDto } from './dto/update-canvas-node.dto';
import { isCanvasNodeType } from './canvas-node-types';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('map-canvas-nodes')
@UseGuards(CognitoAuthGuard)
export class MapCanvasNodesController {
  constructor(private readonly mapCanvasNodesService: MapCanvasNodesService) {}

  @Get()
  async getNodes(
    @Req() req: AuthenticatedRequest,
    @Query('map_card_id') mapCardId: string,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    if (!mapCardId) throw new BadRequestException('map_card_id query parameter is required');

    return this.mapCanvasNodesService.findByMapCard(dbClient, mapCardId, req.user.userId, orgId);
  }

  @Get(':id')
  async getNode(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapCanvasNodesService.findOne(dbClient, id, req.user.userId, orgId);
  }

  @Post()
  async createNode(
    @Body() dto: CreateCanvasNodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapCanvasNodesService.create(dbClient, dto, req.user.userId, orgId);
  }

  @Post('bulk')
  async bulkCreateNodes(
    @Body('data') data: { nodes: CreateCanvasNodeDto[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    if (!Array.isArray(data?.nodes)) throw new BadRequestException('data.nodes is required');

    // `@Body('data')` has no DTO metatype, so the global ValidationPipe skips it
    // entirely — this batch is checked by hand rather than trusted.
    for (const node of data.nodes) {
      if (!node?.id || !node?.map_card_id) {
        throw new BadRequestException('each node requires id and map_card_id');
      }
      if (!isCanvasNodeType(node.node_type)) {
        throw new BadRequestException(`unsupported node_type: ${node.node_type}`);
      }
    }

    return this.mapCanvasNodesService.bulkCreate(dbClient, data.nodes, req.user.userId, orgId);
  }

  @Patch(':id')
  async updateNode(
    @Param('id') id: string,
    @Body() dto: UpdateCanvasNodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapCanvasNodesService.update(dbClient, id, dto, req.user.userId, orgId);
  }

  @Delete(':id')
  async removeNode(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapCanvasNodesService.remove(dbClient, id, req.user.userId, orgId);
  }
}
