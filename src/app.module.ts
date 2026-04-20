import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { RlsContextInterceptor } from './auth/rls-context.interceptor';
import { ProxyThrottlerGuard } from './common/guards/proxy-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
// import { AuthMiddleware } from './common/middleware/auth.middleware';

@Module({
  imports: [
    // Rate Limiting: Вариант А — один глобальный лимит + @Throttle переопределения
    // Redis хранилище для корректной работы при нескольких инстансах и рестартах.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) throw new Error('REDIS_URL is not defined in env');

        return {
          throttlers: [
            { name: 'default', ttl: 60000, limit: 100 },
          ],
          storage: new ThrottlerStorageRedisService(
            new Redis(redisUrl, {
              enableOfflineQueue: false, // Fail-fast: не копить запросы при падении Redis
              maxRetriesPerRequest: 3,
            }),
          ),
        };
      },
    }),
    ConfigModule.forRoot({ isGlobal: true }),
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
    // user-facing context endpoints
    MeModule,
    // New org-based modules
    OrganizationsModule,
    OrgProjectsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
    { provide: APP_GUARD, useClass: ProxyThrottlerGuard },
  ],
})
export class AppModule { }