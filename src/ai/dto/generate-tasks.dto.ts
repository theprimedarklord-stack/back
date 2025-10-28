import { IsNumber, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class GenerateTasksForGoalDto {
  @IsNumber()
  goal_id: number;

  @IsNumber()
  project_id: number;

  @IsOptional()
  @IsObject()
  settings?: {
    count?: number;
    include_subgoals?: boolean;
  };
}

