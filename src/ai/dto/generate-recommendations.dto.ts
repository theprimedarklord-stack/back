// src/ai/dto/generate-recommendations.dto.ts
import { IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateRecommendationsDto {
  @IsNumber()
  @Type(() => Number)
  goal_id: number;

  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}
