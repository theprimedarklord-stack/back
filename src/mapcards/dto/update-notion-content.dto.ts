import { IsArray, IsString, IsNumber } from 'class-validator';

export class UpdateNotionContentDto {
  @IsArray()
  blocks: any[];

  @IsString()
  text: string;

  @IsNumber()
  expectedVersion: number;
}
