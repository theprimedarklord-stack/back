// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Получаем ConfigService из контейнера NestJS
  const configService = app.get(ConfigService);

  // Определяем фронтенд-URL для CORS из переменных окружения
  // В .env или в Railway Settings задайте CLIENT_URL (локальный) и PROD_CLIENT_URL (продакшн)
  const clientUrl =
    process.env.NODE_ENV === 'production'
      ? configService.get<string>('PROD_CLIENT_URL')
      : configService.get<string>('CLIENT_URL', 'http://localhost:3000');

  // Включаем CORS, разрешая куки и заголовок Set-Cookie
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Pragma'],
    exposedHeaders: ['Set-Cookie'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  console.log('CORS ALLOWED ORIGIN:', clientUrl);

  // Подключаем парсер куки
  app.use(cookieParser());

  // Используем динамический порт (Railway прокидывает его в process.env.PORT)
  const port = parseInt(configService.get<string>('PORT', '8080'), 10);
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🌐 CORS allowed origin: ${clientUrl}`);
}

bootstrap();
