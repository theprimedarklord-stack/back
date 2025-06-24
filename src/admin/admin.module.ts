// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service'; // Если создаете сервис
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    SupabaseModule,
    AuthModule, // Для JwtAuthGuard
  ],
  controllers: [AdminController],
  providers: [AdminService], // Добавьте сервис, если создаете его
  exports: [AdminService], // Экспортируйте, если нужно использовать в других модулях
})
export class AdminModule {}