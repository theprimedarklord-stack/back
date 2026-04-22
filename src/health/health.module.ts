import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../db/database.module';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/db.health';

/**
 * HealthModule — FAANG-grade Health Check System
 *
 * Регистрирует два независимых probe-эндпоинта:
 *   - /healthz/live  (Liveness)
 *   - /healthz/ready (Readiness)
 *
 * Зависимости:
 *   - TerminusModule:  HealthCheckService + MemoryHealthIndicator из коробки
 *   - DatabaseModule:  DatabaseService (pg.Pool) для кастомного DB ping
 *
 * Технический долг: при добавлении Redis Readiness probe —
 *   импортировать RedisModule и добавить RedisHealthIndicator в providers.
 */
@Module({
  imports: [
    TerminusModule, // Предоставляет HealthCheckService, MemoryHealthIndicator
    DatabaseModule, // Предоставляет DatabaseService для DatabaseHealthIndicator
  ],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
