import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn } from 'class-validator';

export class CreateCanvasNodeDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  map_card_id: string;

  @IsString()
  @IsIn(['notion', 'smart_table', 'info', 'runtime'])
  node_type: string;

  @IsArray()
  @IsOptional()
  content_blocks?: any[];

  @IsString()
  @IsOptional()
  title?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];
}
