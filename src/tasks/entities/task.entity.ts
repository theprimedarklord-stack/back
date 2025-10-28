export type TaskStatus = 'not_completed' | 'completed' | 'not_needed' | 'half_completed' | 'urgent';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface StatusHistoryEntry {
  status: TaskStatus;
  timestamp: string;
  action: 'created' | 'status_changed';
}

export interface Task {
  id: string;
  user_id: string;
  topic: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: string;
  status_history: StatusHistoryEntry[];
  goal_id?: number | null;
  subgoal_id?: number | null;
  created_at: string;
  updated_at: string;
  generated_by?: 'ai' | 'manual';
  confidence?: number;
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_goal_id?: number;
    source_project_id?: number;
  };
}

export interface CreateTaskData {
  topic: string;
  description: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: string;
  status_history?: StatusHistoryEntry[];
  goal_id?: number | null;
  subgoal_id?: number | null;
  generated_by?: 'ai' | 'manual';
  confidence?: number;
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_goal_id?: number;
    source_project_id?: number;
  };
}

export interface UpdateTaskData {
  topic?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: string;
  status_history?: StatusHistoryEntry[];
  goal_id?: number | null;
  subgoal_id?: number | null;
  generated_by?: 'ai' | 'manual';
  confidence?: number;
  ai_metadata?: {
    model?: string;
    prompt_version?: string;
    tokens_used?: number;
    source_goal_id?: number;
    source_project_id?: number;
  };
}
