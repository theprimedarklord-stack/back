// src/organizations/dto/switch-organization.dto.ts
import { IsUUID, IsNotEmpty } from 'class-validator';

export class SwitchOrganizationDto {
  @IsUUID()
  @IsNotEmpty()
  organizationId: string;
}
