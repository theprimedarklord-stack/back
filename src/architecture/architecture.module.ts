import { Module } from '@nestjs/common';
import { ArchitectureController } from './architecture.controller';
import { ArchitectureService } from './architecture.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

@Module({
  imports: [SupabaseModule],
  controllers: [ArchitectureController],
  providers: [ArchitectureService, SuperAdminGuard],
  exports: [ArchitectureService],
})
export class ArchitectureModule {}
