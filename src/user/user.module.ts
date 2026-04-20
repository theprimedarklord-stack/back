import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { SupabaseService } from '../supabase/supabase.service';
import { UserService } from './user.service';

@Module({
  controllers: [UserController],
  providers: [SupabaseService, UserService],
})
export class UserModule { }