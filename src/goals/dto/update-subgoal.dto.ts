import { IsBoolean } from 'class-validator';

export class UpdateSubgoalDto {
  @IsBoolean()
  completed: boolean;
}

