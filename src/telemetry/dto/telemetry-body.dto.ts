import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FrontendDataDto } from './frontend-data.dto';

/**
 * DTO для body параметра в receiveTelemetry эндпоинте
 */
export class TelemetryBodyDto {
  @IsString()
  client_id: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FrontendDataDto)
  frontend_data?: FrontendDataDto;
}
