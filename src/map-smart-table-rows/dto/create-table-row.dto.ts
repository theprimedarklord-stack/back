import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn, IsObject } from 'class-validator';

export class CreateTableRowDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  table_node_id: string;

  @IsString()
  @IsNotEmpty()
  map_card_id: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, any>;

  @IsOptional()
  @IsArray()
  content_blocks?: any[];

  @IsOptional()
  @IsString()
  @IsIn(['compact', 'normal', 'large'])
  height?: string;
}
