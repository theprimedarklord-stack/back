import { Module } from '@nestjs/common';
import { MapCardsController } from './mapcards.controller';
import { MapCardsService } from './mapcards.service';

@Module({
  controllers: [MapCardsController],
  providers: [MapCardsService],
})
export class MapCardsModule { }
