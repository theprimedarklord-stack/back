import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class AddSubgoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

