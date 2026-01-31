export type Role = 'owner' | 'admin' | 'member' | 'project_owner' | 'project_admin' | 'project_member';

export interface ActorDto {
  userId: string;
  realUserId?: string | null;
  isImpersonated?: boolean;
}

export interface OrgDto {
  id: string;
  name?: string | null;
  color?: string | null;
  role?: Role;
}

export interface ProjectDto {
  id?: string;
  name?: string | null;
  role?: Role;
}

export type PermissionsDto = string[];

export interface LimitsDto {
  [key: string]: any;
}

export interface FlagsDto {
  [key: string]: any;
}

export interface MetaDebugDto {
  orgRole?: string | null;
  projectRole?: string | null;
}

export interface ContextDto {
  actor: ActorDto;
  org: OrgDto | null;
  project: ProjectDto | null;
  permissions: PermissionsDto;
  limits: LimitsDto | null;
  flags: FlagsDto | null;
  meta?: MetaDebugDto | null;
}
