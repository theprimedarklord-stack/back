import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import * as express from 'express'; // Импортируем express для middleware
import { Client } from 'pg'; // Добавлено для миграции

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1); // Критично для работы Secure cookies за прокси (Render/Cloudflare)
  app.useGlobalFilters(new AllExceptionsFilter());
  const configService = app.get(ConfigService);

// --- ПРЯМАЯ МИГРАЦИЯ (БЕЗ CONFIGSERVICE) ---
const rawDbUrl = process.env.DATABASE_URL; // Берем напрямую из системы
console.log('=== DATABASE CHECK START ===');

if (!rawDbUrl) {
  console.log('❌ ERROR: process.env.DATABASE_URL is EMPTY');
} else {
  console.log('Found URL, attempting connection...');
  const client = new Client({ 
    connectionString: rawDbUrl,
    ssl: { rejectUnauthorized: false } // Добавляем SSL, так как Render его требует
  });
  
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE items REPLICA IDENTITY FULL;
    `);
    console.log('✅ SUCCESS: Table "items" is ready');
  } catch (err) {
    console.log('❌ DB ERROR:', err.message);
  } finally {
    await client.end();
  }
}
console.log('=== DATABASE CHECK END ===');
// --- КОНЕЦ БЛОКА ---

  // Добавляем ValidationPipe для автоматической валидации DTO
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        console.log('=== VALIDATION PIPE ERROR ===');
        console.log('Validation errors count:', errors.length);
        errors.forEach((error, index) => {
          console.log(`Error ${index + 1}:`);
          console.log('  Property:', error.property);
          console.log('  Value:', error.value);
          console.log('  Constraints:', error.constraints);
          console.log('  Target:', error.target);
        });
        console.log('=============================');
        
        // Возвращаем стандартную ошибку валидации
        const errorMessages = errors.map(error => 
          Object.values(error.constraints || {}).join(', ')
        );
        return new BadRequestException(errorMessages);
      },
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


  // Подключаем парсер куки
  app.use(cookieParser());

  // Middleware для логирования всех входящих запросов на /auth/login (ДО парсеров)
  app.use('/auth/login', (req, res, next) => {
    console.log('=== INCOMING REQUEST DEBUG (BEFORE PARSING) ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw body (before parsing):', req.body);
    console.log('===============================================');
    next();
  });

  // Увеличиваем лимит тела JSON-запроса до 50 МБ
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Middleware для логирования сырого тела запроса (только для /auth/login) - ПОСЛЕ парсеров
  app.use('/auth/login', (req, res, next) => {
    console.log('=== RAW REQUEST BODY DEBUG ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
    console.log('Accept-Encoding:', req.headers['accept-encoding']);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Origin:', req.headers['origin']);
    console.log('Referer:', req.headers['referer']);
    console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
    console.log('X-Real-IP:', req.headers['x-real-ip']);
    console.log('All headers:', JSON.stringify(req.headers, null, 2));
    console.log('Parsed body:', JSON.stringify(req.body, null, 2));
    console.log('Body type:', typeof req.body);
    console.log('Body keys:', req.body ? Object.keys(req.body) : 'No body');
    console.log('Body.email:', req.body?.email);
    console.log('Body.password:', req.body?.password ? '[HIDDEN]' : 'undefined');
    console.log('Body.password length:', req.body?.password?.length || 0);
    console.log('Body.rememberMe:', req.body?.rememberMe);
    
    // Проверяем, есть ли проблемы с парсингом
    if (req.body && typeof req.body === 'object') {
      const hasEmail = 'email' in req.body;
      const hasPassword = 'password' in req.body;
      const hasRememberMe = 'rememberMe' in req.body;
      console.log('Body structure check:');
      console.log('  Has email:', hasEmail);
      console.log('  Has password:', hasPassword);
      console.log('  Has rememberMe:', hasRememberMe);
      console.log('  Total properties:', Object.keys(req.body).length);
    }
    
    console.log('=====================================');
    next();
  });

  // Используем динамический порт
  const port = parseInt(configService.get<string>('PORT', '8080'), 10);
  await app.listen(port, '0.0.0.0');

}

bootstrap();