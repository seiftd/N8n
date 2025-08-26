import { Entity, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Workflow } from './workflow.entity';

export enum NodeType {
  // Trigger nodes
  MANUAL_TRIGGER = 'manual-trigger',
  WEBHOOK_TRIGGER = 'webhook-trigger',
  SCHEDULE_TRIGGER = 'schedule-trigger',
  EMAIL_TRIGGER = 'email-trigger',
  
  // Action nodes
  HTTP_REQUEST = 'http-request',
  CODE_EXECUTION = 'code-execution',
  SET_VARIABLE = 'set-variable',
  EMAIL_SEND = 'email-send',
  
  // Logic nodes
  IF_CONDITION = 'if-condition',
  SWITCH_CONDITION = 'switch-condition',
  MERGE = 'merge',
  WAIT = 'wait',
  LOOP = 'loop',
  
  // Data nodes
  FILTER = 'filter',
  SORT = 'sort',
  SPLIT = 'split',
  AGGREGATE = 'aggregate',
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeCredentials {
  [key: string]: {
    id: string;
    name: string;
  };
}

@Entity('workflow_nodes')
@Index(['workflowId', 'name'])
@Index(['type'])
export class WorkflowNode extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: NodeType,
  })
  type: NodeType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb' })
  position: NodePosition;

  @Column({ type: 'jsonb', nullable: true })
  parameters: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  credentials: NodeCredentials;

  @Column({ default: false })
  disabled: boolean;

  @Column({ default: false })
  continueOnFail: boolean;

  @Column({ nullable: true })
  retryOnFail: number;

  @Column({ nullable: true })
  waitBetweenTries: number;

  @Column({ default: false })
  alwaysOutputData: boolean;

  @Column({ type: 'jsonb', nullable: true })
  notes: string;

  // Relations
  @ManyToOne(() => Workflow, (workflow) => workflow.nodes, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  @Column({ name: 'workflowId' })
  workflowId: string;
}