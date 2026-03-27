import { Body, Controller, Get, Post, Patch, Delete, Req, Res, UseGuards, HttpStatus, UseInterceptors, UploadedFile, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseService } from '../supabase/supabase.service';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import * as multer from 'multer';
import * as path from 'path';
import * as crypto from 'crypto';
import { UpdateSidebarSettingsDto } from './dto/update-sidebar-settings.dto';
import { RequireOrg } from '../common/decorators/require-org.decorator';

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
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly userService: UserService,
  ) { }

  @Get('me')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getMe(@Req() req) {
    if (!req.dbClient) throw new InternalServerErrorException('DB Client not found');
    // ✅ ПРАВИЛЬНО: Передаем req.dbClient, чтобы сработал RLS
    return this.userService.getMe(req.dbClient, req.user.sub);
  }

  @Patch('me')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateMe(@Req() req, @Body() dto: UpdateUserDto) {
    if (!req.dbClient) throw new InternalServerErrorException('DB Client not found');
    const user = await this.userService.updateMe(req.dbClient, dto);
    return { success: true, user };
  }

  @Post('avatar')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', multerConfig))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req) {
    try {
      if (!file) {
        return { success: false, error: 'Файл не предоставлен', status: HttpStatus.BAD_REQUEST };
      }

      const userId = req.user.sub;
      const client = req.dbClient;

      if (!userId) {
        return { success: false, error: 'Пользователь не авторизован', status: HttpStatus.UNAUTHORIZED };
      }
      if (!client) throw new InternalServerErrorException('DB Client not found');

      const fileExtension = path.extname(file.originalname);
      const fileName = `avatar_${userId}_${crypto.randomUUID()}${fileExtension}`;
      const filePath = `${userId}/${fileName}`;

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
        return { success: false, error: 'Не удалось загрузить файл', details: uploadError.message, status: HttpStatus.INTERNAL_SERVER_ERROR };
      }

      const { data: urlData } = adminClient.storage.from('card-images').getPublicUrl(filePath);
      const avatarUrl = urlData.publicUrl;

      // Получаем текущий аватар для удаления старого файла
      const currentUserRes = await client.query('SELECT avatar_url FROM users WHERE user_id = $1', [userId]);
      const oldAvatarUrl = currentUserRes.rows[0]?.avatar_url;

      // Обновляем URL аватара в базе данных
      try {
        await client.query('UPDATE users SET avatar_url = $1 WHERE user_id = $2', [avatarUrl, userId]);
      } catch (updateError) {
        console.error('Ошибка обновления базы данных:', updateError);
        await adminClient.storage.from('card-images').remove([filePath]);
        return { success: false, error: 'Не удалось обновить профиль пользователя', details: updateError.message, status: HttpStatus.INTERNAL_SERVER_ERROR };
      }

      // Удаляем старый аватар, если он был
      if (oldAvatarUrl) {
        try {
          const oldFilePath = this.extractFilePathFromUrl(oldAvatarUrl);
          if (oldFilePath) {
            await adminClient.storage.from('card-images').remove([oldFilePath]);
          }
        } catch (error) {
          console.error('Ошибка удаления старого аватара:', error);
        }
      }

      return { success: true, avatar_url: avatarUrl, message: 'Аватар успешно загружен' };
    } catch (error) {
      console.error('Ошибка загрузки аватара:', error);
      return { success: false, error: 'Ошибка сервера', details: error.message, status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  // 1. Получение безопасной ссылки для загрузки
  @Post('avatar/presigned-url')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getAvatarUploadUrl(@Req() req, @Body() dto: { fileName: string; contentType: string }) {
    const userId = req.user.sub;
    return this.userService.generateAvatarUploadUrl(userId, dto.fileName);
  }

  // 2. Подтверждение загрузки и запись в БД
  @Post('avatar/confirm')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async confirmAvatarUpload(@Req() req, @Body() dto: { filePath: string }) {
    const client = req.dbClient;
    if (!client) throw new InternalServerErrorException('DB Client not found');
    return this.userService.updateAvatarInDb(client, req.user.sub, dto.filePath);
  }

  @Delete('avatar')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async removeAvatar(@Req() req) {
    try {
      const userId = req.user.sub;
      const client = req.dbClient;

      if (!userId) {
        return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
      }
      if (!client) throw new InternalServerErrorException('DB Client not found');

      const currentUserRes = await client.query('SELECT avatar_url FROM users WHERE user_id = $1', [userId]);
      const oldAvatarUrl = currentUserRes.rows[0]?.avatar_url;

      try {
        await client.query('UPDATE users SET avatar_url = NULL WHERE user_id = $1', [userId]);
      } catch (updateError) {
        console.error('Database update error:', updateError);
        return { success: false, error: 'Failed to update user profile', status: HttpStatus.INTERNAL_SERVER_ERROR };
      }

      if (oldAvatarUrl) {
        try {
          const filePath = this.extractFilePathFromUrl(oldAvatarUrl);
          if (filePath) {
            const adminClient = this.supabaseService.getAdminClient();
            const { error: deleteError } = await adminClient.storage.from('card-images').remove([filePath]);
            if (deleteError) {
              console.error('File deletion error:', deleteError);
            }
          }
        } catch (error) {
          console.error('Error deleting avatar file:', error);
        }
      }

      return { success: true, message: 'Avatar removed successfully' };
    } catch (error) {
      console.error('Avatar removal error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('avatar')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getAvatar(@Req() req) {
    try {
      const userId = req.user.sub;
      const client = req.dbClient;

      if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
      if (!client) throw new InternalServerErrorException('DB Client not found');

      const res = await client.query('SELECT avatar_url FROM users WHERE user_id = $1', [userId]);
      return { success: true, avatar_url: res.rows[0]?.avatar_url || null };
    } catch (error) {
      console.error('Get avatar server error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  private extractFilePathFromUrl(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const publicIndex = urlParts.findIndex(part => part === 'public');
      const bucketIndex = urlParts.findIndex(part => part === 'card-images');

      if (publicIndex !== -1 && bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        return urlParts.slice(bucketIndex + 1).join('/');
      }

      const cardImagesIndex = urlParts.findIndex(part => part === 'card-images');
      if (cardImagesIndex !== -1 && cardImagesIndex < urlParts.length - 1) {
        return urlParts.slice(cardImagesIndex + 1).join('/');
      }
      return null;
    } catch (error) {
      console.error('Error extracting file path from URL:', error);
      return null;
    }
  }

  @Get('theme')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getTheme(@Req() req, @Res({ passthrough: true }) res) {
    try {
      const userId = req.user.sub;
      const client = req.dbClient;

      if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
      if (!client) throw new InternalServerErrorException('DB Client not found');

      const dbRes = await client.query('SELECT theme FROM users WHERE user_id = $1', [userId]);
      const theme = dbRes.rows[0]?.theme || 'light';

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
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post('theme')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateTheme(@Body() body: { theme: string }, @Req() req, @Res({ passthrough: true }) res) {
    try {
      const userId = req.user.sub;
      const client = req.dbClient;

      if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
      if (!client) throw new InternalServerErrorException('DB Client not found');

      const { theme } = body;
      if (!theme || !['light', 'dark'].includes(theme)) {
        return { success: false, error: 'Invalid theme', status: HttpStatus.BAD_REQUEST };
      }

      await client.query('UPDATE users SET theme = $1 WHERE user_id = $2', [theme, userId]);

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
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('sidebar')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getSidebarSettings(@Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    try {
      const res = await client.query(
        'SELECT sidebar_mode, sidebar_width, on_this_page_display_mode FROM user_settings WHERE user_id = $1',
        [userId]
      );
      const settingsData = res.rows[0];

      return {
        success: true,
        sidebar_mode: settingsData?.sidebar_mode || 'expanded',
        sidebar_width: settingsData?.sidebar_width || 234,
        on_this_page_display_mode: settingsData?.on_this_page_display_mode || null
      };
    } catch (error) {
      console.error('Get sidebar settings error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post('sidebar')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateSidebarSettings(@Body() body: UpdateSidebarSettingsDto, @Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    const { sidebar_mode, sidebar_width, on_this_page_display_mode } = body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (sidebar_mode !== undefined) {
        updates.push(`sidebar_mode = $${paramIndex++}`);
        values.push(sidebar_mode);
      }
      if (sidebar_width !== undefined) {
        updates.push(`sidebar_width = $${paramIndex++}`);
        values.push(sidebar_width);
      }
      if (on_this_page_display_mode !== undefined) {
        updates.push(`on_this_page_display_mode = $${paramIndex++}`);
        values.push(on_this_page_display_mode);
      }

      if (updates.length > 0) {
        values.push(userId);
        const queryText = `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`;
        await client.query(queryText, values);
      }

      return {
        success: true,
        settings: { sidebar_mode, sidebar_width, on_this_page_display_mode }
      };
    } catch (error) {
      console.error('Update sidebar settings error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('language')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getLanguage(@Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    try {
      const res = await client.query('SELECT language FROM user_settings WHERE user_id = $1', [userId]);
      return { success: true, language: res.rows[0]?.language || 'en' };
    } catch (error) {
      console.error('Get language server error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post('language')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateLanguage(@Body() body: { language: string }, @Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    const { language } = body;
    if (!language || !['en', 'uk', 'ru'].includes(language)) {
      return { success: false, error: 'Invalid language', status: HttpStatus.BAD_REQUEST };
    }

    try {
      await client.query('UPDATE user_settings SET language = $1 WHERE user_id = $2', [language, userId]);
      return { success: true, language };
    } catch (error) {
      console.error('Update language server error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('profile')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getProfile(@Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    try {
      const userRes = await client.query('SELECT username, full_name, last_active_org_id FROM users WHERE user_id = $1', [userId]);
      const settingsRes = await client.query('SELECT on_this_page_display_mode FROM user_settings WHERE user_id = $1', [userId]);

      const userData = userRes.rows[0];
      const settingsData = settingsRes.rows[0];

      return {
        success: true,
        profile: {
          username: userData?.username || '',
          full_name: userData?.full_name || '',
          active_org_id: userData?.last_active_org_id || null,
          last_active_org_id: userData?.last_active_org_id || null,
          on_this_page_display_mode: settingsData?.on_this_page_display_mode || null,
        }
      };
    } catch (error) {
      console.error('Get profile server error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post('profile')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateProfile(@Body() body: { username?: string; full_name?: string }, @Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    const { username, full_name } = body;

    if (username !== undefined && (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 50)) {
      return { success: false, error: 'Username must be between 2 and 50 characters', status: HttpStatus.BAD_REQUEST };
    }

    if (full_name !== undefined && (typeof full_name !== 'string' || full_name.trim().length < 1 || full_name.trim().length > 100)) {
      return { success: false, error: 'Full name must be between 1 and 100 characters', status: HttpStatus.BAD_REQUEST };
    }

    try {
      if (username !== undefined) {
        const existingRes = await client.query('SELECT user_id FROM users WHERE username = $1 AND user_id != $2', [username.trim(), userId]);
        if (existingRes.rows.length > 0) {
          return { success: false, error: 'Username already exists', status: HttpStatus.CONFLICT };
        }
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (username !== undefined) {
        updates.push(`username = $${paramIndex++}`);
        values.push(username.trim());
      }
      if (full_name !== undefined) {
        updates.push(`full_name = $${paramIndex++}`);
        values.push(full_name.trim());
      }

      if (updates.length > 0) {
        values.push(userId);
        const queryText = `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${paramIndex} RETURNING username, full_name`;
        const updateRes = await client.query(queryText, values);

        return {
          success: true,
          profile: {
            username: updateRes.rows[0]?.username,
            full_name: updateRes.rows[0]?.full_name,
          },
          message: 'Profile updated successfully'
        };
      }

      return { success: true, message: 'No changes provided' };
    } catch (error) {
      console.error('Update profile server error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  /*
  // TODO: Implement using AWS SDK (AdminUpdateUserAttributesCommand) to change email in Cognito
  @Post('email')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateEmail(@Body() body: { email: string }, @Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!userId) return { success: false, error: 'User not authenticated', status: HttpStatus.UNAUTHORIZED };
    if (!client) throw new InternalServerErrorException('DB Client not found');

    const { email } = body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return { success: false, error: 'Invalid email format', status: HttpStatus.BAD_REQUEST };
    }

    try {
      const existingUser = await client.query('SELECT user_id FROM users WHERE email = $1 AND user_id != $2', [email.toLowerCase(), userId]);
      if (existingUser.rows.length > 0) {
        return { success: false, error: 'Email already exists', status: HttpStatus.CONFLICT };
      }

      // 1. Update email via AWS Cognito SDK
      // const command = new AdminUpdateUserAttributesCommand({
      //   UserPoolId: process.env.COGNITO_USER_POOL_ID,
      //   Username: userId, // Assuming sub is the username
      //   UserAttributes: [ { Name: 'email', Value: email.toLowerCase() } ]
      // });
      // await cognitoClient.send(command);

      // 2. Update email in database
      await client.query('UPDATE users SET email = $1 WHERE user_id = $2', [email.toLowerCase(), userId]);

      return { success: true, email: email.toLowerCase(), message: 'Email updated successfully' };
    } catch (error) {
      console.error('Update email server error:', error);
      return { success: false, error: 'Server error', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }
  */

  @Get('me/context')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async getUserContext(@Req() req) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!client) {
      throw new InternalServerErrorException('DB Client not found in request');
    }

    try {
      const res = await client.query(
        'SELECT last_active_org_id, avatar_url, full_name, username FROM users WHERE user_id = $1',
        [userId]
      );

      const userRow = res.rows[0];
      const fullName = userRow?.full_name;
      const username = userRow?.username;

      return {
        active_org_id: userRow?.last_active_org_id || null,
        // Backward/forward compatible alias
        last_active_org_id: userRow?.last_active_org_id || null,
        avatar_url: userRow?.avatar_url || null,
        full_name: fullName || null,
        username: username || null,
        // Normalize display name: prefer full_name, fallback to username
        name: fullName || username || null,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch user context');
    }
  }

  @Patch('me/active-org')
  @RequireOrg(false)
  @UseGuards(CognitoAuthGuard)
  async updateActiveOrg(@Req() req, @Body('org_id') orgId: string) {
    const userId = req.user.sub;
    const client = req.dbClient;

    if (!client) {
      throw new InternalServerErrorException('DB Client not found in request');
    }

    try {
      await client.query(
        'UPDATE users SET last_active_org_id = $1 WHERE user_id = $2',
        [orgId, userId]
      );

      return { success: true };
    } catch (error) {
      throw new InternalServerErrorException('Failed to update active org');
    }
  }
}