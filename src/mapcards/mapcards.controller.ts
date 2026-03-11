import { Controller, Get, UseGuards } from '@nestjs/common';
import { MapCardsService } from './mapcards.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';

@Controller('mapcards')
@UseGuards(CognitoAuthGuard)
export class MapCardsController {
  constructor(private readonly mapCardsService: MapCardsService) { }

  @Get()
  async getMapCards() {
    return this.mapCardsService.findAll();
  }
}
