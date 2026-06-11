import { IsObject, IsOptional } from 'class-validator';

export class UpdateMapCardCanvasDto {
  @IsObject()
  @IsOptional()
  dataCore?: Record<string, unknown>;
}
