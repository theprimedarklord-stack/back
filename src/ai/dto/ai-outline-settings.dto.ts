// src/ai/dto/ai-outline-settings.dto.ts
import { IsOptional, IsString, IsNumber, IsBoolean, IsObject, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAIOutlineSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['gemini', 'openai', 'anthropic'])
  provider?: 'gemini' | 'openai' | 'anthropic';

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(2.0)
  @Type(() => Number)
  temperature?: number;

  @IsOptional()
  @IsObject()
  default_actions?: {
    explain?: boolean;
    summarize?: boolean;
    translate?: boolean;
    connections?: boolean;
    create_card?: boolean;
  };

  @IsOptional()
  @IsBoolean()
  connections_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  auto_scroll?: boolean;
}

