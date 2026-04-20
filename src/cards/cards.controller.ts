import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpStatus, Query, Logger, Headers } from '@nestjs/common';
import { Request } from 'express';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CardsService } from './cards.service';

@Controller('cards')
@UseGuards(CognitoAuthGuard)
export class CardsController {
  private readonly logger = new Logger(CardsController.name);

  constructor(private readonly cardsService: CardsService) { }

  @Get()
  async getCards(
    @Req() req: Request,
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
      const cards = await this.cardsService.getCards(userId, orgId);
      return { success: true, cards };
    } catch (error) {
      this.logger.error('Помилка отримання карточек:', error);
      return { success: false, error: 'Помилка отримання карточек', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Post()
  async createCard(
    @Req() req: Request,
    @Body() body: any,
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
      const card = await this.cardsService.createCard(userId, orgId, body);
      return { success: true, card };
    } catch (error) {
      this.logger.error('Помилка створення карточки:', error);
      return { success: false, error: 'Помилка створення карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Patch(':id')
  async updateCard(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
      const card = await this.cardsService.updateCard(userId, orgId, id, body);
      return { success: true, card };
    } catch (error) {
      this.logger.error('Помилка оновлення карточки:', error);
      return { success: false, error: 'Помилка оновлення карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Delete(':id')
  async deleteCard(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
      await this.cardsService.deleteCard(userId, orgId, id);
      return { success: true, message: 'Карточка видалена' };
    } catch (error) {
      this.logger.error('Помилка видалення карточки:', error);
      return { success: false, error: 'Помилка видалення карточки', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  @Get('history')
  async getCardHistory(
    @Req() req: Request,
    @Query('zoneId') zoneId: string,
    @Query('hours') hours: string = '24',
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
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

      const history = await this.cardsService.getCardHistory(userId, orgId, zoneId, hoursNumber);
      return { success: true, history };
    } catch (error) {
      this.logger.error('Помилка отримання історії карточки:', error);
      return {
        success: false,
        error: 'Помилка отримання історії карточки',
        status: HttpStatus.INTERNAL_SERVER_ERROR
      };
    }
  }

  @Post('reviews')
  async createCardReview(
    @Req() req: Request,
    @Body() body: any,
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
      const review = await this.cardsService.createCardReview(userId, orgId, body);
      return { success: true, review };
    } catch (error) {
      this.logger.error('Помилка створення review карточки:', error);
      return {
        success: false,
        error: 'Помилка створення review карточки',
        status: HttpStatus.INTERNAL_SERVER_ERROR
      };
    }
  }

  @Get(':id')
  async getCardById(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-org-id') orgId: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return { success: false, error: 'userId is required', status: HttpStatus.UNAUTHORIZED };
      }
      const card = await this.cardsService.getCardById(id, userId, orgId);
      return { success: true, card };
    } catch (error) {
      this.logger.error('Помилка отримання картки:', error);
      return {
        success: false,
        error: 'Помилка отримання картки',
        status: HttpStatus.INTERNAL_SERVER_ERROR
      };
    }
  }
}
