import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { MapCardHistoryController } from './map-card-history.controller';
import { MapCardHistoryService } from './map-card-history.service';
import { HistoryCleanupService } from './history-cleanup.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [CardsController, MapCardHistoryController],
  providers: [CardsService, MapCardHistoryService, HistoryCleanupService],
  exports: [CardsService, MapCardHistoryService, HistoryCleanupService],
})
export class CardsModule {}
