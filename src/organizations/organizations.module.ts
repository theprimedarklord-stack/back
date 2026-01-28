// src/organizations/organizations.module.ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { ContextGuard } from '../auth/context.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionsService } from '../auth/permissions.service';
import { RolesGuard } from '../auth/roles.guard';
import { RlsContextInterceptor } from '../common/interceptors/rls-context.interceptor';

@Module({
  imports: [SupabaseModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    HybridAuthGuard,
    ContextGuard,
    PermissionsGuard,
    PermissionsService,
    RolesGuard,
    RlsContextInterceptor,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
