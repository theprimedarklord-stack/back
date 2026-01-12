import { IsOptional, IsString, IsNumber } from 'class-validator';

/**
 * DTO для system_info с белым списком полей
 * КРИТИЧНО: НИКАКИХ dynamic полей, eval, require, __proto__, constructor и т.д.
 */
export class SystemInfoDto {
  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsNumber()
  ram?: number;

  // БЕЛЫЙ СПИСОК полей - НИКАКИХ dynamic полей!
  // НИКАКИХ eval, require, __proto__, constructor и т.д.
}
