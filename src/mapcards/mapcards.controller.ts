import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Req, UseGuards,
  BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { MapCardsService } from './mapcards.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateMapCardDto } from './dto/create-mapcard.dto';
import { UpdateMapCardDto } from './dto/update-mapcard.dto';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('mapcards')
@UseGuards(CognitoAuthGuard)
export class MapCardsController {
  constructor(private readonly mapCardsService: MapCardsService) { }

  @Get()
  async getMapCards(@Req() req: AuthenticatedRequest) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    const orgId = req.headers['x-org-id'];
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    // Defense in Depth: передаємо userId та orgId для явного SQL-фільтру
    // поверх RLS-контексту, вже встановленого в dbClient через RlsContextInterceptor
    return this.mapCardsService.findAll(dbClient, req.user.userId, orgId);
  }

  @Get(':id')
  async getMapCard(
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

    return this.mapCardsService.findOne(dbClient, id, req.user.userId, orgId);
  }

  @Post()
  async createMapCard(
    @Body() dto: CreateMapCardDto,
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

    return this.mapCardsService.create(dbClient, dto, req.user.userId, orgId);
  }

  @Patch(':id')
  async updateMapCard(
    @Param('id') id: string,
    @Body() dto: UpdateMapCardDto,
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

    return this.mapCardsService.update(dbClient, id, dto, req.user.userId, orgId);
  }

  @Delete(':id')
  async deleteMapCard(
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

    return this.mapCardsService.remove(dbClient, id, req.user.userId, orgId);
  }
}
