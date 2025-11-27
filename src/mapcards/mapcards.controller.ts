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
  ParseIntPipe,
} from '@nestjs/common';
import { MapcardsService } from './mapcards.service';
import { CreateMapCardDto } from './dto/create-mapcard.dto';
import { UpdateMapCardDto } from './dto/update-mapcard.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('mapcards')
@UseGuards(JwtAuthGuard)
export class MapcardsController {
  constructor(private readonly mapcardsService: MapcardsService) {}

  @Post()
  async create(@Body() createMapCardDto: CreateMapCardDto, @Req() req) {
    try {
      const userId = req.user.id;
      const mapCard = await this.mapcardsService.create(userId, createMapCardDto);
      return { success: true, mapCard };
    } catch (error) {
      console.error('Create map card error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка создания карты знаний',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  async findAll(@Req() req) {
    try {
      const userId = req.user.id;
      const mapCards = await this.mapcardsService.findAll(userId);
      return { success: true, mapCards };
    } catch (error) {
      console.error('Get map cards error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения карт знаний',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    try {
      const userId = req.user.id;
      const mapCard = await this.mapcardsService.findOne(userId, id);
      return { success: true, mapCard };
    } catch (error) {
      console.error('Get map card error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка получения карты знаний',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMapCardDto: UpdateMapCardDto,
    @Req() req
  ) {
    try {
      const userId = req.user.id;
      const mapCard = await this.mapcardsService.update(userId, id, updateMapCardDto);
      return { success: true, mapCard };
    } catch (error) {
      console.error('Update map card error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка обновления карты знаний',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    try {
      const userId = req.user.id;
      await this.mapcardsService.remove(userId, id);
      return { success: true, message: 'Карта знаний удалена' };
    } catch (error) {
      console.error('Delete map card error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Ошибка удаления карты знаний',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

