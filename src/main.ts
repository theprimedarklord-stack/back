// В файле main.ts сервера NestJS
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Настройка CORS
  app.enableCors({
    origin: process.env.CLIENT_URL,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
    exposedHeaders: ['Set-Cookie'], // Добавьте это
    credentials: true,
  });

  app.use(cookieParser());
  await app.listen(process.env.PORT || 3000);
}
bootstrap();