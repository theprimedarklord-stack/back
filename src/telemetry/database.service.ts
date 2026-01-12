import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Pool } from 'pg';
import * as crypto from 'crypto';

@Injectable()
export class TelemetryDatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(private configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('TELEMETRY_DATABASE_URL');
    
    if (!databaseUrl) {
      throw new Error('TELEMETRY_DATABASE_URL is required for telemetry module');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false, // Для Render PostgreSQL
      },
      max: 20, // Максимум соединений в пуле
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async onModuleInit() {
    // Проверка подключения при старте
    try {
      await this.pool.query('SELECT NOW()');
      console.log('✅ Telemetry database connected');
    } catch (error) {
      console.error('❌ Telemetry database connection failed:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Получить пул соединений для выполнения запросов
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Выполнить запрос
   */
  async query(text: string, params?: any[]) {
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
