// src/common/redis/throttle-redis.module.ts
//
// Инфраструктурный Global Module для Redis-клиента троттлера.
//
// Паттерны:
//   @Global()       — провайдер виден всему DI-дереву без дублирования imports.
//   imports: [ConfigModule] — явная зависимость (Explicit > Implicit).
//                             NestJS не создаст второй инстанс ConfigModule,
//                             потому что он уже зарегистрирован как глобальный.
//   OnApplicationShutdown — гарантированное закрытие соединения при остановке.

import {
  Module,
  Global,
  OnApplicationShutdown,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Injection token — используется в ThrottlerModule и unit-тестах. */
export const THROTTLE_REDIS_CLIENT = 'THROTTLE_REDIS_CLIENT';

@Global()
@Module({
  imports: [
    // Явный импорт: защита от boot-order ошибок.
    // NestJS дедуплицирует модуль — двух инстансов не будет.
    ConfigModule,
  ],
  providers: [
    {
      provide: THROTTLE_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error(
            '[ThrottleRedisModule] REDIS_URL is not defined in env. ' +
              'Set REDIS_URL in your .env file.',
          );
        }

        const client = new Redis(redisUrl, {
          // Явный namespace: изолирует throttler-ключи в Redis.
          // Итоговый вид ключа: "throttle:1.2.3.4:user@mail.com"
          // Если @nest-lab/throttler-storage-redis добавит свой префикс,
          // результат будет "throttle:throttler:…" — что допустимо, но
          // нужно проверить на staging (`redis-cli KEYS "*"`) и выбрать
          // один источник правды.
          keyPrefix: 'throttle:',

          // Fail-fast: не накапливать команды в очереди при падении Redis.
          // Без этого память будет расти до OOM при длительном downtime.
          enableOfflineQueue: false,

          // 0 попыток переподключения к одному запросу = мгновенный отказ.
          maxRetriesPerRequest: 0,
        });

        client.on('error', (err: Error) => {
          // Логируем, но не крашим приложение — rate-limit деградирует gracefully.
          Logger.error(
            `[ThrottleRedisModule] Redis error: ${err.message}`,
            'ThrottleRedisModule',
          );
        });

        client.on('connect', () => {
          Logger.log(
            '[ThrottleRedisModule] Throttler Redis connected.',
            'ThrottleRedisModule',
          );
        });

        return client;
      },
    },
  ],
  exports: [THROTTLE_REDIS_CLIENT],
})
export class ThrottleRedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(ThrottleRedisModule.name);

  constructor(
    @Inject(THROTTLE_REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  /**
   * Graceful shutdown: закрываем соединение командой QUIT
   * (в отличие от .disconnect() она ждёт выполнения текущих команд).
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Closing Throttler Redis connection (signal: ${signal ?? 'unknown'})...`,
    );
    await this.redisClient.quit();
    this.logger.log('Throttler Redis connection closed.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Unit-test helper
  //
  // Использование в spec-файлах:
  //
  //   import { ThrottleRedisModule } from '../common/redis/throttle-redis.module';
  //
  //   const module = await Test.createTestingModule({
  //     imports: [ThrottleRedisModule.mock()],
  //   }).compile();
  //
  // ─────────────────────────────────────────────────────────────────────────
  static mock() {
    @Module({
      providers: [
        {
          provide: THROTTLE_REDIS_CLIENT,
          useValue: {
            // Минимальный mock Redis для тестов без реального соединения
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
            quit: jest.fn().mockResolvedValue('OK'),
            on: jest.fn(),
          },
        },
      ],
      exports: [THROTTLE_REDIS_CLIENT],
    })
    class ThrottleRedisModuleMock {}

    return ThrottleRedisModuleMock;
  }
}
