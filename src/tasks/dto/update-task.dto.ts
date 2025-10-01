import { IsString, IsOptional, MaxLength, IsIn, IsDateString } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  topic?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['not_completed', 'completed', 'not_needed', 'half_completed', 'urgent'])
  status?: 'not_completed' | 'completed' | 'not_needed' | 'half_completed' | 'urgent';

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
