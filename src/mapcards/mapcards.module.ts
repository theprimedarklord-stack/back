import { Module } from '@nestjs/common';
import { MapcardsController } from './mapcards.controller';
import { MapcardsService } from './mapcards.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [MapcardsController],
  providers: [MapcardsService],
  exports: [MapcardsService],
})
export class MapcardsModule {}

