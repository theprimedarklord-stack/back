// src/org-projects/org-projects.module.ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { OrgProjectsController } from './org-projects.controller';
import { OrgProjectsService } from './org-projects.service';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { ContextGuard } from '../auth/context.guard';
import { ProjectGuard } from '../auth/project.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionsService } from '../auth/permissions.service';
import { RolesGuard } from '../auth/roles.guard';
import { RlsContextInterceptor } from '../common/interceptors/rls-context.interceptor';

@Module({
  imports: [SupabaseModule],
  controllers: [OrgProjectsController],
  providers: [
    OrgProjectsService,
    HybridAuthGuard,
    ContextGuard,
    ProjectGuard,
    PermissionsGuard,
    PermissionsService,
    RolesGuard,
    RlsContextInterceptor,
  ],
  exports: [OrgProjectsService],
})
export class OrgProjectsModule {}
