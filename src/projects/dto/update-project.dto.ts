import { IsString, IsOptional, IsArray, IsIn, IsDateString, MaxLength } from 'class-validator';

export class UpdateProjectDto {
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
  @IsIn(['technical', 'business', 'personal', 'learning'])
  category?: 'technical' | 'business' | 'personal' | 'learning';

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsString()
  @IsIn(['active', 'completed', 'on_hold', 'cancelled'])
  status?: 'active' | 'completed' | 'on_hold' | 'cancelled';

  @IsOptional()
  @IsDateString()
  deadline?: string;
}

