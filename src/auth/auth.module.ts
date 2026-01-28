// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { ContextGuard } from './context.guard';
import { ProjectGuard } from './project.guard';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    CognitoAuthGuard,
    HybridAuthGuard,
    ContextGuard,
    ProjectGuard,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
  ],
  exports: [
    JwtAuthGuard,
    CognitoAuthGuard,
    HybridAuthGuard,
    ContextGuard,
    ProjectGuard,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
  ],
})
export class AuthModule {}