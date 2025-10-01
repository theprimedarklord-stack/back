import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Task, CreateTaskData, UpdateTaskData, TaskStatus } from './entities/task.entity';

@Injectable()
export class TasksService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createTaskData: CreateTaskData, userId: string): Promise<Task> {
    try {
      const newTask = {
        user_id: userId,
        ...createTaskData,
        status: createTaskData.status || 'not_completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('tasks')
        .insert(newTask)
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(`Ошибка создания задачи: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка создания задачи: ${error.message}`);
    }
  }

  async findAll(userId: string, overdue?: boolean): Promise<Task[]> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения задач: ${error.message}`);
      }

      let tasks = data || [];

      // Добавляем поле is_overdue для каждой задачи
      tasks = tasks.map(task => ({
        ...task,
        is_overdue: this.isTaskOverdue(task)
      }));

      // Фильтруем по просроченным задачам если запрошено
      if (overdue === true) {
        tasks = tasks.filter(task => task.is_overdue);
      }

      return tasks;
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка получения задач: ${error.message}`);
    }
  }

  async findOne(id: string, userId: string): Promise<Task> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Задача не найдена');
        }
        throw new InternalServerErrorException(`Ошибка получения задачи: ${error.message}`);
      }

      // Добавляем поле is_overdue
      return {
        ...data,
        is_overdue: this.isTaskOverdue(data)
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения задачи: ${error.message}`);
    }
  }

  async update(id: string, updateTaskData: UpdateTaskData, userId: string): Promise<Task> {
    try {
      const updateData = {
        ...updateTaskData,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Задача не найдена');
        }
        throw new InternalServerErrorException(`Ошибка обновления задачи: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления задачи: ${error.message}`);
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    try {
      const { error } = await this.supabaseService
        .getAdminClient()
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления задачи: ${error.message}`);
      }
    } catch (error) {
      throw new InternalServerErrorException(`Ошибка удаления задачи: ${error.message}`);
    }
  }

  // Вспомогательные методы для работы со статусами
  static getStatusColor(status: TaskStatus): string {
    const colors = {
      'not_completed': '#ef4444',      // красный
      'completed': '#22c55e',          // зеленый
      'not_needed': '#a855f7',         // фиолетовый
      'half_completed': '#84cc16',     // светло-зеленый
      'urgent': '#3b82f6',             // синий
    };
    return colors[status] || '#6b7280';
  }

  static getStatusLabel(status: TaskStatus): string {
    const labels = {
      'not_completed': 'Не выполнено',
      'completed': 'Выполнено',
      'not_needed': 'Не нужно делать',
      'half_completed': 'Выполнено на 50%',
      'urgent': 'Мега срочно',
    };
    return labels[status] || status;
  }

  static getAllStatuses(): { value: TaskStatus; label: string; color: string }[] {
    return [
      { value: 'not_completed', label: 'Не выполнено', color: this.getStatusColor('not_completed') },
      { value: 'completed', label: 'Выполнено', color: this.getStatusColor('completed') },
      { value: 'not_needed', label: 'Не нужно делать', color: this.getStatusColor('not_needed') },
      { value: 'half_completed', label: 'Выполнено на 50%', color: this.getStatusColor('half_completed') },
      { value: 'urgent', label: 'Мега срочно', color: this.getStatusColor('urgent') },
    ];
  }

  // Метод для определения просроченных задач
  private isTaskOverdue(task: Task): boolean {
    if (!task.deadline) return false;
    if (task.status === 'completed' || task.status === 'not_needed') return false;
    
    return new Date(task.deadline) < new Date();
  }
}
