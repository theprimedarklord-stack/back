import { Module } from '@nestjs/common';
import { MapCardsController } from './mapcards.controller';
import { MapCardsService } from './mapcards.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [MapCardsController],
  providers: [MapCardsService],
})
export class MapCardsModule { }
