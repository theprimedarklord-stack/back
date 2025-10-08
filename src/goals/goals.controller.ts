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
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { UpdateSubgoalDto } from './dto/update-subgoal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  async create(@Body() createGoalDto: CreateGoalDto, @Req() req) {
    try {
      const userId = req.user.id;

      // Валидация deadline
      if (createGoalDto.deadline && new Date(createGoalDto.deadline) < new Date()) {
        throw new HttpException(
          'Deadline не может быть в прошлом',
          HttpStatus.BAD_REQUEST
        );
      }

      const goal = await this.goalsService.create(createGoalDto, userId);
      return { success: true, goal };
    } catch (error) {
      console.error('Create goal error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка создания цели',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  async findAll(@Req() req) {
    try {
      const userId = req.user.id;
      const goals = await this.goalsService.findAll(userId);
      return { success: true, goals };
    } catch (error) {
      console.error('Get goals error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения целей',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      const goal = await this.goalsService.findOne(id, userId);
      return { success: true, goal };
    } catch (error) {
      console.error('Get goal error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения цели',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateGoalDto: UpdateGoalDto, @Req() req) {
    try {
      const userId = req.user.id;

      // Валидация deadline
      if (updateGoalDto.deadline && new Date(updateGoalDto.deadline) < new Date()) {
        throw new HttpException(
          'Deadline не может быть в прошлом',
          HttpStatus.BAD_REQUEST
        );
      }

      const goal = await this.goalsService.update(id, updateGoalDto, userId);
      return { success: true, goal };
    } catch (error) {
      console.error('Update goal error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка обновления цели',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      await this.goalsService.remove(id, userId);
      return { success: true, message: 'Цель удалена' };
    } catch (error) {
      console.error('Delete goal error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления цели',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Patch(':goalId/subgoals/:subgoalId')
  async toggleSubgoal(
    @Param('goalId') goalId: string,
    @Param('subgoalId') subgoalId: string,
    @Req() req
  ) {
    try {
      const userId = req.user.id;
      await this.goalsService.toggleSubgoal(goalId, subgoalId, userId);
      return { success: true, message: 'Статус подцели обновлён' };
    } catch (error) {
      console.error('Toggle subgoal error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка обновления подцели',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('categories/list')
  async getCategories() {
    try {
      const categories = GoalsService.getAllCategories();
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
      const priorities = GoalsService.getAllPriorities();
      return { success: true, priorities };
    } catch (error) {
      console.error('Get priorities error:', error);
      throw new HttpException(
        'Ошибка получения приоритетов',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

