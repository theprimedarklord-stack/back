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
      model: settings.model || 'gemini-2.0-flash-exp',
    });

    const generationConfig = {
      temperature: settings.temperature || 0.7,
      maxOutputTokens: settings.max_tokens || 2048,
    };

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });

    const response = result.response;
    const text = response.text();
    const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

    return { text, tokensUsed };
  }
}

