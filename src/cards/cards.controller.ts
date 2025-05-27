import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpStatus } from '@nestjs/common';
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
}
