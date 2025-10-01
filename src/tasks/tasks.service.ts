import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Task, CreateTaskData, UpdateTaskData } from './entities/task.entity';

@Injectable()
export class TasksService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createTaskData: CreateTaskData, userId: string): Promise<Task> {
    try {
      const newTask = {
        user_id: userId,
        ...createTaskData,
        completed: createTaskData.completed || false,
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

  async findAll(userId: string): Promise<Task[]> {
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

      return data || [];
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

      return data;
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
}
