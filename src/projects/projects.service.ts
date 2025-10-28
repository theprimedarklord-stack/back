import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Project, CreateProjectData, UpdateProjectData, ProjectCategory, ProjectPriority, ProjectStatus } from './entities/project.entity';

@Injectable()
export class ProjectsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createProjectData: CreateProjectData, userId: string): Promise<Project> {
    try {
      const projectCategory = createProjectData.category || 'technical';
      const projectPriority = createProjectData.priority || 'medium';
      const projectStatus = createProjectData.status || 'active';
      const now = new Date().toISOString();

      const newProject = {
        user_id: userId,
        title: createProjectData.title,
        description: createProjectData.description || null,
        keywords: createProjectData.keywords || [],
        category: projectCategory,
        priority: projectPriority,
        status: projectStatus,
        deadline: createProjectData.deadline || null,
        created_at: now,
        updated_at: now,
      };

      const { data: project, error } = await this.supabaseService
        .getAdminClient()
        .from('project.projects')
        .insert(newProject)
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(`Ошибка создания проекта: ${error.message}`);
      }

      return project;
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка создания проекта: ${error.message}`);
    }
  }

  async findAll(userId: string): Promise<Project[]> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('project.projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения проектов: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка получения проектов: ${error.message}`);
    }
  }

  async findOne(id: string, userId: string): Promise<Project> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('project.projects')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Проект не найден');
        }
        throw new InternalServerErrorException(`Ошибка получения проекта: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения проекта: ${error.message}`);
    }
  }

  async update(id: string, updateProjectData: UpdateProjectData, userId: string): Promise<Project> {
    try {
      // Проверяем, что проект существует и принадлежит пользователю
      await this.findOne(id, userId);

      const now = new Date().toISOString();
      const updateData: any = {
        updated_at: now,
      };

      if (updateProjectData.title !== undefined) updateData.title = updateProjectData.title;
      if (updateProjectData.description !== undefined) updateData.description = updateProjectData.description;
      if (updateProjectData.keywords !== undefined) updateData.keywords = updateProjectData.keywords;
      if (updateProjectData.category !== undefined) updateData.category = updateProjectData.category;
      if (updateProjectData.priority !== undefined) updateData.priority = updateProjectData.priority;
      if (updateProjectData.status !== undefined) updateData.status = updateProjectData.status;
      if (updateProjectData.deadline !== undefined) updateData.deadline = updateProjectData.deadline;

      const { data: project, error } = await this.supabaseService
        .getAdminClient()
        .from('project.projects')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(`Ошибка обновления проекта: ${error.message}`);
      }

      return project;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления проекта: ${error.message}`);
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    try {
      // Проверяем, что проект существует и принадлежит пользователю
      await this.findOne(id, userId);

      const { error } = await this.supabaseService
        .getAdminClient()
        .from('project.projects')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления проекта: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка удаления проекта: ${error.message}`);
    }
  }

  async getProjectGoals(projectId: string, userId: string) {
    try {
      // Проверяем, что проект принадлежит пользователю
      await this.findOne(projectId, userId);

      const { data: goals, error } = await this.supabaseService
        .getAdminClient()
        .from('project.goals')
        .select(`
          *,
          goal_subgoals(*)
        `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения целей проекта: ${error.message}`);
      }

      return goals || [];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения целей проекта: ${error.message}`);
    }
  }

  // Вспомогательные методы для работы с категориями
  static getCategoryLabel(category: ProjectCategory): string {
    const labels = {
      'technical': 'Техническая',
      'business': 'Бизнес',
      'personal': 'Личная',
      'learning': 'Обучение',
    };
    return labels[category] || category;
  }

  static getAllCategories(): { value: ProjectCategory; label: string }[] {
    return [
      { value: 'technical', label: 'Техническая' },
      { value: 'business', label: 'Бизнес' },
      { value: 'personal', label: 'Личная' },
      { value: 'learning', label: 'Обучение' },
    ];
  }

  // Вспомогательные методы для работы с приоритетами
  static getPriorityColor(priority: ProjectPriority): string {
    const colors = {
      'low': '#10b981',        // зеленый
      'medium': '#f59e0b',     // оранжевый
      'high': '#ef4444',       // красный
      'critical': '#dc2626',   // темно-красный
    };
    return colors[priority] || '#6b7280';
  }

  static getPriorityLabel(priority: ProjectPriority): string {
    const labels = {
      'low': 'Низкий',
      'medium': 'Средний',
      'high': 'Высокий',
      'critical': 'Критический',
    };
    return labels[priority] || priority;
  }

  static getAllPriorities(): { value: ProjectPriority; label: string; color: string }[] {
    return [
      { value: 'low', label: 'Низкий', color: this.getPriorityColor('low') },
      { value: 'medium', label: 'Средний', color: this.getPriorityColor('medium') },
      { value: 'high', label: 'Высокий', color: this.getPriorityColor('high') },
      { value: 'critical', label: 'Критический', color: this.getPriorityColor('critical') },
    ];
  }

  // Вспомогательные методы для работы со статусами
  static getStatusColor(status: ProjectStatus): string {
    const colors = {
      'active': '#3b82f6',       // синий
      'completed': '#22c55e',    // зеленый
      'on_hold': '#f59e0b',      // оранжевый
      'cancelled': '#ef4444',    // красный
    };
    return colors[status] || '#6b7280';
  }

  static getStatusLabel(status: ProjectStatus): string {
    const labels = {
      'active': 'Активный',
      'completed': 'Завершен',
      'on_hold': 'На паузе',
      'cancelled': 'Отменен',
    };
    return labels[status] || status;
  }

  static getAllStatuses(): { value: ProjectStatus; label: string; color: string }[] {
    return [
      { value: 'active', label: 'Активный', color: this.getStatusColor('active') },
      { value: 'completed', label: 'Завершен', color: this.getStatusColor('completed') },
      { value: 'on_hold', label: 'На паузе', color: this.getStatusColor('on_hold') },
      { value: 'cancelled', label: 'Отменен', color: this.getStatusColor('cancelled') },
    ];
  }

  /**
   * Сохранение сгенерированной AI структуры (цели + задачи)
   */
  async addGeneratedStructure(
    userId: string,
    projectId: number,
    structure: {
      goals: any[];
      tasks: any[];
    }
  ): Promise<{
    created_goals: any[];
    created_tasks: any[];
  }> {
    try {
      // Проверяем, что проект принадлежит пользователю
      await this.findOne(projectId.toString(), userId);

      const now = new Date().toISOString();
      const createdGoals: any[] = [];
      const createdTasks: any[] = [];

      // Создаем цели
      for (const goalData of structure.goals) {
        const { _tempId, ...goalWithoutTempId } = goalData;
        
        const newGoal = {
          user_id: userId,
          title: goalData.title,
          description: goalData.description || '',
          keywords: goalData.keywords || [],
          category: goalData.category || 'technical',
          priority: goalData.priority || 'medium',
          deadline: goalData.deadline || null,
          project_id: projectId,
          generated_by: goalData.generated_by || 'ai',
          confidence: goalData.confidence || null,
          ai_metadata: goalData.ai_metadata || null,
          created_at: now,
          updated_at: now,
        };

        const { data: goal, error: goalError } = await this.supabaseService
          .getAdminClient()
          .from('project.goals')
          .insert(newGoal)
          .select()
          .single();

        if (goalError) {
          console.error(`Error creating goal: ${goalError.message}`);
          throw new InternalServerErrorException(`Ошибка создания цели: ${goalError.message}`);
        }

        // Сохраняем созданную цель с маппингом временного ID
        createdGoals.push({ ...goal, _tempId });
      }

      // Создаем задачи и привязываем к реальным goal_id
      for (const taskData of structure.tasks) {
        const { _tempId, _tempGoalId, ...taskWithoutTempId } = taskData;
        
        // Найти реальный goal_id по временному ID
        let realGoalId = taskData.goal_id || null;
        if (_tempGoalId) {
          const matchedGoal = createdGoals.find(g => g._tempId === _tempGoalId);
          if (matchedGoal) {
            realGoalId = matchedGoal.id;
          }
        }

        const newTask = {
          user_id: userId,
          topic: taskData.topic,
          description: taskData.description || '',
          status: taskData.status || 'not_completed',
          priority: taskData.priority || 'medium',
          deadline: taskData.deadline || null,
          status_history: taskData.status_history || [{
            status: taskData.status || 'not_completed',
            timestamp: now,
            action: 'created'
          }],
          goal_id: realGoalId,
          subgoal_id: taskData.subgoal_id || null,
          generated_by: taskData.generated_by || 'ai',
          confidence: taskData.confidence || null,
          ai_metadata: taskData.ai_metadata || null,
          created_at: now,
          updated_at: now,
        };

        const { data: task, error: taskError } = await this.supabaseService
          .getAdminClient()
          .from('project.tasks')
          .insert(newTask)
          .select()
          .single();

        if (taskError) {
          console.error(`Error creating task: ${taskError.message}`);
          // Продолжаем даже если одна задача не создалась
          continue;
        }

        createdTasks.push(task);
      }

      console.log(`[Projects] Structure saved: goals=${createdGoals.length}, tasks=${createdTasks.length}`);

      return {
        created_goals: createdGoals,
        created_tasks: createdTasks,
      };

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка сохранения структуры: ${error.message}`);
    }
  }
}

