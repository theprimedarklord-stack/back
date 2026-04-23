import { Controller, Get, Post, Body, Req, UseGuards, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { MapCardsService } from './mapcards.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateMapCardDto } from './dto/create-mapcard.dto';
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

  @Post()
  async createMapCard(
    @Body() dto: CreateMapCardDto,
    @Req() req: AuthenticatedRequest
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
}
