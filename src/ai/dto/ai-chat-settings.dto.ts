// src/ai/dto/ai-chat-settings.dto.ts
import { IsOptional, IsString, IsNumber, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAIChatSettingsDto {
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
  @IsNumber()
  @Min(1)
  @Max(8192)
  @Type(() => Number)
  max_tokens?: number;
}

