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
  HttpException 
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(@Body() createTaskDto: CreateTaskDto, @Req() req) {
    try {
      const userId = req.user.id;
      const task = await this.tasksService.create(createTaskDto, userId);
      return { success: true, task };
    } catch (error) {
      console.error('Create task error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка создания задачи', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  async findAll(@Req() req) {
    try {
      const userId = req.user.id;
      const tasks = await this.tasksService.findAll(userId);
      return { success: true, tasks };
    } catch (error) {
      console.error('Get tasks error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения задач', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      const task = await this.tasksService.findOne(id, userId);
      return { success: true, task };
    } catch (error) {
      console.error('Get task error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения задачи', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Req() req) {
    try {
      const userId = req.user.id;
      const task = await this.tasksService.update(id, updateTaskDto, userId);
      return { success: true, task };
    } catch (error) {
      console.error('Update task error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка обновления задачи', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    try {
      const userId = req.user.id;
      await this.tasksService.remove(id, userId);
      return { success: true, message: 'Задача удалена' };
    } catch (error) {
      console.error('Delete task error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления задачи', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('statuses/list')
  async getStatuses() {
    try {
      const statuses = TasksService.getAllStatuses();
      return { success: true, statuses };
    } catch (error) {
      console.error('Get statuses error:', error);
      throw new HttpException(
        'Ошибка получения статусов', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
