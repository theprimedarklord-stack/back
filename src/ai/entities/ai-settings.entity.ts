// src/ai/entities/ai-settings.entity.ts

export interface AISettings {
  id?: number;
  user_id: string;
  enabled: boolean;
  provider?: 'gemini' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  max_tokens: number;
  recommendations_count: number;
  language: string;
  context: AIContext;
  format: AIFormat;
  recommendation_type: AIRecommendationType;
  created_at?: string;
  updated_at?: string;
}

export interface AIContext {
  considerExistingTasks: boolean;
  considerHistory: boolean;
  considerCurrentGoals: boolean;
  considerDeadlines: boolean;
  considerPriorities: boolean;
}

export interface AIFormat {
  detailLevel: 'brief' | 'medium' | 'detailed';
  includeExamples: boolean;
  includeTimeEstimates: boolean;
}

export interface AIRecommendationType {
  tasks: boolean;
  subgoals: boolean;
  steps: boolean;
}

export interface AIRecommendation {
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedTime?: string;
  example?: string;
  type: 'task' | 'subgoal' | 'step';
}

export interface AIRecommendationsCache {
  id?: number;
  user_id: string;
  goal_id: number;
  cache_key: string;
  recommendations: AIRecommendation[];
  context_hash: string;
  model_used: string;
  tokens_used?: number;
  created_at?: string;
  expires_at: string;
}

export interface GenerateRecommendationsRequest {
  goal_id: number;
  force_refresh?: boolean;
}

export interface GenerateRecommendationsResponse {
  success: boolean;
  recommendations: AIRecommendation[];
  cached: boolean;
  tokensUsed?: number;
  modelUsed?: string;
}
