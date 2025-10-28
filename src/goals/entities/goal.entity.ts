// src/goals/entities/goal.entity.ts

export type GoalCategory = 'technical' | 'organizational' | 'personal' | 'learning' | 'business';
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Subgoal {
  id: number;
  goal_id: number;
  text: string;
  completed: boolean;
  created_at: string;
  generated_by?: 'ai' | 'manual';
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
  };
}

export interface Goal {
  id: number;
  user_id: string;
  title: string;
  description: string;
  keywords: string[];
  category: GoalCategory;
  priority: GoalPriority;
  deadline: string | null;
  project_id?: number | null;
  created_at: string;
  updated_at: string;
  goal_subgoals?: Subgoal[];
  generated_by?: 'ai' | 'manual';
  confidence?: number;
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_project_id?: number;
  };
}

export interface CreateGoalData {
  title: string;
  description: string;
  keywords?: string[];
  category?: GoalCategory;
  priority?: GoalPriority;
  deadline?: string;
  project_id?: number;
  subgoals?: { text: string; completed?: boolean; generated_by?: 'ai' | 'manual'; ai_metadata?: any }[];
  generated_by?: 'ai' | 'manual';
  confidence?: number;
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_project_id?: number;
  };
}

export interface UpdateGoalData {
  title?: string;
  description?: string;
  keywords?: string[];
  category?: GoalCategory;
  priority?: GoalPriority;
  deadline?: string;
  project_id?: number;
  subgoals?: { text: string; completed?: boolean; generated_by?: 'ai' | 'manual'; ai_metadata?: any }[];
  generated_by?: 'ai' | 'manual';
  confidence?: number;
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_project_id?: number;
  };
}

