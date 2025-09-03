import { Body, Controller, Get, Post, Delete, Req, Res, UseGuards, HttpStatus, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response, Request } from 'express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import * as multer from 'multer';
import * as path from 'path';
import * as crypto from 'crypto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role?: string;
  };
}

// Конфигурация для multer
const multerConfig: MulterOptions = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new BadRequestException('Invalid file type'), false);
    }
  },
};

@Controller('user')
export class UserController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', multerConfig))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      if (!file) {
        return {
          success: false,
          error: 'Файл не предоставлен',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      if (!req.user?.id) {
        console.error('ID пользователя не найден в запросе');
        return {
          success: false,
          error: 'Пользователь не авторизован',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

  

      // Генерируем уникальное имя файла
      const fileExtension = path.extname(file.originalname);
      const fileName = `avatar_${req.user.id}_${crypto.randomUUID()}${fileExtension}`;
      const filePath = `${req.user.id}/${fileName}`;

      

      // Используем админ клиент для операций с хранилищем
      const adminClient = this.supabaseService.getAdminClient();
      
      const { data: uploadData, error: uploadError } = await adminClient
        .storage
        .from('card-images')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Ошибка загрузки:', uploadError);
        return {
          success: false,
          error: 'Не удалось загрузить файл',
          details: uploadError.message,
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      

      // Получаем публичный URL файла
      const { data: urlData } = adminClient
        .storage
        .from('card-images')
        .getPublicUrl(filePath);

      const avatarUrl = urlData.publicUrl;
      

      // Получаем текущий аватар для удаления старого файла
      const { data: currentUser } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('avatar_url')
        .eq('user_id', req.user.id)
        .single();

      // Обновляем URL аватара в базе данных
      const { error: updateError } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('user_id', req.user.id);

      if (updateError) {
        console.error('Ошибка обновления базы данных:', updateError);
        // Удаляем загруженный файл, если не удалось обновить базу
        await adminClient
          .storage
          .from('card-images')
          .remove([filePath]);
        
        return {
          success: false,
          error: 'Не удалось обновить профиль пользователя',
          details: updateError.message,
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      // Удаляем старый аватар, если он был
      if (currentUser?.avatar_url) {
        try {
          const oldFilePath = this.extractFilePathFromUrl(currentUser.avatar_url);
          if (oldFilePath) {
    
            await adminClient
              .storage
              .from('card-images')
              .remove([oldFilePath]);
          }
        } catch (error) {
          console.error('Ошибка удаления старого аватара:', error);
          // Не возвращаем ошибку, так как основная операция прошла успешно
        }
      }

      return {
        success: true,
        avatar_url: avatarUrl,
        message: 'Аватар успешно загружен',
      };

    } catch (error) {
      console.error('Ошибка загрузки аватара:', error);
      return {
        success: false,
        error: 'Ошибка сервера',
        details: error.message,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Delete('avatar')
  @UseGuards(JwtAuthGuard)
  async removeAvatar(@Req() req: AuthenticatedRequest) {
    try {
      // Проверяем что user.id существует
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      // Получаем текущий аватар
      const { data: currentUser, error: fetchError } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('avatar_url')
        .eq('user_id', req.user.id)
        .single();

      if (fetchError) {
        console.error('Fetch user error:', fetchError);
        return {
          success: false,
          error: 'Failed to fetch user data',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      // Обновляем базу данных - убираем avatar_url
      const { error: updateError } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .update({ avatar_url: null })
        .eq('user_id', req.user.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        return {
          success: false,
          error: 'Failed to update user profile',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      // Удаляем файл из Storage, если он был
      if (currentUser?.avatar_url) {
        try {
          const filePath = this.extractFilePathFromUrl(currentUser.avatar_url);
          if (filePath) {
    
            
            // ИСПРАВЛЕНИЕ: Используем админ клиент для удаления файлов
            const adminClient = this.supabaseService.getAdminClient();
            const { error: deleteError } = await adminClient
              .storage
              .from('card-images')
              .remove([filePath]);

            if (deleteError) {
              console.error('File deletion error:', deleteError);
              // Не возвращаем ошибку, так как основная операция прошла успешно
            } else {
      
            }
          }
        } catch (error) {
          console.error('Error deleting avatar file:', error);
          // Не возвращаем ошибку, так как основная операция прошла успешно
        }
      }

      return {
        success: true,
        message: 'Avatar removed successfully',
      };

    } catch (error) {
      console.error('Avatar removal error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('avatar')
  @UseGuards(JwtAuthGuard)
  async getAvatar(@Req() req: AuthenticatedRequest) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { data: userData, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('avatar_url')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        console.error('Get avatar error:', error);
        return {
          success: false,
          error: 'Failed to fetch avatar',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return {
        success: true,
        avatar_url: userData?.avatar_url || null,
      };

    } catch (error) {
      console.error('Get avatar server error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  // ИСПРАВЛЕНИЕ: Обновленный метод для извлечения пути файла из URL
  private extractFilePathFromUrl(url: string): string | null {
    try {
      // Пример URL: https://your-project.supabase.co/storage/v1/object/public/card-images/user-id/avatar_123_uuid.jpg
      const urlParts = url.split('/');
      const publicIndex = urlParts.findIndex(part => part === 'public');
      const bucketIndex = urlParts.findIndex(part => part === 'card-images');
      
      if (publicIndex !== -1 && bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        // Возвращаем путь после названия bucket
        return urlParts.slice(bucketIndex + 1).join('/');
      }
      
      // Альтернативный способ - ищем после card-images
      const cardImagesIndex = urlParts.findIndex(part => part === 'card-images');
      if (cardImagesIndex !== -1 && cardImagesIndex < urlParts.length - 1) {
        return urlParts.slice(cardImagesIndex + 1).join('/');
      }
      
      console.error('Could not extract file path from URL:', url);
      return null;
    } catch (error) {
      console.error('Error extracting file path from URL:', error);
      return null;
    }
  }
  
  @Get('theme')
  @UseGuards(JwtAuthGuard)
  async getTheme(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { data: userData, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('theme')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        return {
          success: false,
          error: 'Failed to fetch theme',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      const theme = userData?.theme || 'light';
      res.cookie('theme', theme, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, theme };
    } catch (error) {
      console.error('Get theme error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('theme')
  @UseGuards(JwtAuthGuard)
  async updateTheme(
    @Body() body: { theme: string },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { theme } = body;
      if (!theme || !['light', 'dark'].includes(theme)) {
        return {
          success: false,
          error: 'Invalid theme',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      const { error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .update({ theme })
        .eq('user_id', req.user.id);

      if (error) {
        return {
          success: false,
          error: 'Failed to update theme',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      res.cookie('theme', theme, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, theme };
    } catch (error) {
      console.error('Update theme error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('sidebar')
  @UseGuards(JwtAuthGuard)
  async getSidebarSettings(@Req() req: AuthenticatedRequest) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { data: settingsData, error } = await this.supabaseService
        .getAdminClient()
        .from('user_settings')
        .select('sidebar_pinned, sidebar_width')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        console.error('Get sidebar settings error:', error);
        return {
          success: false,
          error: 'Failed to fetch sidebar settings',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { 
        success: true, 
        sidebar_pinned: settingsData?.sidebar_pinned || false,
        sidebar_width: settingsData?.sidebar_width || 234
      };
    } catch (error) {
      console.error('Get sidebar settings error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('sidebar')
  @UseGuards(JwtAuthGuard)
  async updateSidebarSettings(
    @Body() body: { sidebar_pinned?: boolean; sidebar_width?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { sidebar_pinned, sidebar_width } = body;
      
      // Валидация данных
      if (sidebar_pinned !== undefined && typeof sidebar_pinned !== 'boolean') {
        return {
          success: false,
          error: 'Invalid sidebar_pinned value',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      if (sidebar_width !== undefined && (typeof sidebar_width !== 'number' || sidebar_width < 150 || sidebar_width > 700)) {
        return {
          success: false,
          error: 'Invalid sidebar_width value',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Готовим объект для обновления
      const updateData: any = {};

      if (sidebar_pinned !== undefined) {
        updateData.sidebar_pinned = sidebar_pinned;
      }

      if (sidebar_width !== undefined) {
        updateData.sidebar_width = sidebar_width;
      }

      const { error } = await this.supabaseService
        .getAdminClient()
        .from('user_settings')
        .update(updateData)
        .eq('user_id', req.user.id);

      if (error) {
        console.error('Update sidebar settings error:', error);
        return {
          success: false,
          error: 'Failed to update sidebar settings',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { 
        success: true, 
        settings: {
          sidebar_pinned,
          sidebar_width
        }
      };
    } catch (error) {
      console.error('Update sidebar settings error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('language')
  @UseGuards(JwtAuthGuard)
  async getLanguage(@Req() req: AuthenticatedRequest) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('user_settings')
        .select('language')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        console.error('Get language error:', error);
        return {
          success: false,
          error: 'Failed to fetch language',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { success: true, language: data?.language || 'en' };
    } catch (error) {
      console.error('Get language server error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('language')
  @UseGuards(JwtAuthGuard)
  async updateLanguage(
    @Body() body: { language: string },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { language } = body;
      if (!language || !['en', 'uk', 'ru'].includes(language)) {
        return {
          success: false,
          error: 'Invalid language',
          status: HttpStatus.BAD_REQUEST,
        };
      }
      
      const { error } = await this.supabaseService
        .getAdminClient()
        .from('user_settings')
        .update({ language })
        .eq('user_id', req.user.id);

      if (error) {
        console.error('Update language error:', error);
        return {
          success: false,
          error: 'Failed to update language',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { success: true, language };
    } catch (error) {
      console.error('Update language server error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { data: userData, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('username, full_name')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        console.error('Get profile error:', error);
        return {
          success: false,
          error: 'Failed to fetch profile',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return {
        success: true,
        profile: {
          username: userData?.username || '',
          full_name: userData?.full_name || '',
        }
      };

    } catch (error) {
      console.error('Get profile server error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Body() body: { username?: string; full_name?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { username, full_name } = body;
      
      // Валидация данных
      if (username !== undefined && (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 50)) {
        return {
          success: false,
          error: 'Username must be between 2 and 50 characters',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      if (full_name !== undefined && (typeof full_name !== 'string' || full_name.trim().length < 1 || full_name.trim().length > 100)) {
        return {
          success: false,
          error: 'Full name must be between 1 and 100 characters',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Проверяем уникальность username, если он изменяется
      if (username !== undefined) {
        const { data: existingUser } = await this.supabaseService
          .getAdminClient()
          .from('users')
          .select('user_id')
          .eq('username', username.trim())
          .neq('user_id', req.user.id)
          .single();

        if (existingUser) {
          return {
            success: false,
            error: 'Username already exists',
            status: HttpStatus.CONFLICT,
          };
        }
      }

      // Готовим объект для обновления
      const updateData: any = {};

      if (username !== undefined) {
        updateData.username = username.trim();
      }

      if (full_name !== undefined) {
        updateData.full_name = full_name.trim();
      }

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .update(updateData)
        .eq('user_id', req.user.id)
        .select('username, full_name')
        .single();

      if (error) {
        console.error('Update profile error:', error);
        return {
          success: false,
          error: 'Failed to update profile',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { 
        success: true, 
        profile: {
          username: data.username,
          full_name: data.full_name,
        },
        message: 'Profile updated successfully'
      };

    } catch (error) {
      console.error('Update profile server error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  @Post('email')
  @UseGuards(JwtAuthGuard)
  async updateEmail(
    @Body() body: { email: string },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      if (!req.user?.id) {
        return {
          success: false,
          error: 'User not authenticated',
          status: HttpStatus.UNAUTHORIZED,
        };
      }

      const { email } = body;
      
      // Валидация email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return {
          success: false,
          error: 'Invalid email format',
          status: HttpStatus.BAD_REQUEST,
        };
      }

      // Проверяем уникальность email
      const { data: existingUser } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('user_id')
        .eq('email', email.toLowerCase())
        .neq('user_id', req.user.id)
        .single();

      if (existingUser) {
        return {
          success: false,
          error: 'Email already exists',
          status: HttpStatus.CONFLICT,
        };
      }

      // Обновляем email в Supabase Auth
      const adminClient = this.supabaseService.getAdminClient();
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        req.user.id,
        { email: email.toLowerCase() }
      );

      if (authError) {
        console.error('Update auth email error:', authError);
        return {
          success: false,
          error: 'Failed to update email',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      // Обновляем email в таблице users
      const { error: dbError } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .update({ email: email.toLowerCase() })
        .eq('user_id', req.user.id);

      if (dbError) {
        console.error('Update database email error:', dbError);
        return {
          success: false,
          error: 'Failed to update email in database',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return { 
        success: true, 
        email: email.toLowerCase(),
        message: 'Email updated successfully'
      };

    } catch (error) {
      console.error('Update email server error:', error);
      return {
        success: false,
        error: 'Server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }
  
}