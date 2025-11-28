// src/suggestions/suggestions.service.ts
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Suggestion, CreateSuggestionData, SuggestionStatus, EntityType } from './entities/suggestion.entity';

@Injectable()
export class SuggestionsService {
  private aiService: any = null;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // Ліниво отримуємо AIService для уникнення циклічних залежностей
  private async getAIService() {
    if (!this.aiService) {
      try {
        // Динамічно отримуємо AIService через ModuleRef
        const { AIService } = await import('../ai/ai.service');
        this.aiService = this.moduleRef.get(AIService, { strict: false });
      } catch (error) {
        console.warn('[Suggestions] Не вдалося отримати AIService:', error.message);
      }
    }
    return this.aiService;
  }

  /**
   * Зберегти масив рекомендацій в БД
   */
  async saveSuggestions(
    userId: string,
    projectId: number,
    goals: any[],
    entityType: EntityType = 'goal'
  ): Promise<Suggestion[]> {
    try {
      const now = new Date().toISOString();

      const suggestions = goals.map(goal => ({
        user_id: userId,
        project_id: projectId,
        entity_type: entityType,
        payload: goal,
        source: 'ai',
        model_used: goal.ai_metadata?.model || goal.modelUsed || 'gemini-2.0-flash',
        confidence: goal.confidence || 0.8,
        status: 'pending' as SuggestionStatus,
        created_at: now,
        updated_at: now,
      }));

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('suggestions')
        .insert(suggestions)
        .select();

      if (error) {
        throw new InternalServerErrorException(`Ошибка сохранения рекомендаций: ${error.message}`);
      }

      console.log(`[Suggestions] Збережено ${data.length} рекомендацій для проекту ${projectId}`);
      return data;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка сохранения рекомендаций: ${error.message}`);
    }
  }

  /**
   * Отримати pending рекомендації для проекту
   */
  async getPendingSuggestions(
    userId: string,
    projectId: number,
    entityType: EntityType = 'goal'
  ): Promise<Suggestion[]> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('suggestions')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .eq('entity_type', entityType)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения рекомендаций: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения рекомендаций: ${error.message}`);
    }
  }

  /**
   * ГОЛОВНИЙ МЕТОД: Отримати pending рекомендації або автоматично згенерувати до targetCount
   * Це метод який викликається при відкритті проекту
   */
  async getOrFillPendingSuggestions(
    userId: string,
    projectId: number,
    targetCount: number = 5,
    entityType: EntityType = 'goal'
  ): Promise<{
    suggestions: Suggestion[];
    generated_new: boolean;
    total_count: number;
  }> {
    try {
      console.log(`[Suggestions] getOrFillPendingSuggestions: projectId=${projectId}, targetCount=${targetCount}`);

      // 1. Отримати існуючі pending рекомендації
      const existingSuggestions = await this.getPendingSuggestions(userId, projectId, entityType);
      console.log(`[Suggestions] Знайдено ${existingSuggestions.length} існуючих pending рекомендацій`);

      // 2. Якщо вже є достатньо рекомендацій - повертаємо їх
      if (existingSuggestions.length >= targetCount) {
        console.log(`[Suggestions] Достатньо рекомендацій, повертаємо перші ${targetCount}`);
        return {
          suggestions: existingSuggestions.slice(0, targetCount),
          generated_new: false,
          total_count: existingSuggestions.length,
        };
      }

      // 3. Якщо не вистачає - генеруємо додаткові
      const needed = targetCount - existingSuggestions.length;
      console.log(`[Suggestions] Потрібно згенерувати ще ${needed} рекомендацій`);

      // Генеруємо з запасом (+2) для дедуплікації
      const countToGenerate = needed + 2;

      // 4. Динамічно отримуємо AIService
      const aiService = await this.getAIService();
      if (!aiService) {
        console.warn('[Suggestions] AIService не доступний, повертаємо існуючі рекомендації');
        return {
          suggestions: existingSuggestions,
          generated_new: false,
          total_count: existingSuggestions.length,
        };
      }

      // 5. Генеруємо нові рекомендації через AI
      const aiResult = await aiService.generateGoalsForProject(
        userId,
        projectId,
        countToGenerate,
        [] // existingGoals - можна передати для контексту
      );

      if (!aiResult.success || !aiResult.goals || aiResult.goals.length === 0) {
        console.log('[Suggestions] AI не згенерував рекомендацій, повертаємо існуючі');
        return {
          suggestions: existingSuggestions,
          generated_new: false,
          total_count: existingSuggestions.length,
        };
      }

      console.log(`[Suggestions] AI згенерував ${aiResult.goals.length} нових рекомендацій`);

      // 6. Фільтруємо дублікати
      const uniqueGoals = this.filterDuplicates(aiResult.goals, existingSuggestions);
      console.log(`[Suggestions] Після фільтрації дублікатів залишилось ${uniqueGoals.length} унікальних`);

      // 7. Зберігаємо унікальні рекомендації в БД
      if (uniqueGoals.length > 0) {
        await this.saveSuggestions(userId, projectId, uniqueGoals, entityType);
      }

      // 8. Отримуємо оновлений список pending рекомендацій
      const updatedSuggestions = await this.getPendingSuggestions(userId, projectId, entityType);

      return {
        suggestions: updatedSuggestions.slice(0, targetCount),
        generated_new: uniqueGoals.length > 0,
        total_count: updatedSuggestions.length,
      };

    } catch (error) {
      console.error('[Suggestions] Помилка в getOrFillPendingSuggestions:', error);
      
      // Graceful degradation: повертаємо існуючі якщо є
      try {
        const existingSuggestions = await this.getPendingSuggestions(userId, projectId, entityType);
        return {
          suggestions: existingSuggestions,
          generated_new: false,
          total_count: existingSuggestions.length,
        };
      } catch (fallbackError) {
        throw new InternalServerErrorException(`Ошибка получения рекомендаций: ${error.message}`);
      }
    }
  }

  /**
   * Фільтрує дублікати з нових цілей порівняно з існуючими
   */
  private filterDuplicates(newGoals: any[], existingSuggestions: Suggestion[]): any[] {
    const uniqueGoals: any[] = [];

    for (const newGoal of newGoals) {
      const isDuplicate = this.checkSimilarity(newGoal, existingSuggestions);
      if (!isDuplicate) {
        uniqueGoals.push(newGoal);
      } else {
        console.log(`[Suggestions] Пропускаємо дублікат: "${newGoal.title}"`);
      }
    }

    return uniqueGoals;
  }

  /**
   * Перевіряє чи є нова цель схожою на існуючі
   * @param newGoal - нова згенерована AI цель
   * @param existingGoals - масив існуючих pending рекомендацій
   * @returns true якщо схожа (дублікат), false якщо унікальна
   */
  private checkSimilarity(newGoal: any, existingGoals: any[]): boolean {
    try {
      // Валідація вхідних даних
      if (!newGoal || !existingGoals || !Array.isArray(existingGoals)) {
        console.warn('[Suggestions] checkSimilarity: невалідні вхідні дані');
        return false; // Вважаємо унікальною якщо не можемо перевірити
      }

      // Перебираємо всі існуючі рекомендації
      for (const existing of existingGoals) {
        try {
          // Отримуємо payload (дані цілі) з об'єкта suggestion
          const payload = existing.payload || existing;
          
          // ============ МЕТОД 1: ПОРІВНЯННЯ ПО KEYWORDS ============
          // Перевіряємо чи є keywords у обох цілей
          if (newGoal.keywords?.length && payload.keywords?.length) {
            // Створюємо Set з keywords нової цілі (toLowerCase для case-insensitive)
            const newKeywords = new Set(
              newGoal.keywords.map(k => k.toLowerCase())
            );
            
            // Створюємо Set з keywords існуючої цілі
            const existingKeywords = new Set(
              payload.keywords.map(k => k.toLowerCase())
            );
            
            // Знаходимо перетин (спільні keywords)
            const intersection = [...newKeywords].filter(k => 
              existingKeywords.has(k)
            );
            
            // Рахуємо процент перекриття
            // Використовуємо Math.min щоб врахувати менший набір
            const overlap = intersection.length / 
              Math.min(newKeywords.size, existingKeywords.size);
            
            // Якщо перекриття > 50% - вважаємо дублікатом
            if (overlap > 0.5) {
              console.log(`[Suggestions] Знайдено дублікат по keywords: overlap=${overlap.toFixed(2)}`);
              return true;
            }
          }
          
          // ============ МЕТОД 2: ПОРІВНЯННЯ ПО TITLE ============
          // Отримуємо заголовки (toLowerCase для case-insensitive)
          const newTitle = newGoal.title?.toLowerCase() || '';
          const existingTitle = payload.title?.toLowerCase() || '';
          
          // Якщо обидва заголовки порожні - пропускаємо
          if (!newTitle || !existingTitle) {
            continue;
          }
          
          // Рахуємо схожість заголовків
          const similarity = this.calculateSimilarity(newTitle, existingTitle);
          
          // Якщо схожість > 70% - вважаємо дублікатом
          if (similarity > 0.7) {
            console.log(`[Suggestions] Знайдено дублікат по title: similarity=${similarity.toFixed(2)}`);
            return true;
          }
          
        } catch (itemError) {
          // Якщо помилка при порівнянні з одним item - логуємо і продовжуємо
          console.error('[Suggestions] Помилка при порівнянні з item:', itemError);
          continue;
        }
      }
      
      // Якщо не знайшли жодних дублікатів - повертаємо false (унікальна)
      return false;
      
    } catch (error) {
      // Якщо критична помилка - логуємо і вважаємо унікальною
      console.error('[Suggestions] Критична помилка в checkSimilarity:', error);
      return false;
    }
  }

  /**
   * Розраховує схожість двох рядків на основі спільних слів
   * Простий алгоритм: процент спільних слів відносно більшого набору
   * TODO: можна покращити використовуючи Levenshtein distance або інші алгоритми
   * 
   * @param str1 - перший рядок для порівняння
   * @param str2 - другий рядок для порівняння
   * @returns число від 0 до 1 (0 - різні, 1 - ідентичні)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    try {
      // Валідація вхідних даних
      if (typeof str1 !== 'string' || typeof str2 !== 'string') {
        return 0;
      }
      
      // Якщо рядки пусті - повертаємо 0
      if (!str1.trim() || !str2.trim()) {
        return 0;
      }
      
      // Розбиваємо рядки на слова і фільтруємо короткі (< 3 символів)
      // Короткі слова (як "is", "in", "to") не дуже інформативні
      const words1 = new Set(
        str1.split(' ')
          .map(w => w.trim())
          .filter(w => w.length > 2)
      );
      
      const words2 = new Set(
        str2.split(' ')
          .map(w => w.trim())
          .filter(w => w.length > 2)
      );
      
      // Якщо після фільтрації немає слів - повертаємо 0
      if (words1.size === 0 || words2.size === 0) {
        return 0;
      }
      
      // Знаходимо перетин (спільні слова)
      const intersection = [...words1].filter(w => words2.has(w));
      
      // Рахуємо схожість як відношення спільних слів до більшого набору
      // Використовуємо Math.max щоб нормалізувати відносно більшого тексту
      const similarity = intersection.length / Math.max(words1.size, words2.size);
      
      return similarity;
      
    } catch (error) {
      // Якщо помилка - логуємо і повертаємо 0 (різні)
      console.error('[Suggestions] Помилка в calculateSimilarity:', error);
      return 0;
    }
  }

  /**
   * Оновити статус рекомендації (accepted/rejected)
   */
  async updateStatus(
    userId: string,
    suggestionId: number,
    status: 'accepted' | 'rejected'
  ): Promise<Suggestion> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('suggestions')
        .update({
          status,
          accepted_by: userId,
          accepted_at: now,
          updated_at: now,
        })
        .eq('id', suggestionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Рекомендація не знайдена');
        }
        throw new InternalServerErrorException(`Ошибка обновления статуса: ${error.message}`);
      }

      console.log(`[Suggestions] Статус рекомендації ${suggestionId} змінено на ${status}`);
      return data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления статуса: ${error.message}`);
    }
  }

  /**
   * Видалити одну рекомендацію
   */
  async deleteSuggestion(userId: string, suggestionId: number): Promise<void> {
    try {
      const { error } = await this.supabaseService
        .getAdminClient()
        .from('suggestions')
        .delete()
        .eq('id', suggestionId)
        .eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления рекомендации: ${error.message}`);
      }

      console.log(`[Suggestions] Рекомендацію ${suggestionId} видалено`);
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка удаления рекомендации: ${error.message}`);
    }
  }

  /**
   * Видалити всі pending рекомендації для проекту
   */
  async deleteAllPendingForProject(
    userId: string,
    projectId: number,
    entityType?: EntityType
  ): Promise<{ deleted_count: number }> {
    try {
      let query = this.supabaseService
        .getAdminClient()
        .from('suggestions')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .eq('status', 'pending');

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query.select();

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления рекомендаций: ${error.message}`);
      }

      const deletedCount = data?.length || 0;
      console.log(`[Suggestions] Видалено ${deletedCount} pending рекомендацій для проекту ${projectId}`);

      return { deleted_count: deletedCount };
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка удаления рекомендаций: ${error.message}`);
    }
  }
}

