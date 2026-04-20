import { Module } from '@nestjs/common';
import { MapCardsController } from './mapcards.controller';
import { MapCardsService } from './mapcards.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MapCardsController],
  providers: [MapCardsService],
})
export class MapCardsModule { }
