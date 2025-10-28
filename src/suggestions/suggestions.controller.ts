// src/suggestions/suggestions.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SaveSuggestionsDto } from './dto/create-suggestion.dto';
import { UpdateSuggestionStatusDto } from './dto/update-suggestion-status.dto';
import { GetSuggestionsQueryDto } from './dto/get-suggestions-query.dto';

@Controller('suggestions')
@UseGuards(JwtAuthGuard)
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  /**
   * POST /suggestions - ручне збереження рекомендацій (батчинг)
   */
  @Post()
  async save(@Req() req, @Body() dto: SaveSuggestionsDto) {
    try {
      const userId = req.user.id;
      const { project_id, goals, entity_type = 'goal' } = dto;

      const suggestions = await this.suggestionsService.saveSuggestions(
        userId,
        project_id,
        goals,
        entity_type as any
      );

      return {
        success: true,
        suggestions,
        count: suggestions.length,
      };
    } catch (error) {
      console.error('Save suggestions error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка сохранения рекомендаций',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /suggestions - отримати pending рекомендації
   * Підтримує параметри:
   * - project_id (обов'язковий)
   * - entity_type (опціонально: goal/task/subgoal)
   * - target_count (опціонально: 1-20, для auto-fill)
   * - auto_fill (опціонально: 'true' для автоматичного доповнення)
   */
  @Get()
  async getPending(@Req() req, @Query() query: GetSuggestionsQueryDto) {
    try {
      const userId = req.user.id;
      const {
        project_id,
        entity_type = 'goal',
        target_count = 5,
        auto_fill,
      } = query;

      if (!project_id) {
        throw new HttpException(
          'project_id є обов\'язковим параметром',
          HttpStatus.BAD_REQUEST
        );
      }

      // Якщо auto_fill=true або передано target_count - використовуємо getOrFillPendingSuggestions
      if (auto_fill === 'true' || target_count) {
        const result = await this.suggestionsService.getOrFillPendingSuggestions(
          userId,
          +project_id,
          target_count,
          entity_type as any
        );

        return {
          success: true,
          suggestions: result.suggestions,
          generated_new: result.generated_new,
          total_count: result.total_count,
          source: result.generated_new ? 'ai_and_cache' : 'cache',
        };
      }

      // Інакше просто повертаємо існуючі pending
      const suggestions = await this.suggestionsService.getPendingSuggestions(
        userId,
        +project_id,
        entity_type as any
      );

      return {
        success: true,
        suggestions,
        count: suggestions.length,
        source: 'cache',
      };
    } catch (error) {
      console.error('Get suggestions error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения рекомендаций',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * PATCH /suggestions/:id - оновити статус рекомендації
   */
  @Patch(':id')
  async updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateSuggestionStatusDto
  ) {
    try {
      const userId = req.user.id;
      const { status } = dto;

      const suggestion = await this.suggestionsService.updateStatus(
        userId,
        +id,
        status
      );

      return {
        success: true,
        suggestion,
      };
    } catch (error) {
      console.error('Update suggestion status error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка обновления статуса рекомендации',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * DELETE /suggestions/:id - видалити одну рекомендацію
   */
  @Delete(':id')
  async delete(@Req() req, @Param('id') id: string) {
    try {
      const userId = req.user.id;

      await this.suggestionsService.deleteSuggestion(userId, +id);

      return {
        success: true,
        message: 'Рекомендація видалена',
      };
    } catch (error) {
      console.error('Delete suggestion error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления рекомендации',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * DELETE /suggestions/project/:projectId - видалити всі pending для проекту
   */
  @Delete('project/:projectId')
  async deleteAllForProject(@Req() req, @Param('projectId') projectId: string) {
    try {
      const userId = req.user.id;

      const result = await this.suggestionsService.deleteAllPendingForProject(
        userId,
        +projectId
      );

      return {
        success: true,
        deleted_count: result.deleted_count,
        message: `Видалено ${result.deleted_count} рекомендацій`,
      };
    } catch (error) {
      console.error('Delete all suggestions error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления рекомендаций',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

