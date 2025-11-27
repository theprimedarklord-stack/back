// src/ai/ai.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AIService } from './ai.service';
import { UpdateAISettingsDto } from './dto/ai-settings.dto';
import { UpdateAIChatSettingsDto } from './dto/ai-chat-settings.dto';
import { UpdateAIOutlineSettingsDto } from './dto/ai-outline-settings.dto';
import { GenerateRecommendationsDto } from './dto/generate-recommendations.dto';
import { ChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Get('settings')
  async getSettings(@Req() req) {
    try {
      const userId = req.user.id;
      const settings = await this.aiService.getSettings(userId);
      return { success: true, settings };
    } catch (error) {
      console.error('Get AI settings error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения настроек AI',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('settings')
  async updateSettings(@Req() req, @Body() dto: UpdateAISettingsDto) {
    try {
      const userId = req.user.id;
      const settings = await this.aiService.updateSettings(userId, dto);
      return { success: true, settings };
    } catch (error) {
      console.error('Update AI settings error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка сохранения настроек AI',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('chat-settings')
  async getChatSettings(@Req() req) {
    try {
      const userId = req.user.id;
      const settings = await this.aiService.getChatSettings(userId);
      return { success: true, settings };
    } catch (error) {
      console.error('Get chat settings error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения chat settings',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('chat-settings')
  async updateChatSettings(@Req() req, @Body() dto: UpdateAIChatSettingsDto) {
    try {
      const userId = req.user.id;
      const settings = await this.aiService.updateChatSettings(userId, dto);
      return { success: true, settings };
    } catch (error) {
      console.error('Update chat settings error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка сохранения chat settings',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('chat')
  async sendChatMessage(@Req() req, @Body() dto: ChatDto) {
    try {
      const userId = req.user.id;
      const result = await this.aiService.sendChatMessage(
        userId,
        dto.message,
        dto.history,
        {
          provider: dto.provider,
          model: dto.model,
          temperature: dto.temperature,
          max_tokens: dto.max_tokens,
        }
      );
      return {
        success: true,
        message: result.text,
        tokensUsed: result.tokensUsed,
        modelUsed: result.modelUsed,
      };
    } catch (error) {
      console.error('Send chat message error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка отправки сообщения в чат',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('outline-settings')
  async getOutlineSettings(@Req() req) {
    try {
      const userId = req.user.id;
      const settings = await this.aiService.getOutlineSettings(userId);
      return { success: true, settings };
    } catch (error) {
      console.error('Get outline settings error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения outline settings',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('outline-settings')
  async updateOutlineSettings(@Req() req, @Body() dto: UpdateAIOutlineSettingsDto) {
    try {
      const userId = req.user.id;
      const settings = await this.aiService.updateOutlineSettings(userId, dto);
      return { success: true, settings };
    } catch (error) {
      console.error('Update outline settings error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка сохранения outline settings',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('generate-recommendations')
  async generateRecommendations(@Req() req, @Body() dto: GenerateRecommendationsDto) {
    try {
      const userId = req.user.id;
      const result = await this.aiService.generateRecommendations(userId, dto);
      return result;
    } catch (error) {
      console.error('Generate recommendations error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка генерации рекомендаций',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('recommendations/cache/:goalId')
  async getCachedRecommendations(@Req() req, @Param('goalId') goalId: string) {
    try {
      const userId = req.user.id;
      const goalIdNum = parseInt(goalId, 10);
      
      if (isNaN(goalIdNum)) {
        throw new HttpException(
          'Некорректный ID цели',
          HttpStatus.BAD_REQUEST
        );
      }

      const cached = await this.aiService.getCachedRecommendations(userId, goalIdNum);
      
      return { 
        success: true, 
        recommendations: cached?.recommendations || null,
        cached: !!cached,
        modelUsed: cached?.model_used,
        expiresAt: cached?.expires_at
      };
    } catch (error) {
      console.error('Get cached recommendations error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения кешированных рекомендаций',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('recommendations/cache')
  async clearAllCache(@Req() req) {
    try {
      const userId = req.user.id;
      await this.aiService.clearCache(userId);
      return { success: true, message: 'Кеш очищен' };
    } catch (error) {
      console.error('Clear all cache error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка очистки кеша',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('recommendations/cache/:goalId')
  async clearGoalCache(@Req() req, @Param('goalId') goalId: string) {
    try {
      const userId = req.user.id;
      const goalIdNum = parseInt(goalId, 10);
      
      if (isNaN(goalIdNum)) {
        throw new HttpException(
          'Некорректный ID цели',
          HttpStatus.BAD_REQUEST
        );
      }

      await this.aiService.clearCache(userId, goalIdNum);
      return { success: true, message: 'Кеш цели очищен' };
    } catch (error) {
      console.error('Clear goal cache error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка очистки кеша цели',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
