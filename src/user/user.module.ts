import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { SupabaseService } from '../supabase/supabase.service';

@Module({
  controllers: [UserController],
  providers: [SupabaseService],
})
export class UserModule {}