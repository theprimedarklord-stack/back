// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service'; // Если создаете сервис
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule, // Для JwtAuthGuard
  ],
  controllers: [AdminController],
  providers: [AdminService], // Добавьте сервис, если создаете его
  exports: [AdminService], // Экспортируйте, если нужно использовать в других модулях
})
export class AdminModule { }