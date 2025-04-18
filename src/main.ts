// В файле main.ts сервера NestJS
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Настройка CORS
  app.enableCors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control', // Добавляем разрешённые заголовки
      'Pragma'
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  app.use(cookieParser());
  await app.listen(process.env.PORT || 3000);
}
bootstrap();