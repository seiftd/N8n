import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { 
  Execution, 
  ExecutionData, 
  Workflow, 
  WorkflowNode, 
  WorkflowConnection 
} from '../entities';
import { NodeExecutorService } from './node-executor.service';
import { WorkflowValidatorService } from './workflow-validator.service';

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executedNodes: string[];
  duration: number;
}

export interface ExecutionContext {
  environment?: string;
  variables: Record<string, any>;
  previousNodeData?: Record<string, any>;
  triggerData?: any;
}

export interface NodeExecutionResult {
  success: boolean;
  data: any[];
  error?: string;
  duration: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class ExecutionEngine {
  private readonly logger = new Logger(ExecutionEngine.name);

  constructor(
    @InjectRepository(ExecutionData)
    private executionDataRepository: Repository<ExecutionData>,
    
    private nodeExecutor: NodeExecutorService,
    private workflowValidator: WorkflowValidatorService,
  ) {}

  async executeWorkflow(
    workflow: Workflow,
    execution: Execution,
    context: ExecutionContext = { variables: {} },
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executedNodes: string[] = [];

    try {
      this.logger.log(`Executing workflow: ${workflow.id} (${workflow.name})`);

      // Validate workflow structure
      const validationResult = this.workflowValidator.validate(workflow);
      if (!validationResult.isValid) {
        throw new Error(`Workflow validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Build execution graph
      const executionGraph = this.buildExecutionGraph(workflow);
      
      // Find starting nodes (triggers)
      const startingNodes = this.findStartingNodes(workflow);
      
      // Execute workflow using breadth-first execution
      const result = await this.executeGraph(
        executionGraph,
        startingNodes,
        execution,
        context,
        executedNodes,
      );

      const duration = Date.now() - startTime;
      
      this.logger.log(`Workflow execution completed: ${workflow.id} in ${duration}ms`);
      
      return {
        success: true,
        data: result,
        executedNodes,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`Workflow execution failed: ${workflow.id}`, error.stack);
      
      return {
        success: false,
        error: error.message,
        executedNodes,
        duration,
      };
    }
  }

  private buildExecutionGraph(workflow: Workflow): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    // Initialize all nodes in graph
    workflow.nodes.forEach(node => {
      graph.set(node.id, []);
    });

    // Add connections
    workflow.connections?.forEach(connection => {
      const targets = graph.get(connection.sourceNodeId) || [];
      targets.push(connection.targetNodeId);
      graph.set(connection.sourceNodeId, targets);
    });

    return graph;
  }

  private findStartingNodes(workflow: Workflow): WorkflowNode[] {
    // Find nodes that are triggers or have no incoming connections
    const targetNodes = new Set(
      workflow.connections?.map(c => c.targetNodeId) || []
    );

    return workflow.nodes.filter(node => 
      node.type.includes('trigger') || !targetNodes.has(node.id)
    );
  }

  private async executeGraph(
    graph: Map<string, string[]>,
    startingNodes: WorkflowNode[],
    execution: Execution,
    context: ExecutionContext,
    executedNodes: string[],
  ): Promise<any> {
    const nodeDataMap = new Map<string, any>();
    const pendingNodes = new Set<string>();
    const completedNodes = new Set<string>();
    const nodeQueue: WorkflowNode[] = [...startingNodes];

    // Set initial trigger data
    if (context.triggerData) {
      startingNodes.forEach(node => {
        nodeDataMap.set(node.id, [context.triggerData]);
      });
    }

    while (nodeQueue.length > 0) {
      const currentNode = nodeQueue.shift()!;
      
      if (completedNodes.has(currentNode.id) || pendingNodes.has(currentNode.id)) {
        continue;
      }

      // Check if all dependencies are satisfied
      const dependencies = this.getNodeDependencies(currentNode.id, graph);
      const dependenciesSatisfied = dependencies.every(dep => completedNodes.has(dep));
      
      if (!dependenciesSatisfied) {
        // Re-queue node for later execution
        nodeQueue.push(currentNode);
        continue;
      }

      pendingNodes.add(currentNode.id);

      try {
        // Collect input data from dependencies
        const inputData = this.collectInputData(currentNode.id, dependencies, nodeDataMap);
        
        // Execute node
        const nodeResult = await this.executeNode(
          currentNode,
          inputData,
          execution,
          context,
        );

        // Store node result
        nodeDataMap.set(currentNode.id, nodeResult.data);
        executedNodes.push(currentNode.id);
        completedNodes.add(currentNode.id);
        pendingNodes.delete(currentNode.id);

        // Add next nodes to queue
        const nextNodes = graph.get(currentNode.id) || [];
        for (const nextNodeId of nextNodes) {
          const nextNode = execution.workflow?.nodes?.find(n => n.id === nextNodeId);
          if (nextNode && !completedNodes.has(nextNodeId)) {
            nodeQueue.push(nextNode);
          }
        }

        this.logger.debug(`Node executed successfully: ${currentNode.id}`);

      } catch (error) {
        pendingNodes.delete(currentNode.id);
        
        if (currentNode.data.continueOnFail) {
          this.logger.warn(`Node failed but continuing: ${currentNode.id}`, error.message);
          completedNodes.add(currentNode.id);
          nodeDataMap.set(currentNode.id, [{ error: error.message }]);
        } else {
          throw new Error(`Node execution failed: ${currentNode.id} - ${error.message}`);
        }
      }
    }

    // Return final workflow result
    return this.buildWorkflowResult(nodeDataMap, executedNodes);
  }

  private getNodeDependencies(nodeId: string, graph: Map<string, string[]>): string[] {
    const dependencies: string[] = [];
    
    for (const [sourceId, targets] of graph.entries()) {
      if (targets.includes(nodeId)) {
        dependencies.push(sourceId);
      }
    }
    
    return dependencies;
  }

  private collectInputData(
    nodeId: string,
    dependencies: string[],
    nodeDataMap: Map<string, any>,
  ): any[] {
    if (dependencies.length === 0) {
      return [];
    }

    const inputData: any[] = [];
    
    for (const depId of dependencies) {
      const depData = nodeDataMap.get(depId);
      if (depData) {
        inputData.push(...(Array.isArray(depData) ? depData : [depData]));
      }
    }

    return inputData;
  }

  private async executeNode(
    node: WorkflowNode,
    inputData: any[],
    execution: Execution,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      // Create execution data record
      const executionData = this.executionDataRepository.create({
        executionId: execution.id,
        nodeId: node.id,
        nodeName: node.data.label,
        inputData,
        startedAt: new Date(),
      });

      await this.executionDataRepository.save(executionData);

      // Execute node using node executor
      const result = await this.nodeExecutor.executeNode(node, inputData, context);

      // Update execution data with results
      executionData.finishedAt = new Date();
      executionData.outputData = result.data;
      executionData.error = result.error;
      executionData.executionTime = Date.now() - startTime;

      await this.executionDataRepository.save(executionData);

      return result;

    } catch (error) {
      // Log execution error
      const executionData = await this.executionDataRepository.findOne({
        where: { executionId: execution.id, nodeId: node.id },
      });

      if (executionData) {
        executionData.finishedAt = new Date();
        executionData.error = error.message;
        executionData.executionTime = Date.now() - startTime;
        await this.executionDataRepository.save(executionData);
      }

      throw error;
    }
  }

  private buildWorkflowResult(
    nodeDataMap: Map<string, any>,
    executedNodes: string[],
  ): any {
    const result: any = {
      executedNodes,
      nodeResults: {},
      summary: {
        totalNodes: executedNodes.length,
        successfulNodes: 0,
        failedNodes: 0,
      },
    };

    for (const [nodeId, data] of nodeDataMap.entries()) {
      result.nodeResults[nodeId] = data;
      
      if (Array.isArray(data) && data.some(item => item.error)) {
        result.summary.failedNodes++;
      } else {
        result.summary.successfulNodes++;
      }
    }

    return result;
  }
}