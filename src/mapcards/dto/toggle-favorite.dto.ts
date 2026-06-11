import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleFavoriteDto {
  @IsBoolean()
  @IsNotEmpty()
  isFavorite: boolean;
}
