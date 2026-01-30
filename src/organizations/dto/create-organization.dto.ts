// src/organizations/dto/create-organization.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}
