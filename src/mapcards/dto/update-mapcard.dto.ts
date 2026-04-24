import { IsObject, IsOptional, IsNumber, IsString } from 'class-validator';

export class UpdateMapCardDto {
  @IsOptional()
  @IsObject()
  data_core?: {
    nodes: any[];
    edges: any[];
    metadata: any;
    views: any;
  };

  @IsOptional()
  @IsNumber()
  card_id?: number | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  tags?: string | null;

  @IsOptional()
  @IsString()
  aliases?: string | null;

  @IsOptional()
  @IsString()
  note_type?: string | null;

  @IsOptional()
  @IsString()
  manual_links?: string | null;

  @IsOptional()
  @IsString()
  main_idea?: string | null;

  @IsOptional()
  @IsString()
  own_understanding?: string | null;

  @IsOptional()
  @IsString()
  created_date?: string | null;

  @IsOptional()
  @IsString()
  source?: string | null;
}
