import { IsString, IsOptional, IsArray, IsIn, IsDateString, ValidateNested, MaxLength, IsNotEmpty, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSubgoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsOptional()
  completed?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ai', 'manual'])
  generated_by?: 'ai' | 'manual';

  @IsOptional()
  @IsObject()
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
  };
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['technical', 'organizational', 'personal', 'learning', 'business'])
  category?: 'technical' | 'organizational' | 'personal' | 'learning' | 'business';

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSubgoalDto)
  subgoals?: UpdateSubgoalDto[];

  @IsOptional()
  project_id?: number;

  @IsOptional()
  @IsString()
  @IsIn(['ai', 'manual'])
  generated_by?: 'ai' | 'manual';

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsObject()
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_project_id?: number;
  };
}

