import { IsNumber, IsObject, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GenerationSettingsDto {
  @IsBoolean()
  generate_goals: boolean;

  @IsObject()
  goals_count: { min: number; max: number };

  @IsBoolean()
  generate_tasks: boolean;

  @IsObject()
  tasks_per_goal: { min: number; max: number };

  @IsBoolean()
  generate_subgoals: boolean;

  @IsBoolean()
  calculate_deadlines: boolean;

  @IsBoolean()
  determine_priorities: boolean;

  @IsIn(['brief', 'moderate', 'detailed'])
  detail_level: 'brief' | 'moderate' | 'detailed';
}

export class GenerateFullStructureDto {
  @IsNumber()
  project_id: number;

  @ValidateNested()
  @Type(() => GenerationSettingsDto)
  settings: GenerationSettingsDto;
}

