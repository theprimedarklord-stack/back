import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { AIModule } from '../ai/ai.module';
import { SuggestionsModule } from '../suggestions/suggestions.module';

@Module({
  imports: [AIModule, SuggestionsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule { }

