import { Controller, Get, Post, Param, Body, UseGuards, Req, Delete, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MapCardHistoryService } from './map-card-history.service';
import { RecordOperationDto } from './dto/map-card-history.dto';

@Controller('map-card-history')
@UseGuards(JwtAuthGuard)
export class MapCardHistoryController {
  constructor(
    private readonly historyService: MapCardHistoryService,
  ) {}

  /**
   * Записать операцию в историю
   * POST /map-card-history/:mapCardId/record
   */
  @Post(':mapCardId/record')
  async recordOperation(
    @Param('mapCardId') mapCardId: string,
    @Body() body: RecordOperationDto,
    @Req() req: any,
  ) {
    try {
      await this.historyService.recordOperation(
        +mapCardId,
        req.user.id,
        body.operationType,
        body.operationData,
        body.previousState,
      );
      return { success: true };
    } catch (error) {
      console.error('Record operation error:', error);
      return {
        success: false,
        error: error.message || 'Ошибка записи операции',
        status: HttpStatus.BAD_REQUEST
      };
    }
  }

  /**
   * Получить историю операций
   * GET /map-card-history/:mapCardId
   */
  @Get(':mapCardId')
  async getHistory(
    @Param('mapCardId') mapCardId: string,
    @Req() req: any,
  ) {
    try {
      const history = await this.historyService.getHistory(+mapCardId, req.user.id);
      return { success: true, history };
    } catch (error) {
      console.error('Get history error:', error);
      return {
        success: false,
        error: error.message || 'Ошибка получения истории',
        status: HttpStatus.BAD_REQUEST
      };
    }
  }

  /**
   * Отменить последнюю операцию
   * POST /map-card-history/:mapCardId/undo
   */
  @Post(':mapCardId/undo')
  async undo(
    @Param('mapCardId') mapCardId: string,
    @Req() req: any,
  ) {
    try {
      return await this.historyService.undo(+mapCardId, req.user.id);
    } catch (error) {
      console.error('Undo operation error:', error);
      return {
        success: false,
        error: error.message || 'Ошибка отмены операции',
        status: HttpStatus.BAD_REQUEST
      };
    }
  }

  /**
   * Очистить историю
   * DELETE /map-card-history/:mapCardId
   */
  @Delete(':mapCardId')
  async clearHistory(
    @Param('mapCardId') mapCardId: string,
    @Req() req: any,
  ) {
    try {
      await this.historyService.clearHistory(+mapCardId, req.user.id);
      return { success: true };
    } catch (error) {
      console.error('Clear history error:', error);
      return {
        success: false,
        error: error.message || 'Ошибка очистки истории',
        status: HttpStatus.BAD_REQUEST
      };
    }
  }
}
