// src/ai/ai.service.ts
import { Injectable, HttpException, HttpStatus, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as crypto from 'crypto';
import { 
  AISettings, 
  AIRecommendation, 
  AIRecommendationsCache, 
  GenerateRecommendationsRequest,
  GenerateRecommendationsResponse 
} from './entities/ai-settings.entity';
import { UpdateAISettingsDto } from './dto/ai-settings.dto';
import { GenerateGoalsForProjectDto } from './dto/generate-goals.dto';
import { GenerateTasksForGoalDto } from './dto/generate-tasks.dto';
import { GenerateFullStructureDto } from './dto/generate-full-structure.dto';
import { 
  buildGenerateGoalsPrompt,
  buildGenerateTasksForGoalPrompt,
  buildGenerateFullStructurePrompt
} from './prompts/project-structure.prompts';

@Injectable()
export class AIService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async getSettings(userId: string): Promise<AISettings> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .schema('ai')
        .from('ai_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new InternalServerErrorException(`Ошибка получения настроек AI: ${error.message}`);
      }

      if (!data) {
        // Возвращаем дефолтные настройки
        return this.getDefaultSettings(userId);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения настроек AI: ${error.message}`);
    }
  }

  async updateSettings(userId: string, dto: UpdateAISettingsDto): Promise<AISettings> {
    try {
      const now = new Date().toISOString();
      
      // Получаем текущие настройки
      const currentSettings = await this.getSettings(userId);
      
      // Объединяем с новыми настройками
      const updatedSettings = {
        ...currentSettings,
        ...dto,
        user_id: userId,
        updated_at: now,
      };

      // Проверяем, изменились ли критические параметры для инвалидации кеша
      const shouldInvalidateCache = 
        dto.model !== undefined && dto.model !== currentSettings.model ||
        dto.temperature !== undefined && dto.temperature !== currentSettings.temperature;

      if (shouldInvalidateCache) {
        await this.clearCache(userId);
        console.log(`[AI] Cache invalidated for user ${userId} due to settings change`);
      }

      // Upsert настройки
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .schema('ai')
        .from('ai_settings')
        .upsert(updatedSettings, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(`Ошибка сохранения настроек AI: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка сохранения настроек AI: ${error.message}`);
    }
  }

  async generateRecommendations(userId: string, dto: GenerateRecommendationsRequest): Promise<GenerateRecommendationsResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`[AI] Request: userId=${userId}, goalId=${dto.goal_id}`);

      // Шаг 1: Получить настройки AI пользователя
      const settings = await this.getSettings(userId);
      
      // Шаг 2: Если AI отключен
      if (!settings.enabled) {
        console.log(`[AI] AI disabled for user ${userId}`);
        return {
          success: true,
          recommendations: [],
          cached: false,
        };
      }

      // Шаг 3: Получить данные цели
      const goal = await this.getGoalWithSubgoals(dto.goal_id, userId);
      
      // Шаг 4: Получить существующие задачи если нужно
      let existingTasks: any[] = [];
      if (settings.context?.considerExistingTasks) {
        existingTasks = await this.getGoalTasks(dto.goal_id, userId);
      }

      // Шаг 5: Создать contextHash
      const contextHash = this.generateContextHash(goal, existingTasks, settings);
      const cacheKey = `${userId}:${dto.goal_id}:${contextHash}`;

      // Шаг 6: Проверить кеш (если не force_refresh)
      if (!dto.force_refresh) {
        const cached = await this.getCachedRecommendations(userId, dto.goal_id, cacheKey);
        if (cached) {
          console.log(`[AI] Cache Hit: Supabase`);
          return {
            success: true,
            recommendations: cached.recommendations,
            cached: true,
            modelUsed: cached.model_used,
          };
        }
      }

      console.log(`[AI] Cache Miss: generating fresh recommendations`);

      // Шаг 7: Генерировать через Gemini API
      const prompt = this.buildPrompt(goal, existingTasks, settings);
      const { text, tokensUsed } = await this.callGeminiAPI(prompt, settings);
      
      // Шаг 8: Парсинг ответа
      const recommendations = this.parseAIResponse(text);

      // Шаг 9: Сохранить в кеш
      await this.saveToCache(userId, dto.goal_id, cacheKey, contextHash, recommendations, settings.model, tokensUsed);

      const duration = Date.now() - startTime;
      console.log(`[AI] Gemini API Call: tokens=${tokensUsed}, duration=${duration}ms`);

      return {
        success: true,
        recommendations,
        cached: false,
        tokensUsed,
        modelUsed: settings.model,
      };

    } catch (error) {
      console.error(`[AI] Error: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Graceful degradation - попытаться вернуть из кеша
      try {
        const cached = await this.getCachedRecommendations(userId, dto.goal_id);
        if (cached) {
          console.log(`[AI] Fallback to cache due to error`);
          return {
            success: true,
            recommendations: cached.recommendations,
            cached: true,
            modelUsed: cached.model_used,
          };
        }
      } catch (cacheError) {
        console.error(`[AI] Cache fallback failed: ${cacheError.message}`);
      }

      throw new InternalServerErrorException(`Ошибка генерации рекомендаций: ${error.message}`);
    }
  }

  async getCachedRecommendations(userId: string, goalId: number, cacheKey?: string): Promise<AIRecommendationsCache | null> {
    try {
      let query = this.supabaseService
        .getAdminClient()
        .schema('ai')
        .from('ai_recommendations_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('goal_id', goalId)
        .gt('expires_at', new Date().toISOString());

      if (cacheKey) {
        query = query.eq('cache_key', cacheKey);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        throw new InternalServerErrorException(`Ошибка получения кеша: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения кеша: ${error.message}`);
    }
  }

  async clearCache(userId: string, goalId?: number): Promise<void> {
    try {
      let query = this.supabaseService
        .getAdminClient()
        .schema('ai')
        .from('ai_recommendations_cache')
        .delete()
        .eq('user_id', userId);

      if (goalId) {
        query = query.eq('goal_id', goalId);
      }

      const { error } = await query;

      if (error) {
        throw new InternalServerErrorException(`Ошибка очистки кеша: ${error.message}`);
      }

      console.log(`[AI] Cache cleared for user ${userId}${goalId ? `, goal ${goalId}` : ''}`);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка очистки кеша: ${error.message}`);
    }
  }

  private async getGoalWithSubgoals(goalId: number, userId: string): Promise<any> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .schema('project')
      .from('goals')
      .select(`
        *,
        goal_subgoals(*)
      `)
      .eq('id', goalId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Цель не найдена');
      }
      throw new InternalServerErrorException(`Ошибка получения цели: ${error.message}`);
    }

    return data;
  }

  private async getGoalTasks(goalId: number, userId: string): Promise<any[]> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .schema('project')
      .from('tasks')
      .select('*')
      .eq('goal_id', goalId)
      .eq('user_id', userId);

    if (error) {
      console.error(`[AI] Error getting tasks: ${error.message}`);
      return [];
    }

    return data || [];
  }

  private buildPrompt(goal: any, existingTasks: any[], settings: AISettings): string {
    let prompt = `Ты - эксперт по управлению проектами и продуктивности.\n\n`;

    prompt += `ЦЕЛЬ:\n`;
    prompt += `Название: ${goal.title}\n`;
    if (goal.description) prompt += `Описание: ${goal.description}\n`;
    prompt += `Категория: ${goal.category}\n`;
    prompt += `Приоритет: ${goal.priority}\n`;
    if (goal.deadline) prompt += `Дедлайн: ${new Date(goal.deadline).toLocaleDateString('uk-UA')}\n`;
    if (goal.keywords?.length) prompt += `Ключевые слова: ${goal.keywords.join(', ')}\n`;

    if (goal.goal_subgoals?.length > 0) {
      prompt += `\nПОДЦЕЛИ (уже есть):\n`;
      goal.goal_subgoals.forEach(s => {
        prompt += `- ${s.text} (${s.completed ? 'Выполнено ✓' : 'Не выполнено'})\n`;
      });
    }

    if (settings.context?.considerExistingTasks && existingTasks?.length > 0) {
      prompt += `\nСУЩЕСТВУЮЩИЕ ЗАДАЧИ:\n`;
      existingTasks.forEach(t => {
        prompt += `- ${t.topic}: ${t.status}\n`;
      });
    }

    prompt += `\nЗАДАНИЕ:\n`;
    prompt += `Сгенерируй ${settings.recommendations_count} рекомендаций для задач, которые помогут достичь этой цели.\n\n`;

    // Детализация в зависимости от format.detailLevel
    if (settings.format?.detailLevel === 'detailed') {
      prompt += `Для каждой рекомендации предоставь:\n`;
      prompt += `1. Название задачи (краткое, до 50 символов)\n`;
      prompt += `2. Детальное описание (2-3 предложения)\n`;
      prompt += `3. Приоритет (critical/high/medium/low)\n`;
      if (settings.format?.includeTimeEstimates) {
        prompt += `4. Ожидаемое время выполнения (например: "2 часа", "1 день")\n`;
      }
      if (settings.format?.includeExamples) {
        prompt += `5. Пример выполнения или полезный совет\n`;
      }
    }

    // Тип рекомендаций
    const types: string[] = [];
    if (settings.recommendation_type?.tasks) types.push('конкретные выполнимые задачи');
    if (settings.recommendation_type?.subgoals) types.push('промежуточные цели/этапы');
    if (settings.recommendation_type?.steps) types.push('пошаговые инструкции');
    if (types.length > 0) {
      prompt += `\nТип рекомендаций: ${types.join(', ')}\n`;
    }

    prompt += `\nВАЖНО: Ответь ТОЛЬКО JSON массивом (без markdown, без пояснений):\n`;
    prompt += `[\n  {\n    "title": "Название задачи",\n    "description": "Описание задачи",\n    "priority": "high",\n`;
    if (settings.format?.includeTimeEstimates) prompt += `    "estimatedTime": "2 часа",\n`;
    if (settings.format?.includeExamples) prompt += `    "example": "Пример или совет",\n`;
    prompt += `    "type": "task"\n  }\n]\n`;

    // Язык ответа
    if (settings.language === 'en') {
      prompt += `\nAnswer in English.`;
    } else {
      prompt += `\nВідповідай українською мовою.`;
    }

    return prompt;
  }

  private parseAIResponse(text: string): AIRecommendation[] {
    try {
      // Удаляем markdown синтаксис
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```json\n?/i, '');
      cleaned = cleaned.replace(/^```\n?/i, '');
      cleaned = cleaned.replace(/\n?```$/i, '');
      cleaned = cleaned.trim();
      
      // Парсим JSON
      const parsed = JSON.parse(cleaned);
      
      // Валидация
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }
      
      // Проверяем обязательные поля
      const valid = parsed.every(item => 
        item.title && 
        item.description && 
        item.priority
      );
      
      if (!valid) {
        throw new Error('Invalid recommendation structure');
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw error;
    }
  }

  private generateContextHash(goal: any, tasks: any[], settings: AISettings): string {
    const data = {
      goalId: goal.id,
      goalTitle: goal.title,
      goalUpdatedAt: goal.updated_at,
      subgoalsCount: goal.goal_subgoals?.length || 0,
      tasksCount: tasks?.length || 0,
      model: settings.model,
      temperature: settings.temperature,
      recommendationsCount: settings.recommendations_count,
      language: settings.language,
      context: settings.context,
      format: settings.format,
      recommendationType: settings.recommendation_type,
    };
    
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
      
    return hash.substring(0, 16); // короткий хеш (16 символов)
  }

  private async callGeminiAPI(prompt: string, settings: AISettings): Promise<{ text: string; tokensUsed: number }> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    
    if (!apiKey) {
      throw new HttpException(
        'GEMINI_API_KEY не настроен',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: settings.model || 'gemini-2.0-flash-exp',
    });
    
    const generationConfig = {
      temperature: settings.temperature || 0.7,
      maxOutputTokens: settings.max_tokens || 2048,
    };
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    
    const response = result.response;
    const text = response.text();
    const tokensUsed = response.usageMetadata?.totalTokenCount || 0;
    
    return { text, tokensUsed };
  }

  private async saveToCache(
    userId: string, 
    goalId: number, 
    cacheKey: string, 
    contextHash: string, 
    recommendations: AIRecommendation[], 
    modelUsed: string, 
    tokensUsed: number
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 дней
      
      const cacheData = {
        user_id: userId,
        goal_id: goalId,
        cache_key: cacheKey,
        recommendations,
        context_hash: contextHash,
        model_used: modelUsed,
        tokens_used: tokensUsed,
        expires_at: expiresAt,
      };

      const { error } = await this.supabaseService
        .getAdminClient()
        .schema('ai')
        .from('ai_recommendations_cache')
        .upsert(cacheData, { 
          onConflict: 'user_id,goal_id,cache_key',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`[AI] Error saving to cache: ${error.message}`);
        // Не бросаем ошибку, так как это не критично
      }
    } catch (error) {
      console.error(`[AI] Error saving to cache: ${error.message}`);
      // Не бросаем ошибку, так как это не критично
    }
  }

  private getDefaultSettings(userId: string): AISettings {
    return {
      user_id: userId,
      enabled: true,
      model: 'gemini-2.0-flash-exp',
      temperature: 0.7,
      max_tokens: 2048,
      recommendations_count: 5,
      language: 'uk',
      context: {
        considerExistingTasks: true,
        considerHistory: true,
        considerCurrentGoals: true,
        considerDeadlines: true,
        considerPriorities: true,
      },
      format: {
        detailLevel: 'medium',
        includeExamples: true,
        includeTimeEstimates: true,
      },
      recommendation_type: {
        tasks: true,
        subgoals: true,
        steps: true,
      },
    };
  }

  // ==================== НОВЫЕ МЕТОДЫ ДЛЯ ГЕНЕРАЦИИ СТРУКТУРЫ ПРОЕКТОВ ====================

  /**
   * Поэтапная генерация целей для проекта
   */
  async generateGoalsForProject(
    userId: string,
    projectId: number,
    count: number = 5,
    existingGoals: any[] = []
  ): Promise<{
    success: boolean;
    goals: any[];
    cached: boolean;
    model_used?: string;
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`[AI] Generate Goals: projectId=${projectId}, count=${count}`);

      // Получить настройки AI
      const settings = await this.getSettings(userId);
      
      if (!settings.enabled) {
        console.log(`[AI] AI disabled for user ${userId}`);
        return {
          success: true,
          goals: [],
          cached: false,
        };
      }

      // Получить данные проекта
      const project = await this.getProject(projectId, userId);

      // Создать промпт
      const prompt = buildGenerateGoalsPrompt(project, existingGoals, count, settings);

      // Вызвать Gemini API
      const { text, tokensUsed } = await this.callGeminiAPI(prompt, settings);

      // Парсинг ответа
      const goals = this.parseGoalsResponse(text);

      // Добавить AI метаданные к целям
      const goalsWithMetadata = goals.map(goal => ({
        ...goal,
        project_id: projectId,
        generated_by: 'ai' as const,
        ai_metadata: {
          model: settings.model,
          prompt_version: '1.0',
          tokens_used: tokensUsed,
          source_project_id: projectId,
        },
      }));

      const duration = Date.now() - startTime;
      console.log(`[AI] Goals generated: count=${goalsWithMetadata.length}, tokens=${tokensUsed}, duration=${duration}ms`);

      return {
        success: true,
        goals: goalsWithMetadata,
        cached: false,
        model_used: settings.model,
      };

    } catch (error) {
      console.error(`[AI] Error generating goals: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(`Ошибка генерации целей: ${error.message}`);
    }
  }

  /**
   * Генерация задач для конкретной цели
   */
  async generateTasksForGoal(
    userId: string,
    goalId: number,
    projectId: number,
    settings: { count?: number; include_subgoals?: boolean } = {}
  ): Promise<{
    success: boolean;
    tasks: any[];
    subgoals?: any[];
    cached: boolean;
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`[AI] Generate Tasks: goalId=${goalId}, projectId=${projectId}`);

      // Получить настройки AI
      const aiSettings = await this.getSettings(userId);
      
      if (!aiSettings.enabled) {
        console.log(`[AI] AI disabled for user ${userId}`);
        return {
          success: true,
          tasks: [],
          cached: false,
        };
      }

      // Получить данные цели и проекта
      const goal = await this.getGoalWithSubgoals(goalId, userId);
      const project = await this.getProject(projectId, userId);

      // Создать промпт
      const prompt = buildGenerateTasksForGoalPrompt(goal, project, settings);

      // Вызвать Gemini API
      const { text, tokensUsed } = await this.callGeminiAPI(prompt, aiSettings);

      // Парсинг ответа
      const result = this.parseTasksResponse(text);

      // Добавить AI метаданные к задачам
      const tasksWithMetadata = result.tasks.map(task => ({
        ...task,
        goal_id: goalId,
        generated_by: 'ai' as const,
        ai_metadata: {
          model: aiSettings.model,
          prompt_version: '1.0',
          tokens_used: tokensUsed,
          source_goal_id: goalId,
          source_project_id: projectId,
        },
      }));

      const duration = Date.now() - startTime;
      console.log(`[AI] Tasks generated: count=${tasksWithMetadata.length}, tokens=${tokensUsed}, duration=${duration}ms`);

      return {
        success: true,
        tasks: tasksWithMetadata,
        cached: false,
      };

    } catch (error) {
      console.error(`[AI] Error generating tasks: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(`Ошибка генерации задач: ${error.message}`);
    }
  }

  /**
   * Каскадная генерация полной структуры (цели + задачи + подцели)
   */
  async generateFullStructure(
    userId: string,
    projectId: number,
    settings: GenerateFullStructureDto['settings']
  ): Promise<{
    success: boolean;
    structure: {
      goals: any[];
      tasks: any[];
      subgoals: any[];
    };
    metadata: {
      total_tokens: number;
      generation_time: number;
      model: string;
    };
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`[AI] Generate Full Structure: projectId=${projectId}`);

      // Получить настройки AI
      const aiSettings = await this.getSettings(userId);
      
      if (!aiSettings.enabled) {
        console.log(`[AI] AI disabled for user ${userId}`);
        return {
          success: true,
          structure: {
            goals: [],
            tasks: [],
            subgoals: [],
          },
          metadata: {
            total_tokens: 0,
            generation_time: 0,
            model: aiSettings.model,
          },
        };
      }

      // Получить данные проекта
      const project = await this.getProject(projectId, userId);

      // Создать промпт
      const prompt = buildGenerateFullStructurePrompt(project, settings);

      // Вызвать Gemini API
      const { text, tokensUsed } = await this.callGeminiAPI(prompt, aiSettings);

      // Парсинг ответа
      const parsedStructure = this.parseFullStructureResponse(text);

      // Подготовить структуру с AI метаданными
      const goals: any[] = [];
      const tasks: any[] = [];
      const subgoals: any[] = [];

      parsedStructure.goals.forEach((goal, goalIndex) => {
        // Добавить цель с метаданными
        goals.push({
          title: goal.title,
          description: goal.description,
          keywords: goal.keywords || [],
          category: goal.category,
          priority: goal.priority,
          deadline: goal.deadline || null,
          project_id: projectId,
          generated_by: 'ai' as const,
          confidence: goal.confidence || 0.85,
          ai_metadata: {
            model: aiSettings.model,
            prompt_version: '1.0',
            tokens_used: tokensUsed,
            source_project_id: projectId,
          },
          _tempId: `goal_${goalIndex}`, // Временный ID для связи с задачами
        });

        // Добавить задачи для этой цели
        if (goal.tasks && Array.isArray(goal.tasks)) {
          goal.tasks.forEach((task, taskIndex) => {
            tasks.push({
              topic: task.topic,
              description: task.description,
              priority: task.priority || 'medium',
              deadline: task.deadline || null,
              status: 'not_completed',
              generated_by: 'ai' as const,
              confidence: task.confidence || 0.9,
              ai_metadata: {
                model: aiSettings.model,
                prompt_version: '1.0',
                tokens_used: tokensUsed,
                source_project_id: projectId,
              },
              _tempGoalId: `goal_${goalIndex}`, // Связь с родительской целью
              _tempId: `task_${goalIndex}_${taskIndex}`, // Временный ID
            });

            // Добавить подцели для задачи
            if (task.subgoals && Array.isArray(task.subgoals)) {
              task.subgoals.forEach(subgoal => {
                subgoals.push({
                  text: subgoal.text,
                  completed: subgoal.completed || false,
                  generated_by: 'ai' as const,
                  ai_metadata: {
                    model: aiSettings.model,
                    prompt_version: '1.0',
                    tokens_used: tokensUsed,
                  },
                  _tempTaskId: `task_${goalIndex}_${taskIndex}`, // Связь с родительской задачей
                });
              });
            }
          });
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[AI] Full structure generated: goals=${goals.length}, tasks=${tasks.length}, subgoals=${subgoals.length}, tokens=${tokensUsed}, duration=${duration}ms`);

      return {
        success: true,
        structure: {
          goals,
          tasks,
          subgoals,
        },
        metadata: {
          total_tokens: tokensUsed,
          generation_time: duration,
          model: aiSettings.model,
        },
      };

    } catch (error) {
      console.error(`[AI] Error generating full structure: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(`Ошибка генерации полной структуры: ${error.message}`);
    }
  }

  // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

  private async getProject(projectId: number, userId: string): Promise<any> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .schema('project')
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Проект не найден');
      }
      throw new InternalServerErrorException(`Ошибка получения проекта: ${error.message}`);
    }

    return data;
  }

  private parseGoalsResponse(text: string): any[] {
    try {
      // Удаляем markdown синтаксис
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```json\n?/i, '');
      cleaned = cleaned.replace(/^```\n?/i, '');
      cleaned = cleaned.replace(/\n?```$/i, '');
      cleaned = cleaned.trim();
      
      // Парсим JSON
      const parsed = JSON.parse(cleaned);
      
      // Валидация
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse goals response:', error);
      console.error('Raw text:', text);
      throw new InternalServerErrorException('Ошибка парсинга ответа AI');
    }
  }

  private parseTasksResponse(text: string): { tasks: any[] } {
    try {
      // Удаляем markdown синтаксис
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```json\n?/i, '');
      cleaned = cleaned.replace(/^```\n?/i, '');
      cleaned = cleaned.replace(/\n?```$/i, '');
      cleaned = cleaned.trim();
      
      // Парсим JSON
      const parsed = JSON.parse(cleaned);
      
      // Валидация
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('Response does not contain tasks array');
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse tasks response:', error);
      console.error('Raw text:', text);
      throw new InternalServerErrorException('Ошибка парсинга ответа AI');
    }
  }

  private parseFullStructureResponse(text: string): { goals: any[] } {
    try {
      // Удаляем markdown синтаксис
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```json\n?/i, '');
      cleaned = cleaned.replace(/^```\n?/i, '');
      cleaned = cleaned.replace(/\n?```$/i, '');
      cleaned = cleaned.trim();
      
      // Парсим JSON
      const parsed = JSON.parse(cleaned);
      
      // Валидация
      if (!parsed.goals || !Array.isArray(parsed.goals)) {
        throw new Error('Response does not contain goals array');
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse full structure response:', error);
      console.error('Raw text:', text);
      throw new InternalServerErrorException('Ошибка парсинга ответа AI');
    }
  }
}
