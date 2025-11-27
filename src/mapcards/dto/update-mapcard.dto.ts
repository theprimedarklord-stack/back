import { IsObject, IsOptional, IsNumber } from 'class-validator';

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
}

