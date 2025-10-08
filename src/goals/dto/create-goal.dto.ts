import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn, IsDateString, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubgoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsOptional()
  completed?: boolean;
}

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

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
  @Type(() => CreateSubgoalDto)
  subgoals?: CreateSubgoalDto[];
}

