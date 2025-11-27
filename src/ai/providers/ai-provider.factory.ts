// src/ai/providers/ai-provider.factory.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, AIProviderType } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';

@Injectable()
export class AIProviderFactory {
  private geminiProvider: GeminiProvider;
  private openaiProvider: OpenAIProvider | null = null;
  private anthropicProvider: AnthropicProvider | null = null;

  constructor(private readonly configService: ConfigService) {
    // Инициализируем Gemini провайдер (всегда доступен)
    this.geminiProvider = new GeminiProvider(this.configService);

    // Ленивая инициализация других провайдеров
    try {
      if (this.configService.get<string>('OPENAI_API_KEY')) {
        this.openaiProvider = new OpenAIProvider(this.configService);
      }
    } catch (error) {
      console.warn('[AI Provider Factory] OpenAI provider not available:', error.message);
    }

    try {
      if (this.configService.get<string>('ANTHROPIC_API_KEY')) {
        this.anthropicProvider = new AnthropicProvider(this.configService);
      }
    } catch (error) {
      console.warn('[AI Provider Factory] Anthropic provider not available:', error.message);
    }
  }

  /**
   * Получить провайдер по типу с fallback на Gemini
   */
  getProvider(providerType: AIProviderType): AIProvider {
    switch (providerType) {
      case 'gemini':
        return this.geminiProvider;

      case 'openai':
        if (!this.openaiProvider) {
          console.warn('[AI Provider Factory] OpenAI not available, falling back to Gemini');
          return this.geminiProvider;
        }
        return this.openaiProvider;

      case 'anthropic':
        if (!this.anthropicProvider) {
          console.warn('[AI Provider Factory] Anthropic not available, falling back to Gemini');
          return this.geminiProvider;
        }
        return this.anthropicProvider;

      default:
        console.warn(`[AI Provider Factory] Unknown provider type: ${providerType}, using Gemini`);
        return this.geminiProvider;
    }
  }

  /**
   * Проверить доступность провайдера
   */
  isProviderAvailable(providerType: AIProviderType): boolean {
    switch (providerType) {
      case 'gemini':
        return true;
      case 'openai':
        return this.openaiProvider !== null;
      case 'anthropic':
        return this.anthropicProvider !== null;
      default:
        return false;
    }
  }
}

