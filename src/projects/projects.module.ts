import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AIModule } from '../ai/ai.module';
import { SuggestionsModule } from '../suggestions/suggestions.module';

@Module({
  imports: [SupabaseModule, AIModule, SuggestionsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

