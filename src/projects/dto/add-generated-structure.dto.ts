import { IsNumber, IsObject, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateGoalDto } from '../../goals/dto/create-goal.dto';
import { CreateTaskDto } from '../../tasks/dto/create-task.dto';

class StructureDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGoalDto)
  goals: CreateGoalDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];
}

export class AddGeneratedStructureDto {
  @IsNumber()
  project_id: number;

  @ValidateNested()
  @Type(() => StructureDto)
  structure: StructureDto;
}

