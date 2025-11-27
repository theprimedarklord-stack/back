// src/ai/entities/ai-chat-settings.entity.ts

export interface AIChatSettings {
  id?: number;
  user_id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  max_tokens: number;
  created_at?: string;
  updated_at?: string;
}

