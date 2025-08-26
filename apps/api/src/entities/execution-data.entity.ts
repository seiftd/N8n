import { Entity, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Execution } from './execution.entity';

@Entity('execution_data')
@Index(['executionId', 'nodeId'])
@Index(['executionId', 'startedAt'])
export class ExecutionData extends BaseEntity {
  @Column({ length: 255 })
  nodeId: string;

  @Column({ length: 255 })
  nodeName: string;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  finishedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  inputData: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  outputData: Record<string, any>[];

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ default: 0 })
  executionTime: number;

  @Column({ type: 'jsonb', nullable: true })
  hints: Record<string, any>;

  // Relations
  @ManyToOne(() => Execution, (execution) => execution.executionData, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'executionId' })
  execution: Execution;

  @Column({ name: 'executionId' })
  executionId: string;

  // Virtual properties
  get duration(): number | null {
    if (!this.startedAt || !this.finishedAt) {
      return null;
    }
    return this.finishedAt.getTime() - this.startedAt.getTime();
  }

  get hasError(): boolean {
    return !!this.error;
  }
}