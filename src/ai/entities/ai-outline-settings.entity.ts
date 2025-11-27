// src/ai/entities/ai-outline-settings.entity.ts

export interface AIOutlineSettings {
  id?: number;
  user_id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  default_actions: AIOutlineDefaultActions;
  connections_enabled: boolean;
  auto_scroll: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AIOutlineDefaultActions {
  explain: boolean;
  summarize: boolean;
  translate: boolean;
  connections: boolean;
  create_card: boolean;
}

