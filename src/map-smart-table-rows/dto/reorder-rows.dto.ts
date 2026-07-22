import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsString, IsInt } from 'class-validator';

class RowOrder {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsInt()
  position: number;
}

export class ReorderRowsDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RowOrder)
  order: RowOrder[];
}
