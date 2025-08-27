import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution, ExecutionData, Workflow } from '../entities';
import { CachingService } from '../performance/caching.service';

export interface SystemMetrics {
  timestamp: Date;
  workflows: {
    total: number;
    active: number;
    inactive: number;
    draft: number;
  };
  executions: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    successful: number;
    failed: number;
    averageDuration: number;
  };
  performance: {
    averageExecutionTime: number;
    peakExecutionTime: number;
    throughput: number; // executions per hour
    errorRate: number;
  };
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage?: number;
  };
}

export interface WorkflowMetrics {
  workflowId: string;
  executions: {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
    lastExecution?: Date;
  };
  performance: {
    averageExecutionTime: number;
    peakExecutionTime: number;
    errorRate: number;
  };
  nodes: {
    totalNodes: number;
    averageNodesPerExecution: number;
    slowestNode?: {
      nodeId: string;
      nodeName: string;
      averageDuration: number;
    };
  };
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private startTime = Date.now();

  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    
    @InjectRepository(ExecutionData)
    private executionDataRepository: Repository<ExecutionData>,
    
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    
    private cachingService: CachingService,
  ) {}

  async getSystemMetrics(): Promise<SystemMetrics> {
    const cacheKey = 'system:metrics';
    
    return this.cachingService.getOrSet(
      cacheKey,
      async () => {
        const [workflowStats, executionStats, performanceStats] = await Promise.all([
          this.getWorkflowStats(),
          this.getExecutionStats(),
          this.getPerformanceStats(),
        ]);

        return {
          timestamp: new Date(),
          workflows: workflowStats,
          executions: executionStats,
          performance: performanceStats,
          system: {
            memoryUsage: process.memoryUsage(),
            uptime: Date.now() - this.startTime,
            cpuUsage: process.cpuUsage().user,
          },
        };
      },
      { ttl: 300 }, // Cache for 5 minutes
    );
  }

  async getWorkflowMetrics(workflowId: string): Promise<WorkflowMetrics> {
    const cacheKey = `workflow:metrics:${workflowId}`;
    
    return this.cachingService.getOrSet(
      cacheKey,
      async () => {
        const [executionStats, performanceStats, nodeStats] = await Promise.all([
          this.getWorkflowExecutionStats(workflowId),
          this.getWorkflowPerformanceStats(workflowId),
          this.getWorkflowNodeStats(workflowId),
        ]);

        return {
          workflowId,
          executions: executionStats,
          performance: performanceStats,
          nodes: nodeStats,
        };
      },
      { ttl: 600 }, // Cache for 10 minutes
    );
  }

  async getExecutionTrends(days: number = 7): Promise<{
    dates: string[];
    executions: number[];
    successes: number[];
    failures: number[];
    averageDurations: number[];
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const executions = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'DATE(execution.createdAt) as date',
        'COUNT(*) as total',
        'SUM(CASE WHEN execution.status = \'success\' THEN 1 ELSE 0 END) as successes',
        'SUM(CASE WHEN execution.status = \'failed\' THEN 1 ELSE 0 END) as failures',
        'AVG(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as avgDuration',
      ])
      .where('execution.createdAt >= :startDate', { startDate })
      .andWhere('execution.createdAt <= :endDate', { endDate })
      .groupBy('DATE(execution.createdAt)')
      .orderBy('date')
      .getRawMany();

    const dates: string[] = [];
    const executionCounts: number[] = [];
    const successCounts: number[] = [];
    const failureCounts: number[] = [];
    const averageDurations: number[] = [];

    executions.forEach(row => {
      dates.push(row.date);
      executionCounts.push(parseInt(row.total));
      successCounts.push(parseInt(row.successes));
      failureCounts.push(parseInt(row.failures));
      averageDurations.push(parseFloat(row.avgduration) || 0);
    });

    return {
      dates,
      executions: executionCounts,
      successes: successCounts,
      failures: failureCounts,
      averageDurations,
    };
  }

  async getTopSlowNodes(limit: number = 10): Promise<Array<{
    nodeId: string;
    nodeName: string;
    averageDuration: number;
    executionCount: number;
  }>> {
    const slowNodes = await this.executionDataRepository
      .createQueryBuilder('executionData')
      .select([
        'executionData.nodeId as nodeId',
        'executionData.nodeName as nodeName',
        'AVG(executionData.executionTime) as avgDuration',
        'COUNT(*) as executionCount',
      ])
      .where('executionData.executionTime > 0')
      .groupBy('executionData.nodeId, executionData.nodeName')
      .orderBy('avgDuration', 'DESC')
      .limit(limit)
      .getRawMany();

    return slowNodes.map(row => ({
      nodeId: row.nodeid,
      nodeName: row.nodename,
      averageDuration: parseFloat(row.avgduration),
      executionCount: parseInt(row.executioncount),
    }));
  }

  async getErrorAnalysis(): Promise<{
    mostCommonErrors: Array<{
      error: string;
      count: number;
      percentage: number;
    }>;
    errorsByNode: Array<{
      nodeId: string;
      nodeName: string;
      errorCount: number;
      totalExecutions: number;
      errorRate: number;
    }>;
  }> {
    const [errorsByMessage, errorsByNode] = await Promise.all([
      this.getMostCommonErrors(),
      this.getErrorsByNode(),
    ]);

    return {
      mostCommonErrors: errorsByMessage,
      errorsByNode,
    };
  }

  private async getWorkflowStats() {
    const workflows = await this.workflowRepository
      .createQueryBuilder('workflow')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN workflow.status = \'active\' THEN 1 ELSE 0 END) as active',
        'SUM(CASE WHEN workflow.status = \'inactive\' THEN 1 ELSE 0 END) as inactive',
        'SUM(CASE WHEN workflow.status = \'draft\' THEN 1 ELSE 0 END) as draft',
      ])
      .getRawOne();

    return {
      total: parseInt(workflows.total),
      active: parseInt(workflows.active),
      inactive: parseInt(workflows.inactive),
      draft: parseInt(workflows.draft),
    };
  }

  private async getExecutionStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN execution.createdAt >= :today THEN 1 ELSE 0 END) as today',
        'SUM(CASE WHEN execution.createdAt >= :thisWeek THEN 1 ELSE 0 END) as thisWeek',
        'SUM(CASE WHEN execution.createdAt >= :thisMonth THEN 1 ELSE 0 END) as thisMonth',
        'SUM(CASE WHEN execution.status = \'success\' THEN 1 ELSE 0 END) as successful',
        'SUM(CASE WHEN execution.status = \'failed\' THEN 1 ELSE 0 END) as failed',
        'AVG(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as avgDuration',
      ])
      .setParameters({ today, thisWeek, thisMonth })
      .getRawOne();

    return {
      today: parseInt(stats.today) || 0,
      thisWeek: parseInt(stats.thisweek) || 0,
      thisMonth: parseInt(stats.thismonth) || 0,
      successful: parseInt(stats.successful) || 0,
      failed: parseInt(stats.failed) || 0,
      averageDuration: parseFloat(stats.avgduration) || 0,
    };
  }

  private async getPerformanceStats() {
    const performanceData = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'AVG(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as avgTime',
        'MAX(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as peakTime',
        'COUNT(*) as totalExecutions',
        'SUM(CASE WHEN execution.status = \'failed\' THEN 1 ELSE 0 END) as failedExecutions',
      ])
      .where('execution.startedAt IS NOT NULL')
      .andWhere('execution.finishedAt IS NOT NULL')
      .getRawOne();

    const totalExecutions = parseInt(performanceData.totalexecutions) || 0;
    const failedExecutions = parseInt(performanceData.failedexecutions) || 0;

    // Calculate executions per hour for the last 24 hours
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentExecutions = await this.executionRepository.count({
      where: {
        createdAt: { $gte: last24Hours } as any,
      },
    });

    return {
      averageExecutionTime: parseFloat(performanceData.avgtime) || 0,
      peakExecutionTime: parseFloat(performanceData.peaktime) || 0,
      throughput: recentExecutions, // executions in last 24 hours
      errorRate: totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0,
    };
  }

  private async getWorkflowExecutionStats(workflowId: string) {
    const stats = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN execution.status = \'success\' THEN 1 ELSE 0 END) as successful',
        'SUM(CASE WHEN execution.status = \'failed\' THEN 1 ELSE 0 END) as failed',
        'AVG(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as avgDuration',
        'MAX(execution.createdAt) as lastExecution',
      ])
      .where('execution.workflowId = :workflowId', { workflowId })
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      successful: parseInt(stats.successful) || 0,
      failed: parseInt(stats.failed) || 0,
      averageDuration: parseFloat(stats.avgduration) || 0,
      lastExecution: stats.lastexecution ? new Date(stats.lastexecution) : undefined,
    };
  }

  private async getWorkflowPerformanceStats(workflowId: string) {
    const stats = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'AVG(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as avgTime',
        'MAX(EXTRACT(EPOCH FROM (execution.finishedAt - execution.startedAt)) * 1000) as peakTime',
        'COUNT(*) as totalExecutions',
        'SUM(CASE WHEN execution.status = \'failed\' THEN 1 ELSE 0 END) as failedExecutions',
      ])
      .where('execution.workflowId = :workflowId', { workflowId })
      .andWhere('execution.startedAt IS NOT NULL')
      .andWhere('execution.finishedAt IS NOT NULL')
      .getRawOne();

    const totalExecutions = parseInt(stats.totalexecutions) || 0;
    const failedExecutions = parseInt(stats.failedexecutions) || 0;

    return {
      averageExecutionTime: parseFloat(stats.avgtime) || 0,
      peakExecutionTime: parseFloat(stats.peaktime) || 0,
      errorRate: totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0,
    };
  }

  private async getWorkflowNodeStats(workflowId: string) {
    const nodeStats = await this.executionDataRepository
      .createQueryBuilder('executionData')
      .innerJoin('execution', 'execution', 'execution.id = executionData.executionId')
      .select([
        'COUNT(DISTINCT executionData.nodeId) as totalNodes',
        'AVG(nodesPerExecution.nodeCount) as avgNodesPerExecution',
      ])
      .addSelect(subQuery => {
        return subQuery
          .select('COUNT(*) as nodeCount')
          .from('execution_data', 'ed')
          .where('ed.executionId = executionData.executionId');
      }, 'nodesPerExecution')
      .where('execution.workflowId = :workflowId', { workflowId })
      .getRawOne();

    // Find slowest node
    const slowestNode = await this.executionDataRepository
      .createQueryBuilder('executionData')
      .innerJoin('execution', 'execution', 'execution.id = executionData.executionId')
      .select([
        'executionData.nodeId as nodeId',
        'executionData.nodeName as nodeName',
        'AVG(executionData.executionTime) as avgDuration',
      ])
      .where('execution.workflowId = :workflowId', { workflowId })
      .andWhere('executionData.executionTime > 0')
      .groupBy('executionData.nodeId, executionData.nodeName')
      .orderBy('avgDuration', 'DESC')
      .limit(1)
      .getRawOne();

    return {
      totalNodes: parseInt(nodeStats.totalnodes) || 0,
      averageNodesPerExecution: parseFloat(nodeStats.avgnodesperexecution) || 0,
      slowestNode: slowestNode ? {
        nodeId: slowestNode.nodeid,
        nodeName: slowestNode.nodename,
        averageDuration: parseFloat(slowestNode.avgduration),
      } : undefined,
    };
  }

  private async getMostCommonErrors() {
    const errors = await this.executionRepository
      .createQueryBuilder('execution')
      .select([
        'execution.error as error',
        'COUNT(*) as count',
      ])
      .where('execution.error IS NOT NULL')
      .andWhere('execution.error != \'\'')
      .groupBy('execution.error')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const totalErrors = errors.reduce((sum, error) => sum + parseInt(error.count), 0);

    return errors.map(error => ({
      error: error.error,
      count: parseInt(error.count),
      percentage: totalErrors > 0 ? (parseInt(error.count) / totalErrors) * 100 : 0,
    }));
  }

  private async getErrorsByNode() {
    return this.executionDataRepository
      .createQueryBuilder('executionData')
      .select([
        'executionData.nodeId as nodeId',
        'executionData.nodeName as nodeName',
        'SUM(CASE WHEN executionData.error IS NOT NULL THEN 1 ELSE 0 END) as errorCount',
        'COUNT(*) as totalExecutions',
      ])
      .groupBy('executionData.nodeId, executionData.nodeName')
      .having('COUNT(*) > 0')
      .orderBy('errorCount', 'DESC')
      .limit(20)
      .getRawMany()
      .then(results => 
        results.map(row => ({
          nodeId: row.nodeid,
          nodeName: row.nodename,
          errorCount: parseInt(row.errorcount),
          totalExecutions: parseInt(row.totalexecutions),
          errorRate: (parseInt(row.errorcount) / parseInt(row.totalexecutions)) * 100,
        }))
      );
  }
}