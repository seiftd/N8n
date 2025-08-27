import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import { Execution, ExecutionStatus, ExecutionMode, Workflow, WorkflowNode, WorkflowConnection } from '../../entities';
import { WorkflowExecutionJob, QueueService } from '../queue.service';
import { ExecutionEngine } from '../../execution-engine/execution-engine.service';

@Injectable()
@Processor('workflow-execution')
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    
    @InjectRepository(WorkflowNode)
    private nodeRepository: Repository<WorkflowNode>,
    
    @InjectRepository(WorkflowConnection)
    private connectionRepository: Repository<WorkflowConnection>,
    
    private queueService: QueueService,
    private executionEngine: ExecutionEngine,
  ) {
    super();
  }

  async process(job: Job<WorkflowExecutionJob>): Promise<any> {
    const { executionId, workflowId, userId, trigger, context } = job.data;
    
    this.logger.log(`Starting workflow execution: ${executionId} for workflow ${workflowId}`);

    try {
      // Update job progress
      await job.updateProgress(10);

      // Create execution record
      const execution = await this.createExecutionRecord(executionId, workflowId, userId, trigger);
      
      // Load workflow with nodes and connections
      const workflow = await this.loadWorkflowWithDetails(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      await job.updateProgress(20);

      // Validate workflow
      this.validateWorkflow(workflow);

      // Start execution
      execution.status = ExecutionStatus.RUNNING;
      execution.startedAt = new Date();
      await this.executionRepository.save(execution);

      await job.updateProgress(30);

      // Execute workflow using execution engine
      const result = await this.executionEngine.executeWorkflow(workflow, execution, context);

      await job.updateProgress(90);

      // Update execution with results
      execution.status = result.success ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED;
      execution.finishedAt = new Date();
      execution.data = result.data;
      execution.error = result.error;

      await this.executionRepository.save(execution);
      await job.updateProgress(100);

      this.logger.log(`Workflow execution completed: ${executionId} with status ${execution.status}`);
      
      return {
        executionId,
        status: execution.status,
        duration: execution.finishedAt.getTime() - execution.startedAt!.getTime(),
        result: result.data,
      };

    } catch (error) {
      this.logger.error(`Workflow execution failed: ${executionId}`, error.stack);
      
      // Update execution with error
      const execution = await this.executionRepository.findOne({ where: { id: executionId } });
      if (execution) {
        execution.status = ExecutionStatus.FAILED;
        execution.finishedAt = new Date();
        execution.error = error.message;
        await this.executionRepository.save(execution);
      }

      throw error;
    }
  }

  private async createExecutionRecord(
    executionId: string,
    workflowId: string,
    userId?: string,
    trigger?: WorkflowExecutionJob['trigger'],
  ): Promise<Execution> {
    const execution = this.executionRepository.create({
      id: executionId,
      workflowId,
      userId,
      status: ExecutionStatus.NEW,
      mode: this.mapTriggerToMode(trigger?.type),
      data: trigger?.data || {},
    });

    return this.executionRepository.save(execution);
  }

  private async loadWorkflowWithDetails(workflowId: string): Promise<Workflow | null> {
    return this.workflowRepository.findOne({
      where: { id: workflowId },
      relations: ['nodes', 'connections'],
    });
  }

  private validateWorkflow(workflow: Workflow): void {
    if (!workflow.nodes || workflow.nodes.length === 0) {
      throw new Error('Workflow has no nodes');
    }

    // Check for trigger nodes
    const triggerNodes = workflow.nodes.filter(node => node.type.includes('trigger'));
    if (triggerNodes.length === 0) {
      throw new Error('Workflow must have at least one trigger node');
    }

    // Validate connections
    if (workflow.connections) {
      for (const connection of workflow.connections) {
        const sourceExists = workflow.nodes.some(n => n.id === connection.sourceNodeId);
        const targetExists = workflow.nodes.some(n => n.id === connection.targetNodeId);
        
        if (!sourceExists || !targetExists) {
          throw new Error(`Invalid connection: ${connection.sourceNodeId} -> ${connection.targetNodeId}`);
        }
      }
    }
  }

  private mapTriggerToMode(triggerType?: string): ExecutionMode {
    switch (triggerType) {
      case 'manual':
        return ExecutionMode.MANUAL;
      case 'webhook':
        return ExecutionMode.WEBHOOK;
      case 'schedule':
        return ExecutionMode.TRIGGER;
      case 'api':
        return ExecutionMode.CLI;
      default:
        return ExecutionMode.MANUAL;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<WorkflowExecutionJob>, result: any) {
    this.logger.log(`Job completed: ${job.id} with result:`, result);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WorkflowExecutionJob>, error: Error) {
    this.logger.error(`Job failed: ${job.id}`, error.stack);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<WorkflowExecutionJob>, progress: number) {
    this.logger.debug(`Job progress: ${job.id} - ${progress}%`);
  }
}