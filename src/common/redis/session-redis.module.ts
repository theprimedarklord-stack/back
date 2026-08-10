// src/common/redis/session-redis.module.ts
//
// Read-only Redis client for the main session Redis (Next.js).
// Used to READ presence keys (cache:presence:{userId}) written by the BFF heartbeat.
//
// ⚠️  This client is READ-ONLY by convention. Do NOT write high-churn data here —
//     the session Redis must remain free of eviction pressure from the backend.
//     See: src/lib/memory/lock.ts in SmartMemory--NextJS for architectural rationale.

import {
  Module,
  Global,
  OnApplicationShutdown,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Injection token for the session/presence Redis client (read-only). */
export const SESSION_REDIS_CLIENT = 'SESSION_REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SESSION_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const redisUrl = config.get<string>('SESSION_REDIS_URL');
        if (!redisUrl) {
          Logger.warn(
            '[SessionRedisModule] SESSION_REDIS_URL is not set. ' +
              'Presence features will be unavailable.',
            'SessionRedisModule',
          );
          // Return a disconnected client — graceful degradation
          const dummy = new Redis({ lazyConnect: true, enableOfflineQueue: false });
          dummy.disconnect();
          return dummy;
        }

        const isSecure = redisUrl.startsWith('rediss://');

        const client = new Redis(redisUrl, {
          // NO keyPrefix — BFF writes full keys like "cache:presence:{userId}"
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          commandTimeout: 2000,
          ...(isSecure && {
            tls: {
              rejectUnauthorized: false, // Aiven self-signed / intermediate CA
            },
          }),
        });

        client.on('error', (err: Error) => {
          Logger.error(
            `[SessionRedisModule] Redis error: ${err.message}`,
            'SessionRedisModule',
          );
        });

        client.on('connect', () => {
          Logger.log(
            '[SessionRedisModule] Session Redis connected (read-only for presence).',
            'SessionRedisModule',
          );
        });

        return client;
      },
    },
  ],
  exports: [SESSION_REDIS_CLIENT],
})
export class SessionRedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(SessionRedisModule.name);

  constructor(
    @Inject(SESSION_REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Closing Session Redis connection (signal: ${signal ?? 'unknown'})...`,
    );
    if (this.redisClient.status === 'ready') {
      await this.redisClient.quit();
    } else {
      this.redisClient.disconnect();
    }
    this.logger.log('Session Redis connection closed.');
  }
}
