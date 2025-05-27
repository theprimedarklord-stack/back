import { Controller, Post, Get, Body, HttpException, HttpStatus } from '@nestjs/common';
import { DictionaryService } from './dictionary.service';

@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Post('save')
  async saveDictionary(@Body() dictionary: any): Promise<{ message: string }> {
    try {
      await this.dictionaryService.saveDictionary(dictionary);
      return { message: 'Словарь успешно сохранён' };
    } catch (error) {
      console.error('Ошибка в saveDictionary:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get()
  async getDictionary(): Promise<any> {
    try {
      return await this.dictionaryService.getDictionary();
    } catch (error) {
      console.error('Ошибка в getDictionary:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}