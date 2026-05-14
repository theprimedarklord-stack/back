// src/organizations/dto/create-organization.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, Matches, IsNotIn } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(3, { message: 'Slug минимум 3 символа' })
  @MaxLength(32, { message: 'Slug максимум 32 символа' })
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Slug: только строчные буквы, цифры и дефис. Не может начинаться или заканчиваться дефисом.',
  })
  @IsNotIn(
    ['www', 'api', 'app', 'admin', 'mail', 'support', 'help',
     'billing', 'login', 'auth', 'static', 'cdn', 'media', 'assets'],
    { message: 'Это зарезервированное слово, выберите другой slug' },
  )
  slug: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}
