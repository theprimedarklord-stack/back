import { IsNumber, IsArray, IsString, IsOptional } from 'class-validator';

export class BulkSyncConnectionsDto {
  @IsNumber()
  mapCardId: number;

  /**
   * Цілі, обрані з автодоповнення: id вже відомий на момент вставки посилання.
   * Основний шлях — перейменування картки таких зв'язків не рве.
   */
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  targetIds?: number[];

  /**
   * Цілі, набрані руками як `[[Назва]]`: id взяти нізвідки, шукаємо за title.
   * Запасний шлях, лишається заради сумісності зі старими документами.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetTitles?: string[];
}
