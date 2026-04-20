// src/organizations/organizations.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { ContextGuard } from '../auth/context.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionsService } from '../auth/permissions.service';
import { RolesGuard } from '../auth/roles.guard';
import { RlsContextInterceptor } from '../auth/rls-context.interceptor';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    CognitoAuthGuard,
    ContextGuard,
    PermissionsGuard,
    PermissionsService,
    RolesGuard,
    RlsContextInterceptor,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule { }
