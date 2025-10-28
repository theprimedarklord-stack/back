// src/ai/ai.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SuggestionsModule } from '../suggestions/suggestions.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => SuggestionsModule), // forwardRef для уникнення циклічних залежностей
  ],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
