import { IsString } from 'class-validator';

export class TelemetryDataDto {
  @IsString()
  client_id: string; // UUID клиента из init запроса

  @IsString()
  data: string; // base64 зашифрованных данных (AES-GCM с response_key)

  @IsString()
  timestamp: string; // ISO 8601 timestamp
}
