import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { MapCardsService } from './mapcards.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateMapCardDto } from './dto/create-mapcard.dto';

@Controller('mapcards')
@UseGuards(CognitoAuthGuard)
export class MapCardsController {
  constructor(private readonly mapCardsService: MapCardsService) { }

  @Get()
  async getMapCards() {
    return this.mapCardsService.findAll();
  }

  @Post()
  async createMapCard(
    @Body() dto: CreateMapCardDto,
    @Req() req: any
  ) {
    // 1. Беремо ID юзера з перевіреного токена Cognito
    const userId = req.user.sub || req.user.id;

    // 2. Беремо Org ID. Оскільки інтерцептор вже пропустив запит сюди,
    // ми знаємо, що цей заголовок валідний і юзер має до нього доступ.
    const orgId = req.headers['x-org-id'];

    return this.mapCardsService.create(dto, userId, orgId);
  }
}
