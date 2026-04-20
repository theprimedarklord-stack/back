import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Pool } from 'pg';
import * as crypto from 'crypto';

@Injectable()
export class TelemetryDatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private isConnected = false;

  constructor(private configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('TELEMETRY_DATABASE_URL');

    if (!databaseUrl) {
      console.warn('⚠️ TELEMETRY_DATABASE_URL не задан — телеметрия отключена');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false, // Для Render PostgreSQL
      },
      max: 20, // Максимум соединений в пуле
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async onModuleInit() {
    if (!this.pool) {
      console.warn('⚠️ Telemetry database pool не создан — пропуск инициализации');
      return;
    }

    // Проверка подключения при старте (не роняем сервер)
    try {
      await this.pool.query('SELECT NOW()');
      this.isConnected = true;
      console.log('✅ Telemetry database connected');
    } catch (error) {
      console.error('❌ Telemetry database connection failed (сервер продолжит работу):', error.message || error);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Проверка доступности телеметрии
   */
  isAvailable(): boolean {
    return this.isConnected && this.pool !== null;
  }

  /**
   * Получить пул соединений для выполнения запросов
   */
  getPool(): Pool | null {
    return this.pool;
  }

  /**
   * Выполнить запрос
   */
  async query(text: string, params?: any[]) {
    if (!this.pool || !this.isConnected) {
      console.warn('⚠️ Telemetry DB недоступна, запрос пропущен');
      return { rows: [], rowCount: 0 };
    }
    return this.pool.query(text, params);
  }

  /**
   * Сохранение маппинга клиента (публичный ключ -> зашифрованный response_key)
   */
  async saveClientMapping(
    clientPublicKey: string,
    encryptedResponseKey: Buffer,
  ): Promise<string> {
    const keyHash = crypto
      .createHash('sha256')
      .update(clientPublicKey)
      .digest('hex');

    const result = await this.query(
      `INSERT INTO telemetry_clients 
       (client_public_key_hash, client_public_key, response_key_encrypted)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_public_key_hash) 
       DO UPDATE SET 
         last_seen = NOW(),
         is_active = true
       RETURNING id`,
      [keyHash, clientPublicKey, encryptedResponseKey],
    );

    return result.rows[0].id;
  }

  /**
   * Получение клиента по публичному ключу
   */
  // async getClientByPublicKey(clientPublicKey: string): Promise<any | null> {
  //   const keyHash = crypto
  //     .createHash('sha256')
  //     .update(clientPublicKey)
  //     .digest('hex');

  //   const result = await this.query(
  //     `SELECT * FROM telemetry_clients WHERE client_public_key_hash = $1`,
  //     [keyHash],
  //   );

  //   return result.rows.length > 0 ? result.rows[0] : null;
  // }

  // /**
  //  * Обновление response_key для существующего клиента
  //  */
  // async updateClientResponseKey(
  //   clientId: string,
  //   encryptedResponseKey: Buffer,
  // ): Promise<void> {
  //   await this.query(
  //     `UPDATE telemetry_clients 
  //      SET response_key_encrypted = $1, last_seen = NOW(), is_active = true
  //      WHERE id = $2`,
  //     [encryptedResponseKey, clientId],
  //   );
  // }

  // /**
  //  * Сохранение зашифрованного payload
  //  */
  // async saveEncryptedPayload(
  //   clientId: string,
  //   timestamp: string,
  //   encryptedData: Buffer,
  // ): Promise<string> {
  //   const result = await this.query(
  //     `INSERT INTO telemetry_logs 
  //      (client_id, timestamp, encrypted_payload, payload_size)
  //      VALUES ($1, $2, $3, $4)
  //      RETURNING id`,
  //     [clientId, timestamp, encryptedData, encryptedData.length],
  //   );

  //   return result.rows[0].id;
  // }
}
