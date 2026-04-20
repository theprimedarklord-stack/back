import { Controller, Get, Post, Body, Req, UseGuards, InternalServerErrorException } from '@nestjs/common';
import { MapCardsService } from './mapcards.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateMapCardDto } from './dto/create-mapcard.dto';

@Controller('mapcards')
@UseGuards(CognitoAuthGuard)
export class MapCardsController {
  constructor(private readonly mapCardsService: MapCardsService) { }

  @Get()
  async getMapCards(@Req() req: any) {
    const dbClient = req.dbClient;
    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }
    return this.mapCardsService.findAll(dbClient);
  }

  @Post()
  async createMapCard(
    @Body() dto: CreateMapCardDto,
    @Req() req: any
  ) {
    const userId = req.user.sub || req.user.id;
    const orgId = req.headers['x-org-id'];
    const dbClient = req.dbClient;

    if (!dbClient) {
      throw new InternalServerErrorException('Database client with RLS context is missing!');
    }

    return this.mapCardsService.create(dto, userId, orgId, dbClient);
  }
}
