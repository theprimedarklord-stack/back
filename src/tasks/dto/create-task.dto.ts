import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  topic: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  @IsIn(['not_completed', 'completed', 'not_needed', 'half_completed', 'urgent'])
  status?: 'not_completed' | 'completed' | 'not_needed' | 'half_completed' | 'urgent';
}
