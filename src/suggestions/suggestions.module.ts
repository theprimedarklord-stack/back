// src/suggestions/suggestions.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => AIModule), // forwardRef для уникнення циклічних залежностей
  ],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
  exports: [SuggestionsService], // Експортуємо для використання в інших модулях
})
export class SuggestionsModule {}

