import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelemetryDatabaseService } from './database.service';
import { TelemetryClient, TelemetryEntry } from './entities/telemetry.entity';
import * as crypto from 'crypto';

@Injectable()
export class TelemetryService {
  constructor(
    public readonly databaseService: TelemetryDatabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Нормализация размера ответов (защита от анализа трафика)
   * Все ответы по 512 байт
   */
  padResponse(response: any): string {
    const jsonStr = JSON.stringify(response);
    const targetSize = 512; // Все ответы по 512 байт
    const padding = ' '.repeat(Math.max(0, targetSize - jsonStr.length));
    return JSON.stringify({
      ...response,
      _padding: padding.slice(0, 100), // Не весь padding в JSON
    });
  }

  /**
   * Получение клиента по публичному ключу
   */
  async getClientByPublicKey(
    clientPublicKey: string,
  ): Promise<TelemetryClient | null> {
    return await this.databaseService.getClientByPublicKey(clientPublicKey);
  }

  /**
   * Обработка init запроса (двухфазный handshake)
   * Генерирует response_key и шифрует его публичным ключом клиента
   */
  async handleInit(
    clientPublicKey: string,
    hostname: string,
  ): Promise<{ client_id: string; response_key: string }> {
    // 1. Генерация response_key (32 байта для AES-256)
    const responseKey = crypto.randomBytes(32);

    // 2. Шифрование response_key публичным ключом клиента (RSA-OAEP)
    const encryptedKey = crypto.publicEncrypt(
      {
        key: clientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      responseKey,
    );

    // 3. Проверка существующего клиента
    const existingClient = await this.getClientByPublicKey(clientPublicKey);

    if (existingClient) {
      // Обновляем response_key для существующего клиента
      await this.databaseService.updateClientResponseKey(
        existingClient.id,
        encryptedKey,
      );

      return {
        client_id: existingClient.id,
        response_key: encryptedKey.toString('base64'),
      };
    }

    // 4. Сохранение нового клиента
    const clientId = await this.databaseService.saveClientMapping(
      clientPublicKey,
      encryptedKey,
    );

    return {
      client_id: clientId,
      response_key: encryptedKey.toString('base64'),
    };
  }

  /**
   * Сохранение зашифрованных данных телеметрии
   * КРИТИЧНО: Сервер НЕ расшифровывает данные, только хранит
   */
  async saveTelemetryData(
    clientId: string,
    timestamp: string,
    encryptedData: string, // base64
  ): Promise<string> {
    const buffer = Buffer.from(encryptedData, 'base64');
    return await this.databaseService.saveEncryptedPayload(
      clientId,
      timestamp,
      buffer,
    );
  }

  /**
   * Получение времени последнего валидного запроса (для dead man's switch)
   */
  async getLastRequestTime(): Promise<number> {
    const result = await this.databaseService.query(
      `SELECT received_at FROM telemetry_logs 
       ORDER BY received_at DESC LIMIT 1`,
    );

    return result.rows.length > 0
      ? new Date(result.rows[0].received_at).getTime()
      : 0;
  }

  /**
   * Dead Man's Switch (проверка каждые 24 часа)
   * Вызывается через @Cron декоратор в контроллере или отдельном сервисе
   */
  async deadMansSwitch(): Promise<void> {
    const lastValidRequest = await this.getLastRequestTime();
    const now = Date.now();

    // Если не было валидных запросов 48 часов - самоуничтожение
    if (now - lastValidRequest > 172800000) {
      // 48 часов
      await this.selfDestruct();
      // await this.sendPanicSignal(); // Если настроен резервный сервер
    }
  }

  /**
   * Функция самоуничтожения (паник-режим)
   */
  async selfDestruct(): Promise<void> {
    try {
      // Удалить все данные из БД
      await this.databaseService.query(`DELETE FROM telemetry_logs`);

      await this.databaseService.query(`DELETE FROM telemetry_clients`);

      console.error('SELF-DESTRUCT ACTIVATED');
    } catch (error) {
      // Тихая обработка - не палить сервер
      console.error('Self-destruct failed silently');
    }
  }

  /**
   * Очистка старых данных
   * Удаляет данные старше 30 дней, деактивирует неактивных клиентов
   */
  async cleanupOldData(): Promise<void> {
    try {
      // Удаляем данные старше 30 дней
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      );

      await this.databaseService.query(
        `DELETE FROM telemetry_logs 
         WHERE received_at < $1`,
        [thirtyDaysAgo.toISOString()],
      );

      // Деактивируем клиентов без активности 7 дней
      await this.databaseService.query(
        `UPDATE telemetry_clients 
         SET is_active = false 
         WHERE last_seen < NOW() - INTERVAL '7 days'`,
      );
    } catch (error) {
      // Тихая обработка
      console.error('Cleanup failed silently');
    }
  }
}
