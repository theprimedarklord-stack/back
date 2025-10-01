export interface Task {
  id: string;
  user_id: string;
  topic: string;
  description: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  topic: string;
  description: string;
  completed?: boolean;
}

export interface UpdateTaskData {
  topic?: string;
  description?: string;
  completed?: boolean;
}
