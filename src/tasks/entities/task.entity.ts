export type TaskStatus = 'not_completed' | 'completed' | 'not_needed' | 'half_completed' | 'urgent';

export interface Task {
  id: string;
  user_id: string;
  topic: string;
  description: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  topic: string;
  description: string;
  status?: TaskStatus;
}

export interface UpdateTaskData {
  topic?: string;
  description?: string;
  status?: TaskStatus;
}
