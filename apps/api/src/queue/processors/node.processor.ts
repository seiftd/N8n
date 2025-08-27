import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { NodeExecutionJob } from '../queue.service';
import { NodeExecutorService } from '../../execution-engine/node-executor.service';

@Injectable()
@Processor('node-execution')
export class NodeProcessor extends WorkerHost {
  private readonly logger = new Logger(NodeProcessor.name);

  constructor(private nodeExecutor: NodeExecutorService) {
    super();
  }

  async process(job: Job<NodeExecutionJob>): Promise<any> {
    const { 
      executionId, 
      nodeId, 
      nodeName, 
      nodeType, 
      inputData, 
      parameters, 
      credentials,
      retryCount = 0 
    } = job.data;

    this.logger.debug(`Processing node: ${nodeId} (${nodeType}) for execution ${executionId}`);

    try {
      // Create mock node object for executor
      const node = {
        id: nodeId,
        type: nodeType,
        data: {
          label: nodeName,
          parameters,
          credentials,
        },
      };

      // Execute the node
      const result = await this.nodeExecutor.executeNode(
        node as any,
        inputData,
        { variables: {} }
      );

      this.logger.debug(`Node execution completed: ${nodeId} with ${result.success ? 'success' : 'failure'}`);

      return {
        nodeId,
        executionId,
        success: result.success,
        data: result.data,
        error: result.error,
        duration: result.duration,
      };

    } catch (error) {
      this.logger.error(`Node execution failed: ${nodeId} in execution ${executionId}`, error.stack);
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<NodeExecutionJob>, result: any) {
    this.logger.debug(`Node job completed: ${job.data.nodeId} in execution ${job.data.executionId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NodeExecutionJob>, error: Error) {
    this.logger.error(`Node job failed: ${job.data.nodeId} in execution ${job.data.executionId}`, error.stack);
  }
}