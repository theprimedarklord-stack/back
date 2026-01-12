import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class TelemetryAuthService {
  private readonly signatureSalt: string;
  private readonly allowedHosts: string[];
  private readonly timestampTtl: number;
  private readonly ipSalt: string;

  constructor(private configService: ConfigService) {
    this.signatureSalt = this.configService.get<string>('SIGNATURE_SALT') || '';
    const allowedHostsStr = this.configService.get<string>('ALLOWED_HOSTS') || '';
    this.allowedHosts = allowedHostsStr ? allowedHostsStr.split(',') : [];
    this.timestampTtl = parseInt(
      this.configService.get<string>('TELEMETRY_TIMESTAMP_TTL', '300000'),
      10,
    ); // 5 минут по умолчанию
    this.ipSalt = this.configService.get<string>('IP_SALT') || '';

    if (!this.signatureSalt) {
      throw new Error('SIGNATURE_SALT is required');
    }
  }

  /**
   * Проверка timestamp с допуском ±5 минут (защита от рассинхронизации часов)
   */
  validateTimestamp(timestamp: string): boolean {
    const serverTime = Date.now();
    const clientTime = new Date(timestamp).getTime();
    const diff = Math.abs(serverTime - clientTime);

    // Допуск 5 минут вперед/назад + проверка формата ISO 8601
    const MAX_DIFF = this.timestampTtl; // 5 минут в миллисекундах
    const isValidFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timestamp);

    return diff <= MAX_DIFF && isValidFormat && !isNaN(clientTime);
  }

  /**
   * Верификация ротационного токена
   * Ожидаемый токен = SHA256(timestamp + SIGNATURE_SALT + hostname).substring(0, 32)
   */
  verifyClientToken(
    token: string,
    timestamp: string,
    hostname: string,
  ): boolean {
    if (!token || !timestamp || !hostname) {
      return false;
    }

    const expectedToken = crypto
      .createHash('sha256')
      .update(timestamp + this.signatureSalt + hostname)
      .digest('hex')
      .substring(0, 32);

    // Timing-safe сравнение
    if (token.length !== expectedToken.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken),
    );
  }

  /**
   * HMAC-SHA256 проверка сигнатуры с timing-safe сравнением
   */
  validateSignature(payload: any): boolean {
    if (!payload || !payload.data_signature) {
      return false;
    }

    // Извлекаем сигнатуру из payload
    const { data_signature, ...payloadWithoutSig } = payload;

    // Сортируем ключи JSON для консистентности
    const sortedStr = JSON.stringify(
      payloadWithoutSig,
      Object.keys(payloadWithoutSig).sort(),
    );

    // Генерируем ожидаемую подпись
    const expectedSignature = crypto
      .createHmac('sha256', this.signatureSalt)
      .update(sortedStr)
      .digest('hex');

    // Timing-safe сравнение
    if (data_signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(data_signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Проверка whitelist hostname (SHA256 хэши из ALLOWED_HOSTS)
   */
  isHostnameAllowed(hostname: string): boolean {
    if (this.allowedHosts.length === 0) {
      // Если whitelist не задан, разрешаем всем
      return true;
    }

    const hostnameHash = crypto
      .createHash('sha256')
      .update(hostname)
      .digest('hex');

    return this.allowedHosts.includes(hostnameHash);
  }

  /**
   * Хэширование IP адреса
   */
  hashIpAddress(ip: string): string {
    return crypto
      .createHash('sha256')
      .update(ip + this.ipSalt)
      .digest('hex');
  }

  /**
   * Извлечение IP и User-Agent из запроса
   * IP: приоритет x-forwarded-for (первый IP), затем x-real-ip, затем req.socket.remoteAddress
   */
  extractClientInfo(req: Request): { ip: string; userAgent: string } {
    // Извлечение IP с приоритетом x-forwarded-for
    let ip = req.headers['x-forwarded-for'] as string;
    if (ip) {
      // x-forwarded-for может содержать несколько IP через запятую
      ip = ip.split(',')[0].trim();
    } else {
      ip = (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || '';
    }

    const userAgent = (req.headers['user-agent'] as string) || '';

    return { ip, userAgent };
  }

  /**
   * Валидация публичного RSA ключа клиента
   * Проверяет тип ключа (RSA) и минимальную длину (2048 бит)
   */
  validatePublicKey(publicKeyPem: string): boolean {
    try {
      // Пробуем загрузить ключ
      const key = crypto.createPublicKey(publicKeyPem);

      // Проверяем что это RSA с достаточной длиной
      if (key.asymmetricKeyType !== 'rsa') {
        return false;
      }

      // Проверяем длину (минимум 2048 бит)
      const keySize = key.asymmetricKeySize;
      return keySize !== undefined && keySize >= 2048;
    } catch {
      return false;
    }
  }
}
