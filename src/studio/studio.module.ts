import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';
import { DatabaseModule } from '../db/database.module';

// SupabaseModule помечен @Global, поэтому SupabaseService доступен
// без явного импорта — как и в других модулях проекта.
@Module({
  imports: [DatabaseModule],
  controllers: [StudioController],
  providers: [StudioService],
  exports: [StudioService],
})
export class StudioModule {}
