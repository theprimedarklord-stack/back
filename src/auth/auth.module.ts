// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { ContextGuard } from './context.guard';
import { ProjectGuard } from './project.guard';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';
import { RequirePermissionGuard } from './require-permission.guard';
import { ContextBuilderService } from './context-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CognitoAuthGuard,
    ContextGuard,
    ProjectGuard,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
    RequirePermissionGuard,
    ContextBuilderService,
  ],
  exports: [
    CognitoAuthGuard,
    ContextGuard,
    ProjectGuard,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
    ContextBuilderService,
    DatabaseModule,
  ],
})
export class AuthModule { }