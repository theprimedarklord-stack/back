import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength, IsIn, IsObject } from 'class-validator';

export class AddSubgoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsBoolean()
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

