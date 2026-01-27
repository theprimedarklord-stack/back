// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { ConfigService } from '@nestjs/config';
// import * as cookieParser from 'cookie-parser';
// import { AllExceptionsFilter } from './common/filters/http-exception.filter';
// import { ValidationPipe, BadRequestException } from '@nestjs/common';
// import * as express from 'express';
// import { Client } from 'pg';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.getHttpAdapter().getInstance().set('trust proxy', 1);
//   app.useGlobalFilters(new AllExceptionsFilter());
//   const configService = app.get(ConfigService);

//   // КРИТИЧНО: Таймауты на все операции
//   app.use((req, res, next) => {
//     req.setTimeout(10000, () => {
//       res.status(408).json({ status: 'timeout' });
//     });

//     req.on('data', () => req.socket.setTimeout(5000));
//     next();
//   });

//   // Защита от сканирования портов
//   app.use((req, res, next) => {
//     const validPaths = [
//       '/api/v1/telemetry',
//       '/api/v1/init',
//       '/api/analytics',
//       '/health',
//       '/api/health',
//       '/api/debug/db-check',
//       '/api/debug/db-setup',
//       '/api/debug/victims-check',
//       '/api/v1/telemetry/victims',
//       '/api/v1/victims',
//       '/api/v1/victim',
//       '/api/v1/database/tables',
//       '/api/v1/database/tables/',
//     ];
    
//     const pathWithoutQuery = req.path.split('?')[0];
//     if (
//       !validPaths.includes(pathWithoutQuery) &&
//       !req.path.startsWith('/auth/') &&
//       !req.path.startsWith('/cards/') &&
//       !req.path.startsWith('/tasks/') &&
//       !req.path.startsWith('/goals/') &&
//       !req.path.startsWith('/projects/') &&
//       !req.path.startsWith('/suggestions/') &&
//       !req.path.startsWith('/mapcards/') &&
//       !req.path.startsWith('/dictionary/') &&
//       !req.path.startsWith('/admin/') &&
//       !req.path.startsWith('/user/') &&
//       !req.path.startsWith('/ai/') &&
//       !req.path.startsWith('/api/v1/victim/') &&
//       !req.path.startsWith('/api/v1/database/tables/')
//     ) {
//       res.send('<html><title>Under Construction</title></html>');
//       return;
//     }
//     next();
//   });

//   // Определяем фронтенд-URL для CORS
//   const clientUrl =
//     process.env.NODE_ENV === 'production'
//       ? 'https://smartmemory.vercel.app'
//       : 'http://localhost:3000';

//   // УМНЫЙ CORS MIDDLEWARE - ЕДИНСТВЕННЫЙ обработчик CORS
//   app.use((req, res, next) => {
//     const origin = req.headers.origin;
//     const userAgent = req.headers['user-agent'] || '';
//     const path = req.path;
    
//     // 1. Health и debug - открыты для всех
//     if (path === '/health' || path === '/api/health' || 
//         path.includes('/api/debug/')) {
//       res.header('Access-Control-Allow-Origin', '*');
//       res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
//       res.header('Access-Control-Allow-Headers', 'Content-Type');
//       return next();
//     }
    
// // 2. Телеметрия и аналитика - особая обработка
// if (path.includes('/api/v1/telemetry') || path.includes('/api/analytics') || 
// path.includes('/api/v1/init')) {
//   console.log('🔍 TELEMETRY REQUEST:', {
//     path,
//     origin,
//     userAgent: userAgent.substring(0, 50),
//     method: req.method,
//     timestamp: new Date().toISOString()
//   });
  
//   const isTelemetryClient = /(python|requests|node|curl|Test-Logger|windows)/i.test(userAgent);
  
//   if (!origin || origin === 'null' || isTelemetryClient) {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type, User-Agent, x-client-token, x-timestamp');
//   } else {
//     console.log('❌ CORS BLOCKED:', { origin, isTelemetryClient });
//     return res.status(403).json({ 
//       status: 'error', 
//       message: 'Forbidden' 
//     });
//   }
  
//   return next();
// }
    
//     // 3. Для основного приложения - только фронтенд
//     if (origin === clientUrl) {
//       res.header('Access-Control-Allow-Origin', clientUrl);
//       res.header('Access-Control-Allow-Credentials', 'true');
//       res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
//       res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Pragma');
      
//       // Обработка preflight OPTIONS запросов
//       if (req.method === 'OPTIONS') {
//         return res.status(200).end();
//       }
//     } else {
//       // Разрешаем запросы без origin (например, из curl, Postman)
//       if (!origin) {
//         res.header('Access-Control-Allow-Origin', '*');
//         if (req.method === 'OPTIONS') {
//           return res.status(200).end();
//         }
//         return next();
//       }
      
//       return res.status(403).json({ 
//         status: 'error', 
//         message: 'Forbidden' 
//       });
//     }
    
//     next();
//   });

//   // Подключаем парсер куки
//   app.use(cookieParser());

//   // Middleware для логирования всех входящих запросов на /auth/login (ДО парсеров)
//   app.use((req, res, next) => {
//     if (req.path.includes('/api/v1/telemetry')) {
//       return next();
//     }
//     if (req.path === '/auth/login') {
//       console.log('=== INCOMING REQUEST DEBUG (BEFORE PARSING) ===');
//       console.log('Timestamp:', new Date().toISOString());
//       console.log('Method:', req.method);
//       console.log('URL:', req.url);
//       console.log('Headers:', JSON.stringify(req.headers, null, 2));
//       console.log('Raw body (before parsing):', req.body);
//       console.log('===============================================');
//     }
//     next();
//   });

//   // Увеличиваем лимит тела JSON-запроса до 50 МБ
//   app.use(express.json({ limit: '50mb' }));
//   app.use(express.urlencoded({ limit: '50mb', extended: true }));

//   // DoS защита: Middleware для проверки Content-Length перед парсингом JSON
//   app.use((req, res, next) => {
//     if (req.path.includes('/api/v1/telemetry')) {
//       const contentLength = parseInt(req.headers['content-length'] || '0', 10);
//       if (contentLength > 5 * 1024 * 1024) {
//         return res.status(413).json({
//           status: 'error',
//           message: 'Payload too large',
//         });
//       }
//     }
//     next();
//   });

//   // Middleware для логирования сырого тела запроса (только для /auth/login) - ПОСЛЕ парсеров
//   app.use('/auth/login', (req, res, next) => {
//     console.log('=== RAW REQUEST BODY DEBUG ===');
//     console.log('Timestamp:', new Date().toISOString());
//     console.log('Content-Type:', req.headers['content-type']);
//     console.log('Content-Length:', req.headers['content-length']);
//     console.log('Accept-Encoding:', req.headers['accept-encoding']);
//     console.log('User-Agent:', req.headers['user-agent']);
//     console.log('Origin:', req.headers['origin']);
//     console.log('Referer:', req.headers['referer']);
//     console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
//     console.log('X-Real-IP:', req.headers['x-real-ip']);
//     console.log('All headers:', JSON.stringify(req.headers, null, 2));
//     console.log('Parsed body:', JSON.stringify(req.body, null, 2));
//     console.log('Body type:', typeof req.body);
//     console.log('Body keys:', req.body ? Object.keys(req.body) : 'No body');
//     console.log('Body.email:', req.body?.email);
//     console.log('Body.password:', req.body?.password ? '[HIDDEN]' : 'undefined');
//     console.log('Body.password length:', req.body?.password?.length || 0);
//     console.log('Body.rememberMe:', req.body?.rememberMe);
    
//     if (req.body && typeof req.body === 'object') {
//       const hasEmail = 'email' in req.body;
//       const hasPassword = 'password' in req.body;
//       const hasRememberMe = 'rememberMe' in req.body;
//       console.log('Body structure check:');
//       console.log('  Has email:', hasEmail);
//       console.log('  Has password:', hasPassword);
//       console.log('  Has rememberMe:', hasRememberMe);
//       console.log('  Total properties:', Object.keys(req.body).length);
//     }
    
//     console.log('=====================================');
//     next();
//   });

//   // Используем динамический порт
//   const port = parseInt(configService.get<string>('PORT', '8080'), 10);
//   await app.listen(port, '0.0.0.0');
// }

// bootstrap();

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Accept', 'Origin', 'X-Requested-With'],
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