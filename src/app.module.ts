import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RlsContextInterceptor } from './auth/rls-context.interceptor';
import { DatabaseService } from './db/database.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
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
import { MapcardsModule } from './mapcards/mapcards.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OrgProjectsModule } from './org-projects/org-projects.module';
import { MeModule } from './me/me.module';
// import { AuthMiddleware } from './common/middleware/auth.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
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
    MapcardsModule,
    TelemetryModule,
    // user-facing context endpoints
    MeModule,
    // New org-based modules
    OrganizationsModule,
    OrgProjectsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor }, DatabaseService],
})
export class AppModule {}