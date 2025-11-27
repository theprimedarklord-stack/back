// src/ai/dto/chat.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsIn, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

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

