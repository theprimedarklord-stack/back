import { IsOptional, IsString } from 'class-validator';

/**
 * DTO для метаданных жертвы из frontend_data
 */
export class FrontendDataDto {
  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsString()
  mac?: string;

  @IsOptional()
  @IsString()
  os?: string;

  [key: string]: any; // Дополнительные поля могут быть динамическими
}
