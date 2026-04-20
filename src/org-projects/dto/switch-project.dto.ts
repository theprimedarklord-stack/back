// src/org-projects/dto/switch-project.dto.ts
import { IsUUID, IsNotEmpty } from 'class-validator';

export class SwitchProjectDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;
}
