import { IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class GenerateGoalsForProjectDto {
  @IsNumber()
  project_id: number;

  @IsOptional()
  @IsArray()
  existing_goals?: any[];

  @IsOptional()
  @IsNumber()
  count?: number; // default 3-5

  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}

