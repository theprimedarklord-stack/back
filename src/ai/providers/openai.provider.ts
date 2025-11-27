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

    try {
      const model = settings.model || 'gpt-3.5-turbo';
      
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
    } catch (error) {
      console.error('[OpenAI Provider] Error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

