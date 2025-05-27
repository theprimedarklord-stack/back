import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express'; // Импортируем express для middleware

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('ENV:', process.env.NODE_ENV);
  app.useGlobalFilters(new AllExceptionsFilter());
  const configService = app.get(ConfigService);

  // Добавляем ValidationPipe для автоматической валидации DTO
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Определяем фронтенд-URL для CORS из переменных окружения
  const clientUrl =
    process.env.NODE_ENV === 'production'
      ? 'https://smartmemory.vercel.app'
      : 'http://localhost:3000'; // Обновите, если фронтенд на другом порту (например, 3001)

  app.enableCors({
    origin: clientUrl,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Pragma',
    ],
    exposedHeaders: ['Set-Cookie'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  console.log('CORS ALLOWED ORIGIN:', clientUrl);

  // Подключаем парсер куки
  app.use(cookieParser());

  // Увеличиваем лимит тела JSON-запроса до 10 МБ
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Используем динамический порт
  const port = parseInt(configService.get<string>('PORT', '8080'), 10);
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🌐 CORS allowed origin: ${clientUrl}`);
}

bootstrap();