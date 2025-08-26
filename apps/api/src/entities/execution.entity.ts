import { Entity, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Workflow } from './workflow.entity';
import { ExecutionData } from './execution-data.entity';

export enum ExecutionStatus {
  NEW = 'new',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELED = 'canceled',
  WAITING = 'waiting',
}

export enum ExecutionMode {
  MANUAL = 'manual',
  TRIGGER = 'trigger',
  WEBHOOK = 'webhook',
  RETRY = 'retry',
  CLI = 'cli',
}

@Entity('executions')
@Index(['status'])
@Index(['mode'])
@Index(['workflowId', 'startedAt'])
@Index(['userId', 'startedAt'])
export class Execution extends BaseEntity {
  @Column({
    type: 'enum',
    enum: ExecutionStatus,
    default: ExecutionStatus.NEW,
  })
  status: ExecutionStatus;

  @Column({
    type: 'enum',
    enum: ExecutionMode,
    default: ExecutionMode.MANUAL,
  })
  mode: ExecutionMode;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  stoppedAt: Date;

  @Column({ nullable: true })
  finishedAt: Date;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ nullable: true })
  workflowVersion: number;

  @Column({ type: 'jsonb', nullable: true })
  staticData: Record<string, any>;

  @Column({ nullable: true })
  retryOf: string;

  @Column({ default: 0 })
  retryAttempts: number;

  // Relations
  @ManyToOne(() => User, (user) => user.executions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ name: 'userId', nullable: true })
  userId: string;

  @ManyToOne(() => Workflow, (workflow) => workflow.executions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  @Column({ name: 'workflowId' })
  workflowId: string;

  @OneToMany(() => ExecutionData, (data) => data.execution, {
    cascade: true,
  })
  executionData: ExecutionData[];

  // Virtual properties
  get duration(): number | null {
    if (!this.startedAt || !this.finishedAt) {
      return null;
    }
    return this.finishedAt.getTime() - this.startedAt.getTime();
  }

  get isRunning(): boolean {
    return this.status === ExecutionStatus.RUNNING;
  }

  get isCompleted(): boolean {
    return [
      ExecutionStatus.SUCCESS,
      ExecutionStatus.FAILED,
      ExecutionStatus.CANCELED,
    ].includes(this.status);
  }
}