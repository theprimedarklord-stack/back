import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Goal, CreateGoalData, UpdateGoalData, GoalPriority, GoalCategory } from './entities/goal.entity';

@Injectable()
export class GoalsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createGoalData: CreateGoalData, userId: string): Promise<Goal> {
    try {
      const goalCategory = createGoalData.category || 'technical';
      const goalPriority = createGoalData.priority || 'medium';
      const now = new Date().toISOString();

      const newGoal = {
        user_id: userId,
        title: createGoalData.title,
        description: createGoalData.description,
        keywords: createGoalData.keywords || [],
        category: goalCategory,
        priority: goalPriority,
        deadline: createGoalData.deadline || null,
        project_id: createGoalData.project_id || null,
        generated_by: createGoalData.generated_by || 'manual',
        confidence: createGoalData.confidence || null,
        ai_metadata: createGoalData.ai_metadata || null,
        created_at: now,
        updated_at: now,
      };

      // Создаём цель
      const { data: goal, error: goalError } = await this.supabaseService
        .getAdminClient()
        .from('goals')
        .insert(newGoal)
        .select()
        .single();

      if (goalError) {
        throw new InternalServerErrorException(`Ошибка создания цели: ${goalError.message}`);
      }

      // Создаём подцели, если они есть
      if (createGoalData.subgoals && createGoalData.subgoals.length > 0) {
        const subgoals = createGoalData.subgoals.map(subgoal => ({
          goal_id: goal.id,
          text: subgoal.text,
          completed: subgoal.completed || false,
          generated_by: subgoal.generated_by || 'manual',
          ai_metadata: subgoal.ai_metadata || null,
          created_at: now,
        }));

        const { data: createdSubgoals, error: subgoalsError} = await this.supabaseService
          .getAdminClient()
          .from('goal_subgoals')
          .insert(subgoals)
          .select();

        if (subgoalsError) {
          // Если не удалось создать подцели, удаляем цель
          await this.supabaseService
            .getAdminClient()
            .schema('project')
            .from('goals')
            .delete()
            .eq('id', goal.id);
          
          throw new InternalServerErrorException(`Ошибка создания подцелей: ${subgoalsError.message}`);
        }

        goal.goal_subgoals = createdSubgoals;
      } else {
        goal.goal_subgoals = [];
      }

      return goal;
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка создания цели: ${error.message}`);
    }
  }

  async findAll(userId: string): Promise<Goal[]> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('goals')
        .select(`
          *,
          goal_subgoals(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения целей: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка получения целей: ${error.message}`);
    }
  }

  async findOne(id: string, userId: string): Promise<Goal> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('goals')
        .select(`
          *,
          goal_subgoals(*)
        `)
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Цель не найдена');
        }
        throw new InternalServerErrorException(`Ошибка получения цели: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения цели: ${error.message}`);
    }
  }

  async update(id: string, updateGoalData: UpdateGoalData, userId: string): Promise<Goal> {
    try {
      // Проверяем, что цель существует и принадлежит пользователю
      await this.findOne(id, userId);

      const now = new Date().toISOString();
      const updateData: any = {
        updated_at: now,
      };

      if (updateGoalData.title !== undefined) updateData.title = updateGoalData.title;
      if (updateGoalData.description !== undefined) updateData.description = updateGoalData.description;
      if (updateGoalData.keywords !== undefined) updateData.keywords = updateGoalData.keywords;
      if (updateGoalData.category !== undefined) updateData.category = updateGoalData.category;
      if (updateGoalData.priority !== undefined) updateData.priority = updateGoalData.priority;
      if (updateGoalData.deadline !== undefined) updateData.deadline = updateGoalData.deadline;
      if (updateGoalData.project_id !== undefined) updateData.project_id = updateGoalData.project_id;
      if (updateGoalData.generated_by !== undefined) updateData.generated_by = updateGoalData.generated_by;
      if (updateGoalData.confidence !== undefined) updateData.confidence = updateGoalData.confidence;
      if (updateGoalData.ai_metadata !== undefined) updateData.ai_metadata = updateGoalData.ai_metadata;

      // Обновляем цель
      const { data: goal, error: goalError } = await this.supabaseService
        .getAdminClient()
        .from('goals')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (goalError) {
        throw new InternalServerErrorException(`Ошибка обновления цели: ${goalError.message}`);
      }

      // Обновляем подцели, если они переданы
      if (updateGoalData.subgoals !== undefined) {
        // Удаляем старые подцели
        await this.supabaseService
          .getAdminClient()
          .from('goal_subgoals')
          .delete()
          .eq('goal_id', id);

        // Создаём новые подцели
        if (updateGoalData.subgoals.length > 0) {
          const subgoals = updateGoalData.subgoals.map(subgoal => ({
            goal_id: Number(id),
            text: subgoal.text,
            completed: subgoal.completed || false,
            generated_by: subgoal.generated_by || 'manual',
            ai_metadata: subgoal.ai_metadata || null,
            created_at: now,
          }));

          const { data: createdSubgoals, error: subgoalsError } = await this.supabaseService
            .getAdminClient()
            .from('goal_subgoals')
            .insert(subgoals)
            .select();

          if (subgoalsError) {
            throw new InternalServerErrorException(`Ошибка обновления подцелей: ${subgoalsError.message}`);
          }

          goal.goal_subgoals = createdSubgoals;
        } else {
          goal.goal_subgoals = [];
        }
      } else {
        // Если подцели не переданы, получаем существующие
        const { data: existingSubgoals } = await this.supabaseService
          .getAdminClient()
          .from('goal_subgoals')
          .select('*')
          .eq('goal_id', id);

        goal.goal_subgoals = existingSubgoals || [];
      }

      return goal;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления цели: ${error.message}`);
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    try {
      // Проверяем, что цель существует и принадлежит пользователю
      await this.findOne(id, userId);

      // Удаляем цель (подцели удалятся автоматически через CASCADE)
      const { error } = await this.supabaseService
        .getAdminClient()
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления цели: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка удаления цели: ${error.message}`);
    }
  }

  async getSubgoals(goalId: string, userId: string) {
    try {
      // Проверяем, что цель принадлежит пользователю
      await this.findOne(goalId, userId);

      const { data: subgoals, error } = await this.supabaseService
        .getAdminClient()
        .from('goal_subgoals')
        .select('*')
        .eq('goal_id', goalId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения подцелей: ${error.message}`);
      }

      return subgoals || [];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения подцелей: ${error.message}`);
    }
  }

  async addSubgoal(goalId: string, text: string, completed: boolean = false, userId: string, generated_by: 'ai' | 'manual' = 'manual', ai_metadata: any = null) {
    try {
      // Проверяем, что цель принадлежит пользователю
      await this.findOne(goalId, userId);

      const now = new Date().toISOString();

      const { data: subgoal, error } = await this.supabaseService
        .getAdminClient()
        .from('goal_subgoals')
        .insert({
          goal_id: Number(goalId),
          text,
          completed,
          generated_by,
          ai_metadata,
          created_at: now,
        })
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(`Ошибка добавления подцели: ${error.message}`);
      }

      return subgoal;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка добавления подцели: ${error.message}`);
    }
  }

  async updateSubgoal(goalId: string, subgoalId: string, updateData: { text?: string; completed?: boolean }, userId: string) {
    try {
      // Проверяем, что цель принадлежит пользователю
      await this.findOne(goalId, userId);

      // Проверяем, что есть что обновлять
      if (updateData.text === undefined && updateData.completed === undefined) {
        throw new InternalServerErrorException('Нет полей для обновления');
      }

      const { data: subgoal, error } = await this.supabaseService
        .getAdminClient()
        .from('goal_subgoals')
        .update(updateData)
        .eq('id', subgoalId)
        .eq('goal_id', goalId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Подцель не найдена');
        }
        throw new InternalServerErrorException(`Ошибка обновления подцели: ${error.message}`);
      }

      return subgoal;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления подцели: ${error.message}`);
    }
  }

  async deleteSubgoal(goalId: string, subgoalId: string, userId: string): Promise<void> {
    try {
      // Проверяем, что цель принадлежит пользователю
      await this.findOne(goalId, userId);

      const { error } = await this.supabaseService
        .getAdminClient()
        .from('goal_subgoals')
        .delete()
        .eq('id', subgoalId)
        .eq('goal_id', goalId);

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления подцели: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка удаления подцели: ${error.message}`);
    }
  }

  async toggleSubgoal(goalId: string, subgoalId: string, userId: string): Promise<void> {
    try {
      // Проверяем, что цель принадлежит пользователю
      await this.findOne(goalId, userId);

      // Получаем текущий статус подцели
      const { data: subgoal, error: getError } = await this.supabaseService
        .getAdminClient()
        .from('goal_subgoals')
        .select('completed')
        .eq('id', subgoalId)
        .eq('goal_id', goalId)
        .single();

      if (getError) {
        if (getError.code === 'PGRST116') {
          throw new NotFoundException('Подцель не найдена');
        }
        throw new InternalServerErrorException(`Ошибка получения подцели: ${getError.message}`);
      }

      // Переключаем статус
      const { error: updateError } = await this.supabaseService
        .getAdminClient()
        .from('goal_subgoals')
        .update({ completed: !subgoal.completed })
        .eq('id', subgoalId)
        .eq('goal_id', goalId);

      if (updateError) {
        throw new InternalServerErrorException(`Ошибка обновления подцели: ${updateError.message}`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления подцели: ${error.message}`);
    }
  }

  // Вспомогательные методы для работы с категориями
  static getCategoryLabel(category: GoalCategory): string {
    const labels = {
      'technical': 'Техническая',
      'organizational': 'Организационная',
      'personal': 'Личная',
      'learning': 'Обучение',
      'business': 'Бизнес',
    };
    return labels[category] || category;
  }

  static getAllCategories(): { value: GoalCategory; label: string }[] {
    return [
      { value: 'technical', label: 'Техническая' },
      { value: 'organizational', label: 'Организационная' },
      { value: 'personal', label: 'Личная' },
      { value: 'learning', label: 'Обучение' },
      { value: 'business', label: 'Бизнес' },
    ];
  }

  // Вспомогательные методы для работы с приоритетами
  static getPriorityColor(priority: GoalPriority): string {
    const colors = {
      'low': '#10b981',        // зеленый
      'medium': '#f59e0b',     // оранжевый
      'high': '#ef4444',       // красный
      'critical': '#dc2626',   // темно-красный
    };
    return colors[priority] || '#6b7280';
  }

  static getPriorityLabel(priority: GoalPriority): string {
    const labels = {
      'low': 'Низкий',
      'medium': 'Средний',
      'high': 'Высокий',
      'critical': 'Критический',
    };
    return labels[priority] || priority;
  }

  static getAllPriorities(): { value: GoalPriority; label: string; color: string }[] {
    return [
      { value: 'low', label: 'Низкий', color: this.getPriorityColor('low') },
      { value: 'medium', label: 'Средний', color: this.getPriorityColor('medium') },
      { value: 'high', label: 'Высокий', color: this.getPriorityColor('high') },
      { value: 'critical', label: 'Критический', color: this.getPriorityColor('critical') },
    ];
  }
}

