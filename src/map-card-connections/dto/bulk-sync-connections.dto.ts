import { IsNumber, IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkSyncConnectionsDto {
  @IsNumber()
  mapCardId: number;

  @IsArray()
  @IsString({ each: true })
  targetTitles: string[];
}
