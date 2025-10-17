// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { GoalsModule } from '../goals/goals.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [SupabaseModule, GoalsModule, TasksModule],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
