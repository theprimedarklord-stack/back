// src/admin/admin.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role?: string;
  };
}

@Controller('admin')
export class AdminController {
  constructor(private readonly supabaseService: SupabaseService) {}

  // Проверка роли администратора
  private async checkAdminRole(userId: string) {
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
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getUserStats(@Req() req: AuthenticatedRequest) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Получаем всех пользователей
      const { data: users, error } = await this.supabaseService
        .getClient()
        .from('users')
        .select('user_id, role, created_at');

      if (error) {
        console.error('Ошибка получения пользователей для статистики:', error);
        return {
          success: false,
          error: 'Не удалось получить статистику',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      // Подсчитываем статистику
      const total = users.length;
      const admins = users.filter(u => u.role === 'admin').length;
      const regularUsers = users.filter(u => u.role === 'user').length;
      
      // Пользователи за последнюю неделю
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentUsers = users.filter(u => {
        if (!u.created_at) return false;
        return new Date(u.created_at) > weekAgo;
      }).length;

      return {
        success: true,
        stats: {
          total,
          admins,
          users: regularUsers,
          recent: recentUsers,
        },
      };
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Получение списка всех пользователей
  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getAllUsers(@Req() req: AuthenticatedRequest) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Получаем всех пользователей
      const { data: users, error } = await this.supabaseService
        .getClient()
        .from('users')
        .select('user_id, email, role, created_at, last_sign_in_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Ошибка получения списка пользователей:', error);
        return {
          success: false,
          error: 'Не удалось получить список пользователей',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return {
        success: true,
        users: users,
      };
    } catch (error) {
      console.error('Ошибка получения пользователей:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Изменение роли пользователя
  @Patch('users/:userId/role')
  @UseGuards(JwtAuthGuard)
  async changeUserRole(
    @Param('userId') userId: string,
    @Body() body: { role: string },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Проверяем, что пользователь не пытается изменить свою роль
      if (userId === req.user.id) {
        return {
          success: false,
          error: 'Нельзя изменить свою собственную роль',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Валидация роли
      const { role } = body;
      if (!role || !['admin', 'user'].includes(role)) {
        return {
          success: false,
          error: 'Недопустимая роль. Доступны: admin, user',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Проверяем, существует ли пользователь
      const { data: existingUser, error: checkError } = await this.supabaseService
        .getClient()
        .from('users')
        .select('user_id, email, role')
        .eq('user_id', userId)
        .single();

      if (checkError || !existingUser) {
        return {
          success: false,
          error: 'Пользователь не найден',
          status: HttpStatus.NOT_FOUND,
        };
      }

      // Обновляем роль
      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('users')
        .update({ role })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Ошибка обновления роли:', updateError);
        return {
          success: false,
          error: 'Не удалось обновить роль пользователя',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      console.log(`Роль пользователя ${existingUser.email} изменена с ${existingUser.role} на ${role}`);

      return {
        success: true,
        message: `Роль пользователя изменена на ${role}`,
        user: {
          user_id: userId,
          email: existingUser.email,
          role: role,
        },
      };
    } catch (error) {
      console.error('Ошибка изменения роли:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Удаление пользователя
  @Delete('users/:userId')
  @UseGuards(JwtAuthGuard)
  async deleteUser(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Проверяем, что пользователь не пытается удалить себя
      if (userId === req.user.id) {
        return {
          success: false,
          error: 'Нельзя удалить свой собственный аккаунт',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Проверяем, существует ли пользователь
      const { data: existingUser, error: checkError } = await this.supabaseService
        .getClient()
        .from('users')
        .select('user_id, email, role')
        .eq('user_id', userId)
        .single();

      if (checkError || !existingUser) {
        return {
          success: false,
          error: 'Пользователь не найден',
          status: HttpStatus.NOT_FOUND,
        };
      }

      // Начинаем транзакцию удаления
      const supabase = this.supabaseService.getClient();

      // Удаляем связанные данные
      console.log(`Начинаем удаление пользователя ${existingUser.email}`);

      // 1. Удаляем настройки пользователя
      const { error: settingsError } = await supabase
        .from('user_settings')
        .delete()
        .eq('user_id', userId);

      if (settingsError) {
        console.error('Ошибка удаления настроек:', settingsError);
      }

      // 2. Удаляем карточки пользователя (если есть такая таблица)
      const { error: cardsError } = await supabase
        .from('cards')
        .delete()
        .eq('user_id', userId);

      if (cardsError) {
        console.error('Ошибка удаления карточек:', cardsError);
      }

      // 3. Удаляем самого пользователя
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('user_id', userId);

      if (userError) {
        console.error('Ошибка удаления пользователя:', userError);
        return {
          success: false,
          error: 'Не удалось удалить пользователя',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      // 4. Удаляем из Supabase Auth (если возможно)
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
          console.error('Ошибка удаления из Auth:', authError);
          // Не критично, продолжаем
        }
      } catch (authDeleteError) {
        console.error('Ошибка удаления Auth пользователя:', authDeleteError);
        // Не критично, пользователь уже удален из основной таблицы
      }

      console.log(`Пользователь ${existingUser.email} успешно удален`);

      return {
        success: true,
        message: 'Пользователь успешно удален',
        deletedUser: {
          user_id: userId,
          email: existingUser.email,
        },
      };
    } catch (error) {
      console.error('Ошибка удаления пользователя:', error);
      return {
        success: false,
        error: 'Серверная ошибка при удалении пользователя',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Получение информации о конкретном пользователе
  @Get('users/:userId')
  @UseGuards(JwtAuthGuard)
  async getUserById(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Получаем пользователя
      const { data: user, error } = await this.supabaseService
        .getClient()
        .from('users')
        .select('user_id, email, role, created_at, last_sign_in_at')
        .eq('user_id', userId)
        .single();

      if (error || !user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          status: HttpStatus.NOT_FOUND,
        };
      }

      return {
        success: true,
        user: user,
      };
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Блокировка/разблокировка пользователя
  @Patch('users/:userId/status')
  @UseGuards(JwtAuthGuard)
  async toggleUserStatus(
    @Param('userId') userId: string,
    @Body() body: { is_blocked: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Проверяем, что пользователь не пытается заблокировать себя
      if (userId === req.user.id) {
        return {
          success: false,
          error: 'Нельзя изменить статус своего аккаунта',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      const { is_blocked } = body;
      if (typeof is_blocked !== 'boolean') {
        return {
          success: false,
          error: 'Неверный параметр is_blocked',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Проверяем, существует ли пользователь
      const { data: existingUser, error: checkError } = await this.supabaseService
        .getClient()
        .from('users')
        .select('user_id, email, is_blocked')
        .eq('user_id', userId)
        .single();

      if (checkError || !existingUser) {
        return {
          success: false,
          error: 'Пользователь не найден',
          status: HttpStatus.NOT_FOUND,
        };
      }

      // Обновляем статус
      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('users')
        .update({ is_blocked })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Ошибка обновления статуса:', updateError);
        return {
          success: false,
          error: 'Не удалось обновить статус пользователя',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      const action = is_blocked ? 'заблокирован' : 'разблокирован';
      console.log(`Пользователь ${existingUser.email} ${action}`);

      return {
        success: true,
        message: `Пользователь ${action}`,
        user: {
          user_id: userId,
          email: existingUser.email,
          is_blocked: is_blocked,
        },
      };
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Получение логов действий (если есть таблица логов)
  @Get('logs')
  @UseGuards(JwtAuthGuard)
  async getAdminLogs(@Req() req: AuthenticatedRequest) {
    try {
      // Проверяем права администратора
      const isAdmin = await this.checkAdminRole(req.user.id);
      if (!isAdmin) {
        return {
          success: false,
          error: 'Доступ запрещен: требуется роль администратора',
          status: HttpStatus.FORBIDDEN,
        };
      }

      // Получаем логи (если есть таблица admin_logs)
      const { data: logs, error } = await this.supabaseService
        .getClient()
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Ошибка получения логов:', error);
        return {
          success: false,
          error: 'Не удалось получить логи',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return {
        success: true,
        logs: logs || [],
      };
    } catch (error) {
      console.error('Ошибка получения логов:', error);
      return {
        success: false,
        error: 'Серверная ошибка',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // Метод для записи в логи администратора
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