import { IsOptional, IsBoolean, IsNumber, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSidebarSettingsDto {
  @IsOptional()
  @IsBoolean()
  sidebar_pinned?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(150)
  @Max(700)
  @Type(() => Number)
  sidebar_width?: number;

  @IsOptional()
  @IsString()
  @IsIn(['indicator', 'simple'])
  on_this_page_display_mode?: string;
}


