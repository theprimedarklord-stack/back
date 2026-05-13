import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

import { ThrottleRedisModule, THROTTLE_REDIS_CLIENT } from './common/redis/throttle-redis.module';
import { RlsContextInterceptor } from './auth/rls-context.interceptor';
import { ProxyThrottlerGuard } from './common/guards/proxy-throttler.guard';
import { M2MAuthGuard } from './auth/guards/m2m-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DictionaryModule } from './dictionary/dictionary.module';
import { CardsModule } from './cards/cards.module';
import { AdminModule } from './admin/admin.module';
import { TasksModule } from './tasks/tasks.module';
import { GoalsModule } from './goals/goals.module';
import { ProjectsModule } from './projects/projects.module';
import { AIModule } from './ai/ai.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { MapCardsModule } from './mapcards/mapcards.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OrgProjectsModule } from './org-projects/org-projects.module';
import { MeModule } from './me/me.module';
import { HealthModule } from './health/health.module';
import { FeedbackModule } from './feedback/feedback.module';

@Module({
  imports: [
    // ─── 1. Глобальный ConfigModule — всегда первым ────────────────────────
    // Остальные модули инжектируют ConfigService через @Global() контракт.
    ConfigModule.forRoot({ isGlobal: true }),

    // ─── 2. Инфраструктура: Redis для троттлера ─────────────────────────────
    // @Global() модуль — регистрирует THROTTLE_REDIS_CLIENT один раз.
    // ThrottlerModule.forRootAsync инжектирует его без явного imports: [].
    ThrottleRedisModule,

    // ─── 3. Rate Limiting (FAANG Hybrid Throttler) ──────────────────────────
    //
    // Архитектура:
    //   • Хранилище: Redis (корректная работа при нескольких инстансах/рестартах)
    //   • TTL: seconds() — явный хелпер @nestjs/throttler, принимает секунды
    //   • Env: THROTTLE_TTL_SECONDS (не ms, не ms/1000 — секунды и точка)
    //   • Ключи: "throttle:<ip>" или "throttle:<ip>:<email>" (ProxyThrottlerGuard)
    //
    // Требования к .env:
    //   THROTTLE_TTL_SECONDS=60    # Окно подсчёта, секунды
    //   THROTTLE_LIMIT=100         # Максимум запросов в окне
    //
    ThrottlerModule.forRootAsync({
      // imports: [] не нужен — THROTTLE_REDIS_CLIENT глобален через ThrottleRedisModule.
      inject: [ConfigService, THROTTLE_REDIS_CLIENT],
      useFactory: (configService: ConfigService, redisClient: Redis) => ({
        throttlers: [
          {
            name: 'default',
            // seconds() — официальный хелпер, конвертирует секунды → мс.
            // Защита от тихого бага: передача ms вместо s даёт 16-часовой бан.
            ttl: seconds(configService.get<number>('THROTTLE_TTL_SECONDS', 60)),
            limit: configService.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
        storage: new ThrottlerStorageRedisService(redisClient),
      }),
    }),

    // ─── 4. Бизнес-модули ───────────────────────────────────────────────────
    SupabaseModule,
    DatabaseModule,
    AuthModule,
    UserModule,
    DictionaryModule,
    CardsModule,
    AdminModule,
    TasksModule,
    GoalsModule,
    ProjectsModule,
    AIModule,
    SuggestionsModule,
    MapCardsModule,
    TelemetryModule,

    // User-facing context endpoints
    MeModule,

    // Org-based modules
    OrganizationsModule,
    OrgProjectsModule,

    // FAANG-grade Health Checks: /healthz/live + /healthz/ready
    HealthModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
    { provide: APP_GUARD, useClass: ProxyThrottlerGuard },
    { provide: APP_GUARD, useClass: M2MAuthGuard },
  ],
})
export class AppModule {}