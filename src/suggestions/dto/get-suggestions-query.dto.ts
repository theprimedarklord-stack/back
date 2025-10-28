// src/suggestions/dto/get-suggestions-query.dto.ts
import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSuggestionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  project_id?: number;

  @IsOptional()
  @IsString()
  entity_type?: 'goal' | 'task' | 'subgoal';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  target_count?: number;

  @IsOptional()
  @IsString()
  auto_fill?: string; // 'true' or 'false'
}

