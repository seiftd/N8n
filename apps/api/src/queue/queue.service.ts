import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowExecutionJob {
  executionId: string;
  workflowId: string;
  userId?: string;
  trigger: {
    type: 'manual' | 'webhook' | 'schedule' | 'api';
    data?: any;
  };
  context: {
    environment?: string;
    variables?: Record<string, any>;
  };
}

export interface NodeExecutionJob {
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  inputData: any[];
  parameters: Record<string, any>;
  credentials?: Record<string, any>;
  previousNodeData?: Record<string, any>;
  retryCount?: number;
}

export interface ScheduledWorkflowJob {
  workflowId: string;
  cronExpression?: string;
  interval?: number;
  nextRun: Date;
  timezone?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('workflow-execution')
    private workflowQueue: Queue<WorkflowExecutionJob>,
    
    @InjectQueue('node-execution')
    private nodeQueue: Queue<NodeExecutionJob>,
    
    @InjectQueue('scheduled-workflows')
    private scheduledQueue: Queue<ScheduledWorkflowJob>,
    
    @InjectQueue('webhook-triggers')
    private webhookQueue: Queue<any>,
  ) {}

  /**
   * Add workflow execution to queue
   */
  async executeWorkflow(
    workflowId: string,
    trigger: WorkflowExecutionJob['trigger'],
    userId?: string,
    options: {
      priority?: number;
      delay?: number;
      context?: Record<string, any>;
    } = {},
  ): Promise<string> {
    const executionId = uuidv4();
    
    const jobData: WorkflowExecutionJob = {
      executionId,
      workflowId,
      userId,
      trigger,
      context: {
        environment: process.env.NODE_ENV,
        variables: options.context || {},
      },
    };

    const job = await this.workflowQueue.add(
      'execute-workflow',
      jobData,
      {
        priority: options.priority || 0,
        delay: options.delay || 0,
        jobId: executionId,
      },
    );

    this.logger.log(`Workflow execution queued: ${executionId} for workflow ${workflowId}`);
    return executionId;
  }

  /**
   * Add node execution to queue
   */
  async executeNode(
    nodeData: Omit<NodeExecutionJob, 'retryCount'>,
    options: {
      priority?: number;
      delay?: number;
      retryCount?: number;
    } = {},
  ): Promise<Job<NodeExecutionJob>> {
    const jobData: NodeExecutionJob = {
      ...nodeData,
      retryCount: options.retryCount || 0,
    };

    const job = await this.nodeQueue.add(
      'execute-node',
      jobData,
      {
        priority: options.priority || 0,
        delay: options.delay || 0,
        jobId: `${nodeData.executionId}-${nodeData.nodeId}`,
      },
    );

    this.logger.debug(`Node execution queued: ${nodeData.nodeId} for execution ${nodeData.executionId}`);
    return job;
  }

  /**
   * Schedule workflow for later execution
   */
  async scheduleWorkflow(
    workflowId: string,
    schedule: {
      cronExpression?: string;
      interval?: number;
      nextRun: Date;
      timezone?: string;
    },
  ): Promise<Job<ScheduledWorkflowJob>> {
    const jobData: ScheduledWorkflowJob = {
      workflowId,
      ...schedule,
    };

    const job = await this.scheduledQueue.add(
      'scheduled-workflow',
      jobData,
      {
        repeat: schedule.cronExpression 
          ? { pattern: schedule.cronExpression, tz: schedule.timezone }
          : schedule.interval 
          ? { every: schedule.interval }
          : undefined,
        jobId: `scheduled-${workflowId}`,
      },
    );

    this.logger.log(`Workflow scheduled: ${workflowId} with pattern ${schedule.cronExpression || schedule.interval}`);
    return job;
  }

  /**
   * Process webhook trigger
   */
  async processWebhook(
    workflowId: string,
    webhookData: any,
    headers: Record<string, string>,
  ): Promise<string> {
    const executionId = await this.executeWorkflow(
      workflowId,
      {
        type: 'webhook',
        data: {
          body: webhookData,
          headers,
          timestamp: new Date(),
        },
      },
    );

    return executionId;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const workflowStats = await this.getQueueInfo('workflow-execution');
    const nodeStats = await this.getQueueInfo('node-execution');
    const scheduledStats = await this.getQueueInfo('scheduled-workflows');
    const webhookStats = await this.getQueueInfo('webhook-triggers');

    return {
      workflows: workflowStats,
      nodes: nodeStats,
      scheduled: scheduledStats,
      webhooks: webhookStats,
      total: {
        waiting: workflowStats.waiting + nodeStats.waiting + scheduledStats.waiting + webhookStats.waiting,
        active: workflowStats.active + nodeStats.active + scheduledStats.active + webhookStats.active,
        completed: workflowStats.completed + nodeStats.completed + scheduledStats.completed + webhookStats.completed,
        failed: workflowStats.failed + nodeStats.failed + scheduledStats.failed + webhookStats.failed,
      },
    };
  }

  private async getQueueInfo(queueName: string) {
    const queue = queueName === 'workflow-execution' ? this.workflowQueue
      : queueName === 'node-execution' ? this.nodeQueue
      : queueName === 'scheduled-workflows' ? this.scheduledQueue
      : this.webhookQueue;

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }

  /**
   * Pause/Resume queues
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueueByName(queueName);
    await queue.pause();
    this.logger.warn(`Queue paused: ${queueName}`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueueByName(queueName);
    await queue.resume();
    this.logger.log(`Queue resumed: ${queueName}`);
  }

  /**
   * Clean completed/failed jobs
   */
  async cleanQueue(queueName: string, options: {
    grace?: number;
    limit?: number;
    type?: 'completed' | 'failed' | 'active' | 'waiting';
  } = {}): Promise<string[]> {
    const queue = this.getQueueByName(queueName);
    const cleaned = await queue.clean(
      options.grace || 24 * 60 * 60 * 1000, // 24 hours
      options.limit || 100,
      options.type || 'completed',
    );
    
    this.logger.log(`Cleaned ${cleaned.length} jobs from ${queueName} queue`);
    return cleaned;
  }

  private getQueueByName(queueName: string): Queue {
    switch (queueName) {
      case 'workflow-execution':
        return this.workflowQueue;
      case 'node-execution':
        return this.nodeQueue;
      case 'scheduled-workflows':
        return this.scheduledQueue;
      case 'webhook-triggers':
        return this.webhookQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }
}