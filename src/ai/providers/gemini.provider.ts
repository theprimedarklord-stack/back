// src/ai/providers/gemini.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, AIProviderResponse } from './ai-provider.interface';
import { AISettings } from '../entities/ai-settings.entity';

@Injectable()
export class GeminiProvider implements AIProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateContent(
    prompt: string,
    settings: AISettings
  ): Promise<AIProviderResponse> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY не настроен');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: settings.model || 'gemini-2.0-flash',
    });

    const generationConfig = {
      temperature: settings.temperature || 0.7,
      maxOutputTokens: settings.max_tokens || 2048,
    };

    // Добавляем таймаут 60 секунд
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Gemini API request timeout after 60 seconds'));
      }, 60000);
    });

    try {
      const requestPromise = model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });

      const result = await Promise.race([requestPromise, timeoutPromise]);
      const response = result.response;
      const text = response.text();
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return { text, tokensUsed };
    } catch (error: any) {
      console.error('[Gemini Provider] Error:', error);
      
      // Обработка таймаута
      if (error.message && error.message.includes('timeout')) {
        throw new Error('Gemini API request timeout');
      }
      
      // Обработка ошибки 429 (Quota Exceeded)
      const status = error?.status || error?.statusCode || error?.response?.status;
      if (status === 429) {
        throw new Error('Gemini API quota exceeded. Please try again later or use a different model.');
      }
      
      // Проверка сообщения об ошибке квоты (на случай если статус не определен)
      if (error.message && (
        error.message.toLowerCase().includes('quota') ||
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('429')
      )) {
        throw new Error('Gemini API quota exceeded. Please try again later or use a different model.');
      }
      
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}

