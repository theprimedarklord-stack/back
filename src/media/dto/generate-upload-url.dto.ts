import { IsString, IsNotEmpty, IsNumber, Max, Matches, IsIn } from 'class-validator';

export class GenerateUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsString()
  @IsNotEmpty()
  mapCardId: string;

  @IsNumber()
  @Max(10 * 1024 * 1024, { message: 'Размер файла не должен превышать 10 МБ' })
  sizeBytes: number;
}
