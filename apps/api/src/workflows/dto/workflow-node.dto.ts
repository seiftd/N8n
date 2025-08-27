import { IsString, IsEnum, IsOptional, IsObject, IsBoolean, IsNumber, MaxLength } from 'class-validator';
import { NodeType, NodePosition, NodeCredentials } from '../../entities/workflow-node.entity';

export class CreateWorkflowNodeDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(NodeType)
  type: NodeType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  position: NodePosition;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @IsOptional()
  @IsObject()
  credentials?: NodeCredentials;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsBoolean()
  continueOnFail?: boolean;

  @IsOptional()
  @IsNumber()
  retryOnFail?: number;

  @IsOptional()
  @IsNumber()
  waitBetweenTries?: number;

  @IsOptional()
  @IsBoolean()
  alwaysOutputData?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWorkflowNodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(NodeType)
  type?: NodeType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  position?: NodePosition;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @IsOptional()
  @IsObject()
  credentials?: NodeCredentials;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsBoolean()
  continueOnFail?: boolean;

  @IsOptional()
  @IsNumber()
  retryOnFail?: number;

  @IsOptional()
  @IsNumber()
  waitBetweenTries?: number;

  @IsOptional()
  @IsBoolean()
  alwaysOutputData?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}