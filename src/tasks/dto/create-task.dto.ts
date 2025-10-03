import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StatusHistoryEntryDto {
  @IsString()
  @IsIn(['not_completed', 'completed', 'not_needed', 'half_completed', 'urgent'])
  status: 'not_completed' | 'completed' | 'not_needed' | 'half_completed' | 'urgent';

  @IsDateString()
  timestamp: string;

  @IsString()
  @IsIn(['created', 'status_changed'])
  action: 'created' | 'status_changed';
}

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
  @Type(() => StatusHistoryEntryDto)
  status_history?: StatusHistoryEntryDto[];
}
