import { IsString } from 'class-validator';

export class InitTelemetryDto {
  @IsString()
  client_public_key: string; // PEM формат публичного RSA ключа клиента

  @IsString()
  timestamp: string; // ISO 8601 timestamp

  @IsString()
  hostname: string; // Hostname для валидации (опционально для whitelist)
}
