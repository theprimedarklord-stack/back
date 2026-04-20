// src/organizations/dto/add-member.dto.ts
import { IsString, IsNotEmpty, IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

export class AddMemberDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['admin', 'member'])
  role: 'admin' | 'member';
}

export class UpdateMemberRoleDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['owner', 'admin', 'member'])
  role: 'owner' | 'admin' | 'member';
}
