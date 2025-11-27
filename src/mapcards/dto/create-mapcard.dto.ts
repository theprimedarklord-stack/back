import { IsObject, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateMapCardDto {
  @IsObject()
  @IsNotEmpty()
  data_core: {
    nodes: any[];
    edges: any[];
    metadata: any;
    views: any;
  };

  @IsOptional()
  @IsNumber()
  card_id?: number | null;
}

