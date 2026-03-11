import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RlsContextInterceptor } from './auth/rls-context.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
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
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 минута
      limit: 100, // максимум 100 запросов с одного IP в минуту
    }]),
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
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule { }