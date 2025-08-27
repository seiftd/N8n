import { Entity, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { WorkflowNode } from './workflow-node.entity';
import { WorkflowConnection } from './workflow-connection.entity';
import { Execution } from './execution.entity';

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

export interface WorkflowSettings {
  timezone?: string;
  errorWorkflow?: string;
  callerPolicy?: 'any' | 'none' | 'workflowsFromSameOwner';
  executionTimeout?: number;
  maxExecutions?: number;
}

@Entity('workflows')
@Index(['name', 'ownerId'])
@Index(['status'])
@Index(['isTemplate'])
export class Workflow extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.DRAFT,
  })
  status: WorkflowStatus;

  @Column({ default: false })
  isTemplate: boolean;

  @Column({ type: 'jsonb', nullable: true })
  settings: WorkflowSettings;

  @Column({ type: 'jsonb', nullable: true })
  staticData: Record<string, any>;

  @Column({ nullable: true })
  triggerCount: number;

  @Column({ nullable: true })
  lastExecutedAt: Date;

  @Column({ default: 1 })
  version: number;

  @Column({ type: 'text', nullable: true })
  tags: string; // Comma-separated tags

  // Relations
  @ManyToOne(() => User, (user) => user.workflows, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ name: 'ownerId' })
  ownerId: string;

  @OneToMany(() => WorkflowNode, (node) => node.workflow, {
    cascade: true,
    eager: false,
  })
  nodes: WorkflowNode[];

  @OneToMany(() => WorkflowConnection, (connection) => connection.workflow, {
    cascade: true,
    eager: false,
  })
  connections: WorkflowConnection[];

  @OneToMany(() => Execution, (execution) => execution.workflow)
  executions: Execution[];
}