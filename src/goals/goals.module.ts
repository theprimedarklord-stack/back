import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [SupabaseModule, AIModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}

