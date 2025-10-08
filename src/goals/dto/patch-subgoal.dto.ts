import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class PatchSubgoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

