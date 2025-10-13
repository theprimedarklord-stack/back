// src/projects/entities/project.entity.ts

export type ProjectCategory = 'technical' | 'business' | 'personal' | 'learning';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';

export interface Project {
  id: number;
  user_id: string;
  title: string;
  description: string | null;
  keywords: string[];
  category: ProjectCategory;
  priority: ProjectPriority;
  status: ProjectStatus;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  title: string;
  description?: string;
  keywords?: string[];
  category?: ProjectCategory;
  priority?: ProjectPriority;
  status?: ProjectStatus;
  deadline?: string;
}

export interface UpdateProjectData {
  title?: string;
  description?: string;
  keywords?: string[];
  category?: ProjectCategory;
  priority?: ProjectPriority;
  status?: ProjectStatus;
  deadline?: string;
}

