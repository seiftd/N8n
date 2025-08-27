import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import { Execution, ExecutionStatus, Workflow } from '../../entities';
import { ScheduledWorkflowJob } from '../queue.service';

@Injectable()
@Processor('scheduled-workflows')
export class ExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionProcessor.name);

  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
  ) {
    super();
  }

  async process(job: Job<ScheduledWorkflowJob>): Promise<any> {
    const { workflowId, nextRun } = job.data;

    this.logger.log(`Processing scheduled workflow: ${workflowId} at ${nextRun}`);

    try {
      // Check if workflow is still active
      const workflow = await this.workflowRepository.findOne({
        where: { id: workflowId, status: 'active' },
      });

      if (!workflow) {
        this.logger.warn(`Scheduled workflow not found or inactive: ${workflowId}`);
        return { skipped: true, reason: 'Workflow not found or inactive' };
      }

      // Create execution record
      const execution = this.executionRepository.create({
        workflowId,
        status: ExecutionStatus.NEW,
        mode: 'trigger' as any,
        data: { 
          scheduledRun: true, 
          scheduledTime: nextRun 
        },
      });

      await this.executionRepository.save(execution);

      // Queue the workflow execution
      // Note: In a real implementation, this would queue the workflow for execution
      this.logger.log(`Queued scheduled workflow execution: ${execution.id} for workflow ${workflowId}`);

      return {
        executionId: execution.id,
        workflowId,
        scheduledAt: nextRun,
      };

    } catch (error) {
      this.logger.error(`Scheduled workflow processing failed: ${workflowId}`, error.stack);
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ScheduledWorkflowJob>, result: any) {
    this.logger.log(`Scheduled job completed: ${job.data.workflowId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ScheduledWorkflowJob>, error: Error) {
    this.logger.error(`Scheduled job failed: ${job.data.workflowId}`, error.stack);
  }
}