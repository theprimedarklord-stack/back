import { IsString, IsOptional, IsArray, IsIn, IsObject } from 'class-validator';

export class UpdateTableRowDto {
  @IsOptional()
  @IsObject()
  properties?: Record<string, any>;

  @IsOptional()
  @IsArray()
  content_blocks?: any[];

  @IsOptional()
  @IsString()
  content_text?: string;

  @IsOptional()
  @IsString()
  @IsIn(['compact', 'normal', 'large'])
  height?: string;
}
