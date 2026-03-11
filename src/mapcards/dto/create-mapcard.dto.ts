import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateMapCardDto {
  @IsNotEmpty()
  @IsNumber() // Заміни на IsString або IsUUID, якщо у вас card_id це текст
  card_id: number;
}
