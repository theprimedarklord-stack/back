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
        .from('projects')
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
        .from('projects')
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
        .from('projects')
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
        .from('projects')
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
        .from('projects')
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
        .from('goals')
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
}

