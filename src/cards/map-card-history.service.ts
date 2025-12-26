import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { MapCardHistory, CreateMapCardHistoryData } from './map-card-history.entity';
import { RecordOperationDto, HistoryEntryDto } from './dto/map-card-history.dto';

@Injectable()
export class MapCardHistoryService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Записать операцию в историю
   */
  async recordOperation(
    mapCardId: number,
    userId: string,
    operationType: string,
    operationData: any,
    previousState?: any,
  ): Promise<void> {
    try {
      // Проверить существование карты
      const { data: mapCard, error: mapCardError } = await this.supabaseService
        .getClient()
        .from('map_cards')
        .select('*')
        .eq('id', mapCardId)
        .single();

      if (mapCardError || !mapCard) {
        throw new BadRequestException('Map card not found');
      }

      // Проверить права доступа
      if (mapCard.user_id !== userId) {
        throw new BadRequestException('Access denied');
      }

      // Получить следующую версию
      const nextVersion = await this.getNextVersion(mapCardId);

      // Создать запись истории
      const historyEntry: CreateMapCardHistoryData = {
        map_card_id: mapCardId,
        user_id: userId,
        version: nextVersion,
        operation_type: operationType,
        operation_data: operationData,
      };

      const { error: insertError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .insert(historyEntry);

      if (insertError) {
        throw new InternalServerErrorException(insertError.message);
      }

      // Очистить старые записи асинхронно (не блокирует основную операцию)
      setImmediate(() => {
        this.cleanupOldHistory(mapCardId).catch(error => {
          console.warn('[MapCardHistoryService] Cleanup failed:', error);
        });
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to record operation: ${error.message}`);
    }
  }

  /**
   * Получить следующую версию для карты
   */
  private async getNextVersion(mapCardId: number): Promise<number> {
    try {
      const { data: maxVersionData, error } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .select('version')
        .eq('map_card_id', mapCardId)
        .order('version', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('[MapCardHistoryService] Failed to get max version:', error);
        return 1;
      }

      return (maxVersionData?.[0]?.version || 0) + 1;
    } catch (error) {
      console.warn('[MapCardHistoryService] Failed to get next version:', error);
      return 1;
    }
  }

  /**
   * Очистить старые записи истории (оставить последние 50)
   */
  private async cleanupOldHistory(mapCardId: number): Promise<void> {
    try {
      // Получить все версии для карты, отсортированные по убыванию
      const { data: allVersions, error: selectError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .select('version')
        .eq('map_card_id', mapCardId)
        .order('version', { ascending: false });

      if (selectError) {
        console.warn('[MapCardHistoryService] Failed to get versions for cleanup:', selectError);
        return;
      }

      if (!allVersions || allVersions.length <= 50) {
        return; // Нечего очищать
      }

      // Получить версии для удаления (все кроме первых 50)
      const versionsToDelete = allVersions.slice(50).map(v => v.version);

      if (versionsToDelete.length > 0) {
        const { error: deleteError } = await this.supabaseService
          .getClient()
          .from('map_card_history')
          .delete()
          .eq('map_card_id', mapCardId)
          .in('version', versionsToDelete);

        if (deleteError) {
          console.warn('[MapCardHistoryService] Failed to delete old records:', deleteError);
        } else {
          console.log(`[MapCardHistory] Cleaned up ${versionsToDelete.length} old records for map card ${mapCardId}`);
        }
      }
    } catch (error) {
      console.error('[MapCardHistoryService] Failed to cleanup history:', error);
      // Не бросаем ошибку, чтобы не прерывать основную логику
    }
  }

  /**
   * Получить историю операций для карты
   */
  async getHistory(mapCardId: number, userId: string): Promise<HistoryEntryDto[]> {
    try {
      // Проверить существование и права доступа
      const { data: mapCard, error: mapCardError } = await this.supabaseService
        .getClient()
        .from('map_cards')
        .select('*')
        .eq('id', mapCardId)
        .single();

      if (mapCardError || !mapCard || mapCard.user_id !== userId) {
        throw new BadRequestException('Access denied');
      }

      // Получить последние 50 операций
      const { data: history, error: historyError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .select('*')
        .eq('map_card_id', mapCardId)
        .order('version', { ascending: false })
        .limit(50);

      if (historyError) {
        throw new InternalServerErrorException(historyError.message);
      }

      return history.map(entry => ({
        id: entry.id,
        version: entry.version,
        operationType: entry.operation_type,
        operationData: entry.operation_data,
        createdAt: new Date(entry.created_at),
      }));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to get history: ${error.message}`);
    }
  }

  /**
   * Отменить последнюю операцию
   */
  async undo(mapCardId: number, userId: string): Promise<{ success: boolean; operation?: any }> {
    try {
      // Проверить существование и права доступа
      const { data: mapCard, error: mapCardError } = await this.supabaseService
        .getClient()
        .from('map_cards')
        .select('*')
        .eq('id', mapCardId)
        .single();

      if (mapCardError || !mapCard || mapCard.user_id !== userId) {
        throw new BadRequestException('Access denied');
      }

      // Найти последнюю операцию
      const { data: lastOperation, error: lastOpError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .select('*')
        .eq('map_card_id', mapCardId)
        .order('version', { ascending: false })
        .limit(1);

      if (lastOpError) {
        throw new InternalServerErrorException(lastOpError.message);
      }

      if (!lastOperation || lastOperation.length === 0) {
        throw new BadRequestException('No operations to undo');
      }

      const operation = lastOperation[0];

      // Удалить запись из истории
      const { error: deleteError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .delete()
        .eq('id', operation.id);

      if (deleteError) {
        throw new InternalServerErrorException(deleteError.message);
      }

      return {
        success: true,
        operation: {
          type: operation.operation_type,
          data: operation.operation_data,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to undo operation: ${error.message}`);
    }
  }

  /**
   * Повторить отмененную операцию (в будущем)
   */
  async redo(mapCardId: number, userId: string): Promise<{ success: boolean }> {
    // Для redo нужна более сложная логика с хранением отмененных операций
    // Пока возвращаем заглушку
    throw new BadRequestException('Redo not implemented yet');
  }

  /**
   * Очистить историю для карты
   */
  async clearHistory(mapCardId: number, userId: string): Promise<void> {
    try {
      // Проверить существование и права доступа
      const { data: mapCard, error: mapCardError } = await this.supabaseService
        .getClient()
        .from('map_cards')
        .select('*')
        .eq('id', mapCardId)
        .single();

      if (mapCardError || !mapCard || mapCard.user_id !== userId) {
        throw new BadRequestException('Access denied');
      }

      const { error: deleteError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .delete()
        .eq('map_card_id', mapCardId);

      if (deleteError) {
        throw new InternalServerErrorException(deleteError.message);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to clear history: ${error.message}`);
    }
  }
}
