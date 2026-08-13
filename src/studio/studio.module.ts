import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { StudioPublicController } from './studio-public.controller';
import { StudioService } from './studio.service';
import { DatabaseModule } from '../db/database.module';

// SupabaseModule помечен @Global, поэтому SupabaseService доступен
// без явного импорта — как и в других модулях проекта.
@Module({
  imports: [DatabaseModule],
  controllers: [StudioController, StudioPublicController],
  providers: [StudioService],
  exports: [StudioService],
})
export class StudioModule {}
