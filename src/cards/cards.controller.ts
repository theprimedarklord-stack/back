import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpStatus, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CardsService } from './cards.service';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  async getCards(@Req() req) {
    try {
      const userId = req.user.id;
      const cards = await this.cardsService.getCards(userId);
      return { success: true, cards };
    } catch (error) {
      console.error('Get cards error:', error);
      return { success: false, error: 'Ошибка получения карточек', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post()
  async createCard(@Req() req, @Body() body: any) {
    try {
      const userId = req.user.id;
      const card = await this.cardsService.createCard(userId, body);
      return { success: true, card };
    } catch (error) {
      console.error('Create card error:', error);
      return { success: false, error: 'Ошибка создания карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Patch(':id')
  async updateCard(@Req() req, @Param('id') id: string, @Body() body: any) {
    try {
      const userId = req.user.id;
      const card = await this.cardsService.updateCard(userId, id, body);
      return { success: true, card };
    } catch (error) {
      console.error('Update card error:', error);
      return { success: false, error: 'Ошибка обновления карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Delete(':id')
  async deleteCard(@Req() req, @Param('id') id: string) {
    try {
      const userId = req.user.id;
      await this.cardsService.deleteCard(userId, id);
      return { success: true, message: 'Карточка удалена' };
    } catch (error) {
      console.error('Delete card error:', error);
      return { success: false, error: 'Ошибка удаления карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('card-history')
  async getCardHistory(
    @Req() req,
    @Query('zoneId') zoneId: string,
    @Query('hours') hours: string = '24'
  ) {
    try {
      const userId = req.user.id;
      const hoursNumber = parseInt(hours, 10);
      
      if (!zoneId) {
        return { 
          success: false, 
          error: 'Параметр zoneId є обов\'язковим', 
          status: HttpStatus.BAD_REQUEST 
        };
      }

      if (isNaN(hoursNumber) || hoursNumber <= 0) {
        return { 
          success: false, 
          error: 'Параметр hours має бути позитивним числом', 
          status: HttpStatus.BAD_REQUEST 
        };
      }

      const history = await this.cardsService.getCardHistory(userId, zoneId, hoursNumber);
      return { success: true, history };
    } catch (error) {
      console.error('Get card history error:', error);
      return { 
        success: false, 
        error: 'Помилка отримання історії карток', 
        status: HttpStatus.INTERNAL_SERVER_ERROR 
      };
    }
  }

  @Post('card-reviews')
  async createCardReview(@Req() req, @Body() body: any) {
    try {
      const userId = req.user.id;
      const review = await this.cardsService.createCardReview(userId, body);
      return { success: true, review };
    } catch (error) {
      console.error('Create card review error:', error);
      return { 
        success: false, 
        error: 'Помилка створення review карточки', 
        status: HttpStatus.INTERNAL_SERVER_ERROR 
      };
    }
  }

  @Get(':id')
  async getCardById(@Req() req, @Param('id') id: string) {
    try {
      const card = await this.cardsService.getCardById(id);
      return { success: true, card };
    } catch (error) {
      console.error('Get card by id error:', error);
      return { 
        success: false, 
        error: 'Помилка отримання картки', 
        status: HttpStatus.INTERNAL_SERVER_ERROR 
      };
    }
  }
}
