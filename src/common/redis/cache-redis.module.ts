import { Module, Global, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const CACHE_REDIS_CLIENT = 'CACHE_REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL is missing');
        }
        return new Redis(redisUrl, {
          keyPrefix: 'cache:',
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
        });
      },
    },
  ],
  exports: [CACHE_REDIS_CLIENT],
})
export class CacheRedisModule implements OnApplicationShutdown {
  constructor(@Inject(CACHE_REDIS_CLIENT) private readonly redisClient: Redis) {}

  async onApplicationShutdown() {
    if (this.redisClient.status === 'ready') {
      await this.redisClient.quit();
    } else {
      this.redisClient.disconnect();
    }
  }
}
