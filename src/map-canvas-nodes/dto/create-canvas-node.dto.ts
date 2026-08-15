import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn } from 'class-validator';
import { CANVAS_NODE_TYPES } from '../canvas-node-types';

export class CreateCanvasNodeDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  map_card_id: string;

  @IsString()
  @IsIn([...CANVAS_NODE_TYPES])
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
