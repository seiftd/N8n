import { Injectable } from '@nestjs/common';
import { Workflow, WorkflowNode, WorkflowConnection } from '../entities';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class WorkflowValidatorService {
  validate(workflow: Workflow): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must contain at least one node');
      return { isValid: false, errors, warnings };
    }

    // Validate trigger nodes
    this.validateTriggerNodes(workflow, errors, warnings);

    // Validate connections
    this.validateConnections(workflow, errors, warnings);

    // Validate node configurations
    this.validateNodeConfigurations(workflow, errors, warnings);

    // Check for circular dependencies
    this.validateCircularDependencies(workflow, errors, warnings);

    // Check for orphaned nodes
    this.validateOrphanedNodes(workflow, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateTriggerNodes(workflow: Workflow, errors: string[], warnings: string[]): void {
    const triggerNodes = workflow.nodes.filter(node => node.type.includes('trigger'));
    
    if (triggerNodes.length === 0) {
      errors.push('Workflow must have at least one trigger node');
    }

    // Validate specific trigger configurations
    triggerNodes.forEach(node => {
      switch (node.type) {
        case 'webhook-trigger':
          if (!node.data.parameters?.method) {
            warnings.push(`Webhook trigger "${node.data.label}" has no method specified`);
          }
          break;
        
        case 'schedule-trigger':
          const { schedule, interval, cron } = node.data.parameters || {};
          if (!schedule && !interval && !cron) {
            errors.push(`Schedule trigger "${node.data.label}" requires schedule configuration`);
          }
          break;
      }
    });
  }

  private validateConnections(workflow: Workflow, errors: string[], warnings: string[]): void {
    if (!workflow.connections) return;

    const nodeIds = new Set(workflow.nodes.map(n => n.id));

    workflow.connections.forEach(connection => {
      if (!nodeIds.has(connection.sourceNodeId)) {
        errors.push(`Connection references non-existent source node: ${connection.sourceNodeId}`);
      }
      
      if (!nodeIds.has(connection.targetNodeId)) {
        errors.push(`Connection references non-existent target node: ${connection.targetNodeId}`);
      }

      if (connection.sourceNodeId === connection.targetNodeId) {
        errors.push(`Node cannot connect to itself: ${connection.sourceNodeId}`);
      }
    });
  }

  private validateNodeConfigurations(workflow: Workflow, errors: string[], warnings: string[]): void {
    workflow.nodes.forEach(node => {
      // Validate required parameters based on node type
      switch (node.type) {
        case 'http-request':
          if (!node.data.parameters?.url) {
            errors.push(`HTTP Request node "${node.data.label}" requires URL parameter`);
          }
          break;
        
        case 'code-execution':
          if (!node.data.parameters?.code) {
            errors.push(`Code node "${node.data.label}" requires code parameter`);
          }
          break;
        
        case 'if-condition':
          if (!node.data.parameters?.condition) {
            errors.push(`If condition node "${node.data.label}" requires condition parameter`);
          }
          break;
        
        case 'openai-chat':
          if (!node.data.parameters?.prompt) {
            errors.push(`OpenAI Chat node "${node.data.label}" requires prompt parameter`);
          }
          break;
      }

      // Validate retry configuration
      if (node.data.retryOnFail && node.data.retryOnFail > 10) {
        warnings.push(`Node "${node.data.label}" has high retry count (${node.data.retryOnFail})`);
      }

      if (node.data.waitBetweenTries && node.data.waitBetweenTries > 60000) {
        warnings.push(`Node "${node.data.label}" has long wait time between retries (${node.data.waitBetweenTries}ms)`);
      }
    });
  }

  private validateCircularDependencies(workflow: Workflow, errors: string[], warnings: string[]): void {
    const graph = this.buildDependencyGraph(workflow);
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = graph.get(nodeId) || [];
      for (const dependency of dependencies) {
        if (hasCycle(dependency)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (hasCycle(node.id)) {
        errors.push('Workflow contains circular dependencies');
        break;
      }
    }
  }

  private validateOrphanedNodes(workflow: Workflow, errors: string[], warnings: string[]): void {
    if (!workflow.connections || workflow.connections.length === 0) {
      const nonTriggerNodes = workflow.nodes.filter(n => !n.type.includes('trigger'));
      if (nonTriggerNodes.length > 0) {
        warnings.push(`${nonTriggerNodes.length} nodes are not connected to any workflow`);
      }
      return;
    }

    const connectedNodes = new Set<string>();
    
    // Add all nodes that are part of connections
    workflow.connections.forEach(connection => {
      connectedNodes.add(connection.sourceNodeId);
      connectedNodes.add(connection.targetNodeId);
    });

    // Find orphaned nodes (excluding triggers)
    const orphanedNodes = workflow.nodes.filter(node => 
      !node.type.includes('trigger') && !connectedNodes.has(node.id)
    );

    if (orphanedNodes.length > 0) {
      warnings.push(`${orphanedNodes.length} nodes are not connected: ${orphanedNodes.map(n => n.data.label).join(', ')}`);
    }
  }

  private buildDependencyGraph(workflow: Workflow): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    workflow.nodes.forEach(node => {
      graph.set(node.id, []);
    });

    workflow.connections?.forEach(connection => {
      const dependencies = graph.get(connection.targetNodeId) || [];
      dependencies.push(connection.sourceNodeId);
      graph.set(connection.targetNodeId, dependencies);
    });

    return graph;
  }
}