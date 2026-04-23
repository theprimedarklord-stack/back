import { IsNotEmpty, IsNumber, IsObject, IsOptional } from 'class-validator';

export class CreateMapCardDto {
  @IsOptional()
  @IsNumber()
  card_id?: number;

  @IsOptional()
  @IsObject()
  data_core?: {
    nodes: any[];
    edges: any[];
    metadata: any;
    views: any;
  };
}
