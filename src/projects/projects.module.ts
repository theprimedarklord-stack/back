import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [SupabaseModule, AIModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

