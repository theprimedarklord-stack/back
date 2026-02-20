
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useGlobalFilters(new AllExceptionsFilter());
  const configService = app.get(ConfigService);

  // === ВСЮ ЭТУ КАСТОМНУЮ ЛОГИКУ УБИРАЕМ. Она вызывает 403. ===

  // 1. Определяем среду и разрешенные адреса
  const APP_ENV = process.env.APP_ENV || 'dev';
  const allowedOrigins = APP_ENV === 'prod'
    ? ['https://smartmemory.vercel.app'] // ТВОЙ продакшен-домен
    : ['http://localhost:3000']; // ТВОЙ локальный фронт

  console.log(`🚀 Сервер запущен в среде: ${APP_ENV}. Разрешены origins:`, allowedOrigins);

  // 2. Включаем CORS от NestJS. Это РАБОЧИЙ способ.
  app.enableCors({
    origin: (origin, callback) => {
      // Разрешаем запросы без origin (серверные запросы, curl, BFF Next.js)
      if (!origin) {
        return callback(null, true);
      }
      // Проверяем по списку разрешенных
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Если нужна отладка, можно раскомментировать:
      // console.log('❌ CORS блокирован для origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // Важно для кук и сессий
    exposedHeaders: ['set-cookie'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept', 'Origin', 'X-Requested-With', 'x-org-id', 'x-project-id'],
  });

  // 3. Подключаем парсер кук
  app.use(cookieParser());

  // 4. Увеличиваем лимит тела JSON-запроса
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 5. Используем динамический порт и слушаем
  const port = parseInt(configService.get<string>('PORT', '8080'), 10);
  await app.listen(port, '0.0.0.0');
  console.log(`✅ Сервер слушает на 0.0.0.0:${port}`);
}

bootstrap();