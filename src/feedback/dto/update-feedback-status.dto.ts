import { IsIn, IsString } from 'class-validator';

export class UpdateFeedbackStatusDto {
  @IsString()
  @IsIn(['new', 'seen', 'done'])
  status: 'new' | 'seen' | 'done';
}
