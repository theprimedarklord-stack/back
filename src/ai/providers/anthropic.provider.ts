// src/ai/providers/anthropic.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderResponse } from './ai-provider.interface';
import { AISettings } from '../entities/ai-settings.entity';

@Injectable()
export class AnthropicProvider implements AIProvider {
  private client: Anthropic | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async generateContent(
    prompt: string,
    settings: AISettings
  ): Promise<AIProviderResponse> {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY не настроен');
    }

    try {
      const model = settings.model || 'claude-3-5-sonnet-20241022';

      const message = await this.client.messages.create({
        model,
        max_tokens: settings.max_tokens || 2048,
        temperature: settings.temperature || 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      const text =
        message.content
          .filter((block) => block.type === 'text')
          .map((block) => (block as Anthropic.TextBlock).text)
          .join('') || '';

      const tokensUsed = message.usage.input_tokens + message.usage.output_tokens;

      return { text, tokensUsed };
    } catch (error) {
      console.error('[Anthropic Provider] Error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}

