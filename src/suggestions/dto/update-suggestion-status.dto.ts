// src/suggestions/dto/update-suggestion-status.dto.ts
import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class UpdateSuggestionStatusDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['accepted', 'rejected'])
  status: 'accepted' | 'rejected';
}

