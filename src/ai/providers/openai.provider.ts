// src/ai/providers/openai.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AIProvider, AIProviderResponse } from './ai-provider.interface';
import { AISettings } from '../entities/ai-settings.entity';

@Injectable()
export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async generateContent(
    prompt: string,
    settings: AISettings
  ): Promise<AIProviderResponse> {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY не настроен');
    }

    let model = settings.model || 'gpt-3.5-turbo';
    
    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: settings.temperature || 0.7,
        max_tokens: settings.max_tokens || 2048,
      });

      const text = completion.choices[0]?.message?.content || '';
      const tokensUsed =
        completion.usage?.total_tokens || completion.usage?.prompt_tokens || 0;

      return { text, tokensUsed };
    } catch (error: any) {
      console.error('[OpenAI Provider] Error:', error);
      
      // Обработка ошибки 403 для gpt-4 с fallback на gpt-4o-mini
      const status = error?.status || error?.response?.status || error?.statusCode;
      if (status === 403 && model === 'gpt-4') {
        console.warn('[OpenAI Provider] gpt-4 недоступен, переключаюсь на gpt-4o-mini');
        model = 'gpt-4o-mini';
        
        // Повторяем запрос с новой моделью
        try {
          const completion = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: settings.temperature || 0.7,
            max_tokens: settings.max_tokens || 2048,
          });

          const text = completion.choices[0]?.message?.content || '';
          const tokensUsed =
            completion.usage?.total_tokens || completion.usage?.prompt_tokens || 0;

          return { text, tokensUsed };
        } catch (fallbackError: any) {
          console.error('[OpenAI Provider] Fallback также не удался:', fallbackError);
          throw new Error(`OpenAI API error: ${fallbackError.message}`);
        }
      }
      
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

