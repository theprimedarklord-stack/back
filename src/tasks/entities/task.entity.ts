export type TaskStatus = 'not_completed' | 'completed' | 'not_needed' | 'half_completed' | 'urgent';

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
  deadline?: string;
  status_history: StatusHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  topic: string;
  description: string;
  status?: TaskStatus;
  deadline?: string;
  status_history?: StatusHistoryEntry[];
}

export interface UpdateTaskData {
  topic?: string;
  description?: string;
  status?: TaskStatus;
  deadline?: string;
  status_history?: StatusHistoryEntry[];
}
