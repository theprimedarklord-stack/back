export type Role = 'owner' | 'admin' | 'member' | 'project_owner' | 'project_admin' | 'project_member';

export interface ActorDto {
  id: string;
  email?: string | null;
  username?: string | null;
  isImpersonated?: boolean;
  realUserId?: string | null;
}

export interface OrgDto {
  id: string;
  name?: string | null;
  role?: Role;
}

export interface ProjectDto {
  id?: string;
  name?: string | null;
  role?: Role;
}

export interface PermissionsDto {
  organization: string[];
  project: string[];
}

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
