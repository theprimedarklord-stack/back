import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class HistoryCleanupService {
  private readonly logger = new Logger(HistoryCleanupService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Очистка старых записей истории (старше 30 дней, но минимум 10 операций на карту)
   * Этот метод можно вызывать периодически (например, через cron job или вручную)
   */
  async cleanupOldHistories(): Promise<void> {
    this.logger.log('Starting scheduled history cleanup...');

    try {
      // Получить все карты с историей
      const { data: mapCards, error: cardsError } = await this.supabaseService
        .getClient()
        .from('map_cards')
        .select('id');

      if (cardsError) {
        this.logger.error('Failed to get map cards for cleanup:', cardsError);
        return;
      }

      let totalDeleted = 0;

      // Для каждой карты выполнить очистку
      for (const card of mapCards || []) {
        const deletedCount = await this.cleanupHistoryForMapCard(card.id);
        totalDeleted += deletedCount;
      }

      this.logger.log(`Cleaned up ${totalDeleted} old history records`);
    } catch (error) {
      this.logger.error('Failed to cleanup old histories:', error);
    }
  }

  /**
   * Очистить историю для конкретной карты (старше 30 дней, минимум 10 операций)
   */
  private async cleanupHistoryForMapCard(mapCardId: number): Promise<number> {
    try {
      // Получить все записи истории для карты, отсортированные по версии (новые сначала)
      const { data: historyRecords, error: selectError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .select('id, version, created_at')
        .eq('map_card_id', mapCardId)
        .order('version', { ascending: false });

      if (selectError) {
        this.logger.warn(`Failed to get history for map card ${mapCardId}:`, selectError);
        return 0;
      }

      if (!historyRecords || historyRecords.length <= 10) {
        return 0; // Оставляем минимум 10 записей
      }

      // Найти записи старше 30 дней, исключая последние 10
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recordsToDelete = historyRecords
        .slice(10) // Пропустить последние 10
        .filter(record => new Date(record.created_at) < thirtyDaysAgo)
        .map(record => record.id);

      if (recordsToDelete.length > 0) {
        const { error: deleteError } = await this.supabaseService
          .getClient()
          .from('map_card_history')
          .delete()
          .in('id', recordsToDelete);

        if (deleteError) {
          this.logger.warn(`Failed to delete old records for map card ${mapCardId}:`, deleteError);
          return 0;
        }

        this.logger.log(`Deleted ${recordsToDelete.length} old records for map card ${mapCardId}`);
        return recordsToDelete.length;
      }

      return 0;
    } catch (error) {
      this.logger.error(`Failed to cleanup history for map card ${mapCardId}:`, error);
      return 0;
    }
  }

  /**
   * Принудительная очистка для конкретной карты (оставить только последние 50 версий)
   */
  async forceCleanupForMapCard(mapCardId: number): Promise<void> {
    try {
      // Получить все версии для карты, отсортированные по убыванию
      const { data: allVersions, error: selectError } = await this.supabaseService
        .getClient()
        .from('map_card_history')
        .select('version')
        .eq('map_card_id', mapCardId)
        .order('version', { ascending: false });

      if (selectError) {
        this.logger.warn(`Failed to get versions for force cleanup of map card ${mapCardId}:`, selectError);
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
          this.logger.warn(`Failed to force cleanup for map card ${mapCardId}:`, deleteError);
        } else {
          this.logger.log(`Force cleaned up ${versionsToDelete.length} records for map card ${mapCardId}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to force cleanup for map card ${mapCardId}:`, error);
    }
  }

  /**
   * Ручной запуск полной очистки всех карт
   */
  async manualFullCleanup(): Promise<{ success: boolean; deletedCount: number }> {
    try {
      await this.cleanupOldHistories();
      return { success: true, deletedCount: 0 }; // deletedCount можно улучшить для возврата реального числа
    } catch (error) {
      this.logger.error('Manual full cleanup failed:', error);
      return { success: false, deletedCount: 0 };
    }
  }
}
