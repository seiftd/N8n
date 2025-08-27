import { Entity, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Workflow } from './workflow.entity';

@Entity('workflow_connections')
@Index(['workflowId', 'sourceNodeId', 'targetNodeId'])
export class WorkflowConnection extends BaseEntity {
  @Column({ length: 255 })
  sourceNodeId: string;

  @Column({ length: 255 })
  targetNodeId: string;

  @Column({ length: 255, default: 'main' })
  sourceOutputIndex: string;

  @Column({ length: 255, default: 'main' })
  targetInputIndex: string;

  // Relations
  @ManyToOne(() => Workflow, (workflow) => workflow.connections, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  @Column({ name: 'workflowId' })
  workflowId: string;
}