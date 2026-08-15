import { IsArray, IsString, IsNumber } from 'class-validator';

export class UpdateMultiNodeContentDto {
  @IsArray()
  blocks: any[];

  @IsString()
  text: string;

  @IsNumber()
  expectedVersion: number;
}
