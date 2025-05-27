import { Injectable } from '@nestjs/common';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class DictionaryService {
  private readonly filePath = join(process.cwd(), 'src', 'test', 'levels.json');

  async saveDictionary(dictionary: any): Promise<void> {
    try {
      writeFileSync(this.filePath, JSON.stringify(dictionary, null, 2));
      console.log('Словарь сохранён в', this.filePath);
    } catch (error) {
      console.error('Ошибка сохранения словаря:', error);
      throw new Error(`Не удалось сохранить словарь: ${error.message}`);
    }
  }

  async getDictionary(): Promise<any> {
    try {
      const data = readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Ошибка чтения словаря:', error);
      return {
        levels: [],
        metadata: {
          total_texts_processed: 0,
          marker_index: 65536,
          total_savings: 0
        }
      };
    }
  }
}