// src/ai/dto/ai-settings.dto.ts
import { IsOptional, IsBoolean, IsString, IsNumber, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAISettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  recommendations_count?: number;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsObject()
  context?: {
    considerExistingTasks?: boolean;
    considerHistory?: boolean;
    considerCurrentGoals?: boolean;
    considerDeadlines?: boolean;
    considerPriorities?: boolean;
  };

  @IsOptional()
  @IsObject()
  format?: {
    detailLevel?: 'brief' | 'medium' | 'detailed';
    includeExamples?: boolean;
    includeTimeEstimates?: boolean;
  };

  @IsOptional()
  @IsObject()
  recommendation_type?: {
    tasks?: boolean;
    subgoals?: boolean;
    steps?: boolean;
  };
}
