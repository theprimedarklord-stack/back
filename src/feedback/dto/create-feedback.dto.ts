import { IsString, IsIn, IsOptional, MaxLength, IsObject } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @IsIn(['bug', 'idea', 'other'])
  type: string;

  @IsString()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
