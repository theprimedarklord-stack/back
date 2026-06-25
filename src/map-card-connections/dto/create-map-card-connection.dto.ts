import { IsNumber, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateMapCardConnectionDto {
  @IsNumber()
  source_map_card_id: number;

  @IsNumber()
  target_map_card_id: number;

  @IsString()
  @IsOptional()
  connection_type?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
