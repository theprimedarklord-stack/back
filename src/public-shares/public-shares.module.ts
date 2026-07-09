import { Module } from '@nestjs/common';
import { PublicSharesController, PublicAccessController } from './public-shares.controller';
import { PublicSharesService } from './public-shares.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [PublicSharesController, PublicAccessController],
  providers: [PublicSharesService],
  exports: [PublicSharesService],
})
export class PublicSharesModule {}
