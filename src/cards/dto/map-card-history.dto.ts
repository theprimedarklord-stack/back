import { IsNotEmpty, IsString, IsObject, IsOptional } from 'class-validator';

export class RecordOperationDto {
  @IsNotEmpty()
  @IsString()
  operationType: string;

  @IsNotEmpty()
  @IsObject()
  operationData: any;

  @IsOptional()
  @IsObject()
  previousState?: any;
}

export class HistoryEntryDto {
  id: number;
  version: number;
  operationType: string;
  operationData: any;
  createdAt: Date;
}
