import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddGeneratedStructureDto } from './dto/add-generated-structure.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AIService } from '../ai/ai.service';
import { SuggestionsService } from '../suggestions/suggestions.service';
import { GenerateGoalsForProjectDto } from '../ai/dto/generate-goals.dto';
import { GenerateFullStructureDto } from '../ai/dto/generate-full-structure.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly aiService: AIService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  @Post()
  async create(@Body() createProjectDto: CreateProjectDto, @Req() req) {
    try {
      const userId = req.user.id;

      // Валидация deadline
      if (createProjectDto.deadline && new Date(createProjectDto.deadline) < new Date()) {
        throw new HttpException(
          'Deadline не может быть в прошлом',
          HttpStatus.BAD_REQUEST
        );
      }

      const project = await this.projectsService.create(createProjectDto, userId);
      return { success: true, project };
    } catch (error) {
      console.error('Create project error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка создания проекта',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  async findAll(@Req() req) {
    try {
      const userId = req.user.id;
      const projects = await this.projectsService.findAll(userId);
      return { success: true, projects };
    } catch (error) {
      console.error('Get projects error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения проектов',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      const project = await this.projectsService.findOne(id, userId);
      return { success: true, project };
    } catch (error) {
      console.error('Get project error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения проекта',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto, @Req() req) {
    try {
      const userId = req.user.id;

      // Валидация deadline
      if (updateProjectDto.deadline && new Date(updateProjectDto.deadline) < new Date()) {
        throw new HttpException(
          'Deadline не может быть в прошлом',
          HttpStatus.BAD_REQUEST
        );
      }

      const project = await this.projectsService.update(id, updateProjectDto, userId);
      return { success: true, project };
    } catch (error) {
      console.error('Update project error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка обновления проекта',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      await this.projectsService.remove(id, userId);
      return { success: true, message: 'Проект удален' };
    } catch (error) {
      console.error('Delete project error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления проекта',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id/goals')
  async getProjectGoals(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      const goals = await this.projectsService.getProjectGoals(id, userId);
      return { success: true, goals };
    } catch (error) {
      console.error('Get project goals error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения целей проекта',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('categories/list')
  async getCategories() {
    try {
      const categories = ProjectsService.getAllCategories();
      return { success: true, categories };
    } catch (error) {
      console.error('Get categories error:', error);
      throw new HttpException(
        'Ошибка получения категорий',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('priorities/list')
  async getPriorities() {
    try {
      const priorities = ProjectsService.getAllPriorities();
      return { success: true, priorities };
    } catch (error) {
      console.error('Get priorities error:', error);
      throw new HttpException(
        'Ошибка получения приоритетов',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('statuses/list')
  async getStatuses() {
    try {
      const statuses = ProjectsService.getAllStatuses();
      return { success: true, statuses };
    } catch (error) {
      console.error('Get statuses error:', error);
      throw new HttpException(
        'Ошибка получения статусов',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post(':id/generate-goals')
  async generateGoals(
    @Param('id') projectId: string,
    @Body() dto: GenerateGoalsForProjectDto,
    @Req() req
  ) {
    try {
      const userId = req.user.id;
      const targetCount = dto.count || 5;

      // НОВА ЛОГІКА: Використовуємо getOrFillPendingSuggestions
      // Цей метод автоматично:
      // 1. Перевіряє чи є pending рекомендації
      // 2. Якщо не вистачає до targetCount - генерує додаткові через AI
      // 3. Фільтрує дублікати
      // 4. Повертає потрібну кількість рекомендацій
      
      const result = await this.suggestionsService.getOrFillPendingSuggestions(
        userId,
        Number(projectId),
        targetCount,
        'goal'
      );

      // Форматуємо відповідь як goals (для сумісності з фронтендом)
      const goals = result.suggestions.map(s => ({
        ...s.payload,
        suggestionId: s.id, // Додаємо ID для подальшої роботи (accept/reject)
        _suggestion: true, // Флаг що це suggestion
      }));

      return {
        success: true,
        goals,
        cached: !result.generated_new,
        generated_new: result.generated_new,
        total_count: result.total_count,
        source: result.generated_new ? 'suggestions_and_ai' : 'suggestions',
      };
    } catch (error) {
      console.error('Generate goals error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка генерации целей',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post(':id/generate-full-structure')
  async generateFullStructure(
    @Param('id') projectId: string,
    @Body() dto: GenerateFullStructureDto,
    @Req() req
  ) {
    try {
      const userId = req.user.id;
      const result = await this.aiService.generateFullStructure(
        userId,
        Number(projectId),
        dto.settings
      );
      return result;
    } catch (error) {
      console.error('Generate full structure error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка генерации структуры',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post(':id/add-generated-structure')
  async addGeneratedStructure(
    @Param('id') projectId: string,
    @Body() dto: AddGeneratedStructureDto,
    @Req() req
  ) {
    try {
      const userId = req.user.id;
      const result = await this.projectsService.addGeneratedStructure(
        userId,
        Number(projectId),
        dto.structure
      );
      return { success: true, ...result };
    } catch (error) {
      console.error('Add generated structure error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка сохранения структуры',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * DELETE /projects/:id/suggestions - видалити всі pending рекомендації для проекту
   * Використовується для перегенерації (очистити старі, потім згенерувати нові)
   */
  @Delete(':id/suggestions')
  async deleteProjectSuggestions(@Param('id') projectId: string, @Req() req) {
    try {
      const userId = req.user.id;
      const result = await this.suggestionsService.deleteAllPendingForProject(
        userId,
        Number(projectId),
        'goal'
      );
      return {
        success: true,
        deleted_count: result.deleted_count,
        message: `Видалено ${result.deleted_count} рекомендацій`,
      };
    } catch (error) {
      console.error('Delete project suggestions error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления рекомендаций проекта',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

