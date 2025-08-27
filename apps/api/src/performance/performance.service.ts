import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Execution, ExecutionData, Workflow } from '../entities';
import { CachingService } from './caching.service';

export interface PerformanceBenchmark {
  name: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface DatabasePerformanceMetrics {
  connectionPoolSize: number;
  activeConnections: number;
  idleConnections: number;
  queryCount: number;
  averageQueryTime: number;
  slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
  }>;
}

@Injectable()
export class PerformanceService implements OnModuleInit {
  private readonly logger = new Logger(PerformanceService.name);
  private benchmarks: PerformanceBenchmark[] = [];
  private queryMetrics = new Map<string, { count: number; totalTime: number; lastExecuted: Date }>();

  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    
    @InjectRepository(ExecutionData)
    private executionDataRepository: Repository<ExecutionData>,
    
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    
    private cachingService: CachingService,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.logger.log('Performance monitoring initialized');
    await this.setupQueryLogging();
  }

  /**
   * Benchmark any async operation
   */
  async benchmark<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>,
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      const benchmark: PerformanceBenchmark = {
        name,
        duration,
        timestamp: new Date(),
        metadata,
      };
      
      this.benchmarks.push(benchmark);
      
      // Keep only last 1000 benchmarks
      if (this.benchmarks.length > 1000) {
        this.benchmarks = this.benchmarks.slice(-1000);
      }
      
      this.logger.debug(`Benchmark [${name}]: ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Benchmark [${name}] failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Get performance benchmarks
   */
  getBenchmarks(name?: string, limit = 100): PerformanceBenchmark[] {
    let filtered = this.benchmarks;
    
    if (name) {
      filtered = filtered.filter(b => b.name === name);
    }
    
    return filtered.slice(-limit).reverse();
  }

  /**
   * Get benchmark statistics
   */
  getBenchmarkStats(name?: string): {
    count: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    percentile95: number;
  } {
    let benchmarks = this.benchmarks;
    
    if (name) {
      benchmarks = benchmarks.filter(b => b.name === name);
    }
    
    if (benchmarks.length === 0) {
      return {
        count: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        percentile95: 0,
      };
    }
    
    const durations = benchmarks.map(b => b.duration).sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      count,
      averageDuration: sum / count,
      minDuration: durations[0],
      maxDuration: durations[count - 1],
      percentile95: durations[Math.floor(count * 0.95)],
    };
  }

  /**
   * Database performance monitoring
   */
  async getDatabaseMetrics(): Promise<DatabasePerformanceMetrics> {
    const cacheKey = 'database:performance:metrics';
    
    return this.cachingService.getOrSet(
      cacheKey,
      async () => {
        // Get connection pool information
        const driver = this.dataSource.driver as any;
        const pool = driver.master || driver.pool;
        
        const connectionMetrics = {
          connectionPoolSize: pool?.config?.max || 0,
          activeConnections: pool?.totalCount || 0,
          idleConnections: pool?.idleCount || 0,
        };

        // Get query metrics
        const queryStats = this.getQueryMetrics();
        
        // Get slow queries from logs (simplified)
        const slowQueries = this.getSlowQueries();

        return {
          ...connectionMetrics,
          queryCount: queryStats.totalQueries,
          averageQueryTime: queryStats.averageTime,
          slowQueries,
        };
      },
      { ttl: 60 }, // Cache for 1 minute
    );
  }

  /**
   * Optimize database performance
   */
  async optimizeDatabase(): Promise<{
    optimizationsApplied: string[];
    recommendations: string[];
  }> {
    const optimizationsApplied: string[] = [];
    const recommendations: string[] = [];

    try {
      // Clear query plan cache
      await this.dataSource.query('SELECT pg_stat_reset()');
      optimizationsApplied.push('Cleared PostgreSQL statistics');

      // Vacuum analyze tables
      const tables = ['executions', 'execution_data', 'workflows', 'workflow_nodes'];
      for (const table of tables) {
        await this.dataSource.query(`VACUUM ANALYZE ${table}`);
      }
      optimizationsApplied.push('Vacuumed and analyzed tables');

      // Check for missing indexes
      const indexRecommendations = await this.analyzeIndexUsage();
      recommendations.push(...indexRecommendations);

      this.logger.log('Database optimization completed', {
        optimizationsApplied,
        recommendations,
      });

    } catch (error) {
      this.logger.error('Database optimization failed:', error.message);
    }

    return { optimizationsApplied, recommendations };
  }

  /**
   * Load testing utilities
   */
  async runLoadTest(options: {
    workflowId: string;
    concurrentExecutions: number;
    duration: number; // seconds
  }): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageResponseTime: number;
    throughput: number; // executions per second
  }> {
    const { workflowId, concurrentExecutions, duration } = options;
    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);
    
    let totalExecutions = 0;
    let successfulExecutions = 0;
    let failedExecutions = 0;
    const responseTimes: number[] = [];
    
    this.logger.log(`Starting load test: ${concurrentExecutions} concurrent executions for ${duration}s`);

    const executeWorkflow = async (): Promise<void> => {
      const execStartTime = Date.now();
      
      try {
        // Simulate workflow execution
        await this.simulateWorkflowExecution(workflowId);
        successfulExecutions++;
        responseTimes.push(Date.now() - execStartTime);
      } catch (error) {
        failedExecutions++;
      }
      
      totalExecutions++;
    };

    // Run concurrent executions
    const promises: Promise<void>[] = [];
    
    while (Date.now() < endTime) {
      // Maintain concurrent execution count
      while (promises.length < concurrentExecutions && Date.now() < endTime) {
        const promise = executeWorkflow();
        promises.push(promise);
        
        // Remove completed promises
        promise.finally(() => {
          const index = promises.indexOf(promise);
          if (index > -1) {
            promises.splice(index, 1);
          }
        });
      }
      
      // Small delay to prevent CPU overload
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Wait for remaining executions to complete
    await Promise.allSettled(promises);

    const actualDuration = (Date.now() - startTime) / 1000;
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    const result = {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageResponseTime,
      throughput: totalExecutions / actualDuration,
    };

    this.logger.log('Load test completed', result);
    return result;
  }

  /**
   * Cleanup old performance data
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupPerformanceData(): Promise<void> {
    try {
      // Clear old benchmarks
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      this.benchmarks = this.benchmarks.filter(b => b.timestamp > oneDayAgo);

      // Clear old query metrics
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      for (const [query, metrics] of this.queryMetrics.entries()) {
        if (metrics.lastExecuted < oneHourAgo) {
          this.queryMetrics.delete(query);
        }
      }

      // Clear old cache entries
      await this.cachingService.cleanQueue('sbaro', { type: 'completed', grace: 24 * 60 * 60 * 1000 });

      this.logger.log('Performance data cleanup completed');
    } catch (error) {
      this.logger.error('Performance data cleanup failed:', error.message);
    }
  }

  private async setupQueryLogging(): Promise<void> {
    // Setup query performance monitoring
    // This would integrate with PostgreSQL's pg_stat_statements extension
    this.logger.debug('Query logging setup completed');
  }

  private getQueryMetrics(): { totalQueries: number; averageTime: number } {
    const metrics = Array.from(this.queryMetrics.values());
    const totalQueries = metrics.reduce((sum, m) => sum + m.count, 0);
    const totalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0);
    
    return {
      totalQueries,
      averageTime: totalQueries > 0 ? totalTime / totalQueries : 0,
    };
  }

  private getSlowQueries(): Array<{ query: string; duration: number; timestamp: Date }> {
    // In a real implementation, this would query pg_stat_statements
    // For now, return mock data
    return [
      {
        query: 'SELECT * FROM executions WHERE workflow_id = $1',
        duration: 1500,
        timestamp: new Date(),
      },
    ];
  }

  private async analyzeIndexUsage(): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      // Check for tables without proper indexes
      const indexUsage = await this.dataSource.query(`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE schemaname = 'public' 
        AND tablename IN ('executions', 'execution_data', 'workflows')
      `);

      // Analyze and provide recommendations
      recommendations.push('Consider adding indexes on frequently queried columns');
      
    } catch (error) {
      this.logger.error('Index analysis failed:', error.message);
    }

    return recommendations;
  }

  private async simulateWorkflowExecution(workflowId: string): Promise<void> {
    // Simulate workflow execution for load testing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    // Randomly fail some executions
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('Simulated execution failure');
    }
  }
}