// src/admin/admin.service.ts
import { Injectable, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AdminService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // Проверка роли администратора
  async checkAdminRole(userId: string): Promise<boolean> {
    const { data: userData, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error || userData?.role !== 'admin') {
      return false;
    }
    return true;
  }

  // Получение статистики пользователей
  async getUserStats() {
    const { data: users, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('user_id, role, created_at');

    if (error) {
      throw new Error('Не удалось получить статистику');
    }

    const total = users.length;
    const admins = users.filter(u => u.role === 'admin').length;
    const regularUsers = users.filter(u => u.role === 'user').length;
    
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = users.filter(u => {
      if (!u.created_at) return false;
      return new Date(u.created_at) > weekAgo;
    }).length;

    return {
      total,
      admins,
      users: regularUsers,
      recent: recentUsers,
    };
  }

  // Получение всех пользователей
  async getAllUsers() {
    const { data: users, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('user_id, email, role, created_at, last_sign_in_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Не удалось получить список пользователей');
    }

    return users;
  }

  // Изменение роли пользователя
  async changeUserRole(userId: string, role: string, adminId: string) {
    // Проверяем, что админ не меняет свою роль
    if (userId === adminId) {
      throw new Error('Нельзя изменить свою собственную роль');
    }

    // Валидация роли
    if (!role || !['admin', 'user'].includes(role)) {
      throw new Error('Недопустимая роль. Доступны: admin, user');
    }

    // Проверяем существование пользователя
    const { data: existingUser, error: checkError } = await this.supabaseService
      .getClient()
      .from('users')
      .select('user_id, email, role')
      .eq('user_id', userId)
      .single();

    if (checkError || !existingUser) {
      throw new Error('Пользователь не найден');
    }

    // Обновляем роль
    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('users')
      .update({ role })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error('Не удалось обновить роль пользователя');
    }

    // Логируем действие
    await this.logAdminAction(adminId, 'change_role', {
      targetUserId: userId,
      targetUserEmail: existingUser.email,
      oldRole: existingUser.role,
      newRole: role,
    });

    return {
      user_id: userId,
      email: existingUser.email,
      role: role,
    };
  }

  // Удаление пользователя
  async deleteUser(userId: string, adminId: string) {
    // Проверяем, что админ не удаляет себя
    if (userId === adminId) {
      throw new Error('Нельзя удалить свой собственный аккаунт');
    }

    // Проверяем существование пользователя
    const { data: existingUser, error: checkError } = await this.supabaseService
      .getClient()
      .from('users')
      .select('user_id, email, role')
      .eq('user_id', userId)
      .single();

    if (checkError || !existingUser) {
      throw new Error('Пользователь не найден');
    }

    const supabase = this.supabaseService.getClient();

    // Удаляем связанные данные


    // 1. Удаляем настройки пользователя
    await supabase.from('user_settings').delete().eq('user_id', userId);

    // 2. Удаляем карточки пользователя
    await supabase.from('cards').delete().eq('user_id', userId);

    // 3. Удаляем самого пользователя
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('user_id', userId);

    if (userError) {
      throw new Error('Не удалось удалить пользователя');
    }

    // 4. Удаляем из Supabase Auth
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (authDeleteError) {
      console.error('Ошибка удаления Auth пользователя:', authDeleteError);
    }

    // Логируем действие
    await this.logAdminAction(adminId, 'delete_user', {
      deletedUserId: userId,
      deletedUserEmail: existingUser.email,
    });



    return {
      user_id: userId,
      email: existingUser.email,
    };
  }

  // Запись в логи администратора
  private async logAdminAction(adminId: string, action: string, details?: any) {
    try {
      await this.supabaseService
        .getClient()
        .from('admin_logs')
        .insert({
          admin_id: adminId,
          action,
          details,
          created_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error('Ошибка записи в лог:', error);
    }
  }
}