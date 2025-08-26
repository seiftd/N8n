import { IsString, IsOptional, IsBoolean, IsEnum, MaxLength, IsObject } from 'class-validator';
import { WorkflowStatus, WorkflowSettings } from '../../entities/workflow.entity';

export class CreateWorkflowDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @IsOptional()
  @IsObject()
  settings?: WorkflowSettings;

  @IsOptional()
  @IsObject()
  staticData?: Record<string, any>;

  @IsOptional()
  @IsString()
  tags?: string;
}