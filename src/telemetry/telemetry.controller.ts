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

    // ШАГ 3: Валидация timestamp
    if (!this.authService.validateTimestamp(body.timestamp)) {
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // ШАГ 4: Валидация публичного ключа
    if (!this.authService.validatePublicKey(body.client_public_key)) {
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // ШАГ 5: Валидация hostname (если нужен whitelist)
    if (!this.authService.isHostnameAllowed(body.hostname || '')) {
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

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
      // Сохраняем в отдельную таблицу в Render PostgreSQL
      await this.telemetryService.databaseService.query(
        `INSERT INTO fake_analytics_logs (data, received_at) VALUES ($1, $2)`,
        [JSON.stringify(body), new Date().toISOString()],
      );

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
      // Проверка подключения к Render PostgreSQL
      await this.telemetryService.databaseService.query('SELECT 1');

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
}
