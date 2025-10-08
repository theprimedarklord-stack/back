// src/goals/entities/goal.entity.ts

export type GoalCategory = 'technical' | 'organizational' | 'personal' | 'learning' | 'business';
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Subgoal {
  id: number;
  goal_id: number;
  text: string;
  completed: boolean;
  created_at: string;
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
  created_at: string;
  updated_at: string;
  goal_subgoals?: Subgoal[];
}

export interface CreateGoalData {
  title: string;
  description: string;
  keywords?: string[];
  category?: GoalCategory;
  priority?: GoalPriority;
  deadline?: string;
  subgoals?: { text: string; completed?: boolean }[];
}

export interface UpdateGoalData {
  title?: string;
  description?: string;
  keywords?: string[];
  category?: GoalCategory;
  priority?: GoalPriority;
  deadline?: string;
  subgoals?: { text: string; completed?: boolean }[];
}

