import { IsNumber, IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ConnectionItem {
  @IsNumber()
  source_map_card_id: number;

  @IsNumber()
  target_map_card_id: number;

  @IsString()
  @IsOptional()
  connection_type?: string;
}

export class BulkSyncConnectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConnectionItem)
  connections: ConnectionItem[];
}
