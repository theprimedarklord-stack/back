import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { DatabaseService } from '../../db/database.service';

/**
 * DatabaseHealthIndicator
 *
 * Кастомный индикатор для проверки коннекта к PostgreSQL (Supabase).
 * Используется ТОЛЬКО в Readiness Probe (/healthz/ready).
 *
 * Паттерн: SELECT 1 через существующий pg.Pool без ORM.
 * - Не создаёт новых коннектов — использует пул.
 * - Таймаут пинга — неявный (контролируется pool.query timeout).
 *
 * Архитектурный контекст:
 *   Liveness  → НЕ трогает БД (process alive check)
 *   Readiness → Использует этот индикатор (dependency check)
 *
 * Технический долг: при переезде на K8s readinessProbe этот индикатор
 * подключается без изменений — контракт соблюдён.
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly dbService: DatabaseService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Быстрый пинг: не трогает RLS, не требует транзакции
      await this.dbService.query('SELECT 1');
      return this.getStatus(key, true);
    } catch (error: any) {
      throw new HealthCheckError(
        'Database connection failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
