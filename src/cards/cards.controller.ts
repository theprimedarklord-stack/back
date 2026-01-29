import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpStatus, Query, Logger } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CardsService } from './cards.service';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  private readonly logger = new Logger(CardsController.name);

  constructor(private readonly cardsService: CardsService) {}

  /**
   * Extract dbClient from request (set by RlsContextInterceptor)
   */
  private getDbClient(req: Request): any {
    return (req as any).dbClient;
  }

  @Get()
  async getCards(@Req() req: Request) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const client = this.getDbClient(req);
      const cards = await this.cardsService.getCards(userId, client);
      return { success: true, cards };
    } catch (error) {
      this.logger.error('Get cards error:', error);
      return { success: false, error: 'Ошибка получения карточек', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post()
  async createCard(@Req() req: Request, @Body() body: any) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const client = this.getDbClient(req);
      const card = await this.cardsService.createCard(userId, body, client);
      return { success: true, card };
    } catch (error) {
      this.logger.error('Create card error:', error);
      return { success: false, error: 'Ошибка создания карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Patch(':id')
  async updateCard(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const client = this.getDbClient(req);
      const card = await this.cardsService.updateCard(userId, id, body, client);
      return { success: true, card };
    } catch (error) {
      this.logger.error('Update card error:', error);
      return { success: false, error: 'Ошибка обновления карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Delete(':id')
  async deleteCard(@Req() req: Request, @Param('id') id: string) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const client = this.getDbClient(req);
      await this.cardsService.deleteCard(userId, id, client);
      return { success: true, message: 'Карточка удалена' };
    } catch (error) {
      this.logger.error('Delete card error:', error);
      return { success: false, error: 'Ошибка удаления карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('card-history')
  async getCardHistory(
    @Req() req: Request,
    @Query('zoneId') zoneId: string,
    @Query('hours') hours: string = '24'
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const client = this.getDbClient(req);
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

      const history = await this.cardsService.getCardHistory(userId, zoneId, hoursNumber, client);
  @Post('card-reviews')
  async createCardReview(@Req() req: Request, @Body() body: any) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const client = this.getDbClient(req);
      const review = await this.cardsService.createCardReview(userId, body, client);
      return { success: true, review };
    } catch (error) {
      this.logger.error('Create card review error:', error);
      return { 
        success: false, 
        error: 'Помилка створення review карточки', 
        status: HttpStatus.INTERNAL_SERVER_ERROR 
      };
    }
  }
}  @Get(':id')
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
