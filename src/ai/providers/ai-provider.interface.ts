// src/ai/providers/ai-provider.interface.ts
import { AISettings } from '../entities/ai-settings.entity';

export interface AIProviderResponse {
  text: string;
  tokensUsed: number;
}

export interface AIProvider {
  /**
   * Генерирует контент на основе промпта и настроек
   */
  generateContent(
    prompt: string,
    settings: AISettings
  ): Promise<AIProviderResponse>;
}

export type AIProviderType = 'gemini' | 'openai' | 'anthropic';

