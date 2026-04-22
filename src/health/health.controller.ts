import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/db.health';

/**
 * HealthController — FAANG-grade Health Check endpoints
 *
 * Архитектура: Liveness / Readiness separation (K8s probe pattern)
 *
 * GET /healthz/live   → Liveness Probe
 *   - Проверяет только: "жив ли Node.js event loop?"
 *   - НЕ ходит в БД или Redis
 *   - Проверяет heap < 250 MB (утечка памяти = смерть процесса)
 *   - К8s: livenessProbe → перезапуск пода при падении
 *   - Render.com: Health Check Path → /healthz/live
 *   - Ответ при успехе: HTTP 200
 *
 * GET /healthz/ready  → Readiness Probe
 *   - Проверяет: доступность PostgreSQL (Supabase pg.Pool)
 *   - К8s: readinessProbe → под исключается из балансировщика, НЕ убивается
 *   - Render.com: НЕ используется в Health Check Path (нет концепции Readiness)
 *   - Ответ при успехе: HTTP 200
 *   - Ответ при ошибке: HTTP 503 Service Unavailable
 *
 * Security:
 *   @Public()        → байпас M2MAuthGuard (не требует x-service-token)
 *   @SkipThrottle()  → байпас Redis ThrottlerGuard (технический долг до API Gateway)
 *
 * Формат ответа (@nestjs/terminus стандарт):
 *   {"status":"ok","info":{"database":{"status":"up"}},"error":{},"details":{...}}
 */
@SkipThrottle() // TODO: убрать при переезде на AWS API Gateway / Cloudflare (Фаза 8)
@Public() // Байпас M2MAuthGuard — health-эндпоинты публичны по RFC 5988
@Controller('healthz')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly dbIndicator: DatabaseHealthIndicator,
  ) {}

  /**
   * Liveness Probe
   *
   * Отвечает на вопрос: "Жив ли Node.js процесс?"
   * Render.com + K8s livenessProbe → убьёт контейнер при HTTP != 2xx
   *
   * Проверка heap используется как прокси для "event loop not frozen":
   * если процесс завис — он не ответит вовсе → таймаут → рестарт.
   */
  @Get('live')
  @HealthCheck()
  checkLiveness() {
    return this.health.check([
      // Heap > 250MB = потенциальная утечка памяти → сигнал к рестарту
      () => this.memory.checkHeap('memory_heap', 250 * 1024 * 1024),
    ]);
  }

  /**
   * Readiness Probe
   *
   * Отвечает на вопрос: "Готов ли под принимать трафик?"
   * K8s readinessProbe → исключает под из балансировщика, НЕ убивает.
   * Полезен для дашбордов мониторинга (Grafana, Uptime Kuma).
   *
   * При временном отказе Supabase (рестарт ~10 сек) этот эндпоинт
   * вернёт 503, а процесс останется жив — Render НЕ должен его убивать.
   * Именно поэтому Render Health Check Path = /healthz/live, а не /ready.
   */
  @Get('ready')
  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      () => this.dbIndicator.isHealthy('database'),
      // TODO: добавить RedisHealthIndicator при миграции Redis на бэкенд
    ]);
  }
}
