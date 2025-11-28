// src/suggestions/entities/suggestion.entity.ts

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';
export type EntityType = 'goal' | 'task' | 'subgoal';

export interface Suggestion {
  id: number;
  user_id: string;
  project_id: number;
  entity_type: EntityType;
  payload: any; // JSON object with goal/task/subgoal data
  source: string; // 'ai', 'manual', etc.
  model_used: string; // 'gemini-2.0-flash', etc.
  confidence: number | null; // 0.0 - 1.0
  status: SuggestionStatus;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSuggestionData {
  user_id: string;
  project_id: number;
  entity_type: EntityType;
  payload: any;
  source: string;
  model_used: string;
  confidence?: number | null;
  status?: SuggestionStatus;
}

