// src/org-projects/dto/update-org-project.dto.ts
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateOrgProjectDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}
