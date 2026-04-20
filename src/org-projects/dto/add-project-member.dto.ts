// src/org-projects/dto/add-project-member.dto.ts
import { IsString, IsNotEmpty, IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

export class AddProjectMemberDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['project_admin', 'project_member', 'viewer'])
  role: 'project_admin' | 'project_member' | 'viewer';
}

export class UpdateProjectMemberRoleDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['project_owner', 'project_admin', 'project_member', 'viewer'])
  role: 'project_owner' | 'project_admin' | 'project_member' | 'viewer';
}
