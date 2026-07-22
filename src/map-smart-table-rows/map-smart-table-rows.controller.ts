import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Req, Query, UseGuards,
  BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { MapSmartTableRowsService } from './map-smart-table-rows.service';
import { CreateTableRowDto } from './dto/create-table-row.dto';
import { UpdateTableRowDto } from './dto/update-table-row.dto';
import { ReorderRowsDto } from './dto/reorder-rows.dto';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('map-smart-table-rows')
@UseGuards(CognitoAuthGuard)
export class MapSmartTableRowsController {
  constructor(private readonly mapSmartTableRowsService: MapSmartTableRowsService) {}

  @Get()
  async getRows(
    @Req() req: AuthenticatedRequest,
    @Query('table_node_id') tableNodeId: string,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    if (!tableNodeId) throw new BadRequestException('table_node_id query parameter is required');

    return this.mapSmartTableRowsService.findByTableNode(dbClient, tableNodeId, req.user.userId, orgId);
  }

  @Get(':id')
  async getRow(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapSmartTableRowsService.findOne(dbClient, id, req.user.userId, orgId);
  }

  @Post()
  async createRow(
    @Body() dto: CreateTableRowDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapSmartTableRowsService.create(dbClient, dto, req.user.userId, orgId);
  }

  @Post('bulk')
  async bulkCreateRows(
    @Body('data') data: { rows: CreateTableRowDto[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');
    
    if (!data?.rows) throw new BadRequestException('data.rows is required');

    return this.mapSmartTableRowsService.bulkCreate(dbClient, data.rows, req.user.userId, orgId);
  }

  @Patch('reorder')
  async reorderRows(
    @Body('data') data: { order: any[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');
    
    if (!data?.order) throw new BadRequestException('data.order is required');
    
    const dto = new ReorderRowsDto();
    dto.order = data.order;

    return this.mapSmartTableRowsService.reorder(dbClient, dto, req.user.userId, orgId);
  }

  @Patch(':id')
  async updateRow(
    @Param('id') id: string,
    @Body() dto: UpdateTableRowDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapSmartTableRowsService.update(dbClient, id, dto, req.user.userId, orgId);
  }

  @Delete('bulk')
  async bulkRemoveRows(
    @Body('data') data: { ids: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');
    
    if (!data?.ids) throw new BadRequestException('data.ids is required');

    return this.mapSmartTableRowsService.bulkRemove(dbClient, data.ids, req.user.userId, orgId);
  }

  @Delete(':id')
  async removeRow(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const dbClient = req.dbClient;
    if (!dbClient) throw new InternalServerErrorException('Database client with RLS context is missing!');

    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) throw new BadRequestException('x-org-id header is required');

    return this.mapSmartTableRowsService.remove(dbClient, id, req.user.userId, orgId);
  }
}
