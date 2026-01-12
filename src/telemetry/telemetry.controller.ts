import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpException,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import { Request } from 'express';
import { TelemetryService } from './telemetry.service';
import { TelemetryAuthService } from './telemetry-auth.service';
import { InitTelemetryDto } from './dto/init-telemetry.dto';
import { TelemetryDataDto } from './dto/telemetry-data.dto';
import { TelemetryExceptionFilter } from './filters/telemetry-exception.filter';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

@Controller('api')
@UseFilters(TelemetryExceptionFilter)
export class TelemetryController {
  private attackCounter = new Map<string, number>(); // IP hash -> count
  private readonly panicCode: string;
  private readonly MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly authService: TelemetryAuthService,
    private readonly configService: ConfigService,
  ) {
    this.panicCode = this.configService.get<string>('PANIC_CODE') || '';
  }

  /**
   * Эндпоинт инициализации: POST /api/v1/init
   * Двухфазный handshake - клиент отправляет публичный ключ, получает зашифрованный response_key
   */
  @Post('v1/init')
  async initClient(@Req() req: Request) {
    // ШАГ 0: Предварительная проверка Content-Type
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Invalid content type',
      });
    }
  
    // ШАГ 1: Защита от повторных атак
    const clientInfo = this.authService.extractClientInfo(req);
    const ipHash = this.authService.hashIpAddress(clientInfo.ip);
    const attackCount = this.attackCounter.get(ipHash) || 0;
    if (attackCount > 10) {
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Rate limited',
      });
    }
  
    // ШАГ 2: Ручной парсинг JSON
    let body = req.body;
    
    // ВРЕМЕННОЕ ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ
    console.log('=== INIT REQUEST DEBUG ===');
    console.log('Body:', JSON.stringify(body, null, 2));
    console.log('Body type:', typeof body);
    console.log('Body.timestamp:', body?.timestamp);
    console.log('Body.client_public_key:', body?.client_public_key ? 'PRESENT' : 'MISSING');
    console.log('Body.hostname:', body?.hostname);
    
    // ШАГ 3: Валидация timestamp
    if (!body?.timestamp) {
      console.log('ERROR: timestamp is missing');
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    
    const timestampValid = this.authService.validateTimestamp(body.timestamp);
    console.log('Timestamp validation:', timestampValid);
    if (!timestampValid) {
      console.log('ERROR: timestamp validation failed');
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  
    // ШАГ 4: Валидация публичного ключа
    if (!body?.client_public_key) {
      console.log('ERROR: client_public_key is missing');
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    
    const keyValid = this.authService.validatePublicKey(body.client_public_key);
    console.log('Public key validation:', keyValid);
    if (!keyValid) {
      console.log('ERROR: public key validation failed');
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  
    // ШАГ 5: Валидация hostname (если нужен whitelist)
    const hostnameValid = this.authService.isHostnameAllowed(body.hostname || '');
    console.log('Hostname validation:', hostnameValid);
    if (!hostnameValid) {
      console.log('ERROR: hostname validation failed');
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  
    console.log('=== ALL VALIDATIONS PASSED ===');
  
    // ШАГ 6: Обработка init
    try {
      const result = await this.telemetryService.handleInit(
        body.client_public_key,
        body.hostname || '',
      );
  
      // Успех - сброс счётчика
      this.attackCounter.delete(ipHash);
  
      return this.telemetryService.padResponse({
        status: 'ok',
        client_id: result.client_id,
        response_key: result.response_key,
      });
    } catch (error) {
      console.log('ERROR in handleInit:', error);
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * Основной эндпоинт: POST /api/v1/telemetry
   * Принимает зашифрованные данные, сохраняет БЕЗ расшифровки
   */
  @Post('v1/telemetry')
  async receiveTelemetry(@Req() req: Request) {
    // ШАГ 0: Предварительная проверка Content-Type
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Invalid content type',
      });
    }

    // ШАГ 0.5: Проверка размера ДО парсинга
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > this.MAX_PAYLOAD_SIZE) {
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Payload too large',
      });
    }

    // ШАГ 1: Защита от повторных атак
    const clientInfo = this.authService.extractClientInfo(req);
    const ipHash = this.authService.hashIpAddress(clientInfo.ip);
    const attackCount = this.attackCounter.get(ipHash) || 0;
    if (attackCount > 10) {
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Rate limited',
      });
    }

    // ШАГ 2: Ручной парсинг JSON
    let body: any;
    try {
      body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON'));
          }
        });
      });
    } catch {
      this.attackCounter.set(ipHash, attackCount + 1);
      setTimeout(() => {
        this.attackCounter.delete(ipHash);
      }, 3600000);
      return this.telemetryService.padResponse({
        status: 'ok',
        id: Date.now().toString(),
      });
    }

    // ШАГ 3: Паник-проверка
    if (body._panic === this.panicCode) {
      await this.telemetryService.selfDestruct();
      return this.telemetryService.padResponse({
        status: 'ok',
        message: 'Panic mode activated',
      });
    }

    // ШАГ 4: Валидация timestamp
    if (!this.authService.validateTimestamp(body.timestamp)) {
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // ШАГ 5: Проверка размера payload
    if (body.data) {
      const payloadSize = Buffer.from(body.data, 'base64').length;
      if (payloadSize > this.MAX_PAYLOAD_SIZE) {
        return this.telemetryService.padResponse({
          status: 'error',
          message: 'Payload too large',
        });
      }
    }

    // ШАГ 6: Сохранение зашифрованных данных (БЕЗ расшифровки)
    try {
      const id = await this.telemetryService.saveTelemetryData(
        body.client_id,
        body.timestamp,
        body.data,
      );

      // Успех - сброс счётчика
      this.attackCounter.delete(ipHash);

      return this.telemetryService.padResponse({
        status: 'success',
        id,
        received_at: new Date().toISOString(),
      });
    } catch (error) {
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Фейковый эндпоинт для обмана: POST /api/analytics
   */
  @Post('analytics')
  async fakeAnalytics(@Body() body: any) {
    try {
      // // Сохраняем в отдельную таблицу в Render PostgreSQL
      // await this.telemetryService.databaseService.query(
      //   `INSERT INTO fake_analytics_logs (data, received_at) VALUES ($1, $2)`,
      //   [JSON.stringify(body), new Date().toISOString()],
      // );

      // Всегда возвращаем успех
      return {
        status: 'tracked',
        id: Date.now().toString(),
      };
    } catch (error) {
      // Даже при ошибке возвращаем успех
      return {
        status: 'tracked',
        id: Date.now().toString(),
      };
    }
  }

  /**
   * Health endpoint: GET /api/health
   */
  @Get('health')
  async health() {
    try {
      // // Проверка подключения к Render PostgreSQL
      // await this.telemetryService.databaseService.query('SELECT 1');

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        message: 'Health check failed',
      };
    }
  }

  @Get('debug/db-check')
    async checkTables() {
      // Мы используем тот же Client, который ты импортировал
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      
      await client.connect();
      try {
        const res = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public';
        `);
        return {
          message: 'Таблицы в БД',
          tables: res.rows.map(r => r.table_name)
        };
      } finally {
        await client.end();
      }
    }
  @Get('debug/db-setup') // Изменили путь для чистоты
    async setupDatabase() {
      const db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      
      await db.connect();
      try {
        // 1. Убиваем старье
        await db.query(`
          DROP TABLE IF EXISTS screenshots CASCADE;
          DROP TABLE IF EXISTS client_logs CASCADE;
          DROP TABLE IF EXISTS sessions CASCADE;
          DROP TABLE IF EXISTS encryption_keys CASCADE;
          DROP TABLE IF EXISTS clients CASCADE;
          DROP TABLE IF EXISTS items CASCADE;
          DROP TABLE IF EXISTS telemetry_logs CASCADE;
          DROP TABLE IF EXISTS telemetry_clients CASCADE;
        `);

        // 2. Создаем новую чистую структуру
        await db.query(`
          CREATE EXTENSION IF NOT EXISTS "pgcrypto";

          CREATE TABLE telemetry_clients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_public_key_hash VARCHAR(64) NOT NULL UNIQUE,
            client_public_key TEXT NOT NULL,
            response_key_encrypted BYTEA NOT NULL,
            first_seen TIMESTAMPTZ DEFAULT NOW(),
            last_seen TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE telemetry_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID REFERENCES telemetry_clients(id) ON DELETE CASCADE,
            timestamp TIMESTAMPTZ NOT NULL,
            encrypted_payload BYTEA NOT NULL,
            payload_size INTEGER NOT NULL,
            received_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        return { status: 'success', message: 'Новая архитектура развернута' };
      } catch (err) {
        return { status: 'error', detail: err.message };
      } finally {
        await db.end();
      }
    }
}
