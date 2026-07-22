import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateCanvasNodeDto {
  @IsArray()
  @IsOptional()
  content_blocks?: any[];

  @IsString()
  @IsOptional()
  content_text?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];
}
