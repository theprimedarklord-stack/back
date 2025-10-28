// src/suggestions/dto/create-suggestion.dto.ts
import { IsNotEmpty, IsNumber, IsString, IsOptional, IsObject, Min, Max } from 'class-validator';

export class CreateSuggestionDto {
  @IsNotEmpty()
  @IsNumber()
  project_id: number;

  @IsNotEmpty()
  @IsString()
  entity_type: 'goal' | 'task' | 'subgoal';

  @IsNotEmpty()
  @IsObject()
  payload: any;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  model_used?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class SaveSuggestionsDto {
  @IsNotEmpty()
  @IsNumber()
  project_id: number;

  @IsNotEmpty()
  goals: any[];

  @IsOptional()
  @IsString()
  entity_type?: string;
}

