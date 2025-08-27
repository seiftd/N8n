import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compressed?: boolean;
}

@Injectable()
export class CachingService {
  private readonly logger = new Logger(CachingService.name);
  private readonly redis: Redis;
  private readonly defaultTTL = 3600; // 1 hour

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('redis.host'),
      port: this.configService.get('redis.port'),
      password: this.configService.get('redis.password'),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis for caching');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis caching error:', error);
    });
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(this.prefixKey(key));
      if (!cached) return null;

      return JSON.parse(cached);
    } catch (error) {
      this.logger.error(`Failed to get cached value for key: ${key}`, error);
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    try {
      const ttl = options.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      
      await this.redis.setex(this.prefixKey(key), ttl, serialized);
      
      this.logger.debug(`Cached value for key: ${key} with TTL: ${ttl}s`);
    } catch (error) {
      this.logger.error(`Failed to cache value for key: ${key}`, error);
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefixKey(key));
      this.logger.debug(`Deleted cached value for key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete cached value for key: ${key}`, error);
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.prefixKey(key));
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check existence for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit for key: ${key}`);
      return cached;
    }

    // Cache miss - execute function and cache result
    this.logger.debug(`Cache miss for key: ${key}`);
    const result = await fetchFunction();
    
    // Don't cache null/undefined results
    if (result !== null && result !== undefined) {
      await this.set(key, result, options);
    }

    return result;
  }

  /**
   * Workflow-specific caching methods
   */
  async cacheWorkflowDefinition(workflowId: string, workflow: any): Promise<void> {
    await this.set(`workflow:definition:${workflowId}`, workflow, { ttl: 1800 }); // 30 minutes
  }

  async getCachedWorkflowDefinition(workflowId: string): Promise<any> {
    return this.get(`workflow:definition:${workflowId}`);
  }

  async cacheNodeConfiguration(nodeId: string, config: any): Promise<void> {
    await this.set(`node:config:${nodeId}`, config, { ttl: 3600 }); // 1 hour
  }

  async getCachedNodeConfiguration(nodeId: string): Promise<any> {
    return this.get(`node:config:${nodeId}`);
  }

  async cacheCredentialMetadata(credentialId: string, metadata: any): Promise<void> {
    // Short TTL for credential metadata for security
    await this.set(`credential:metadata:${credentialId}`, metadata, { ttl: 300 }); // 5 minutes
  }

  async getCachedCredentialMetadata(credentialId: string): Promise<any> {
    return this.get(`credential:metadata:${credentialId}`);
  }

  async cacheExecutionResult(executionId: string, result: any): Promise<void> {
    // Cache execution results for debugging/replay
    await this.set(`execution:result:${executionId}`, result, { ttl: 86400 }); // 24 hours
  }

  async getCachedExecutionResult(executionId: string): Promise<any> {
    return this.get(`execution:result:${executionId}`);
  }

  /**
   * User session caching
   */
  async cacheUserSession(sessionId: string, userData: any): Promise<void> {
    await this.set(`session:${sessionId}`, userData, { ttl: 3600 }); // 1 hour
  }

  async getCachedUserSession(sessionId: string): Promise<any> {
    return this.get(`session:${sessionId}`);
  }

  async invalidateUserSession(sessionId: string): Promise<void> {
    await this.delete(`session:${sessionId}`);
  }

  /**
   * Performance metrics caching
   */
  async cacheMetrics(metricsKey: string, metrics: any): Promise<void> {
    await this.set(`metrics:${metricsKey}`, metrics, { ttl: 300 }); // 5 minutes
  }

  async getCachedMetrics(metricsKey: string): Promise<any> {
    return this.get(`metrics:${metricsKey}`);
  }

  /**
   * Bulk operations
   */
  async setMultiple(entries: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    entries.forEach(({ key, value, options = {} }) => {
      const ttl = options.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      pipeline.setex(this.prefixKey(key), ttl, serialized);
    });

    await pipeline.exec();
    this.logger.debug(`Bulk cached ${entries.length} entries`);
  }

  async getMultiple(keys: string[]): Promise<Record<string, any>> {
    const pipeline = this.redis.pipeline();
    
    keys.forEach(key => {
      pipeline.get(this.prefixKey(key));
    });

    const results = await pipeline.exec();
    const data: Record<string, any> = {};

    results?.forEach((result, index) => {
      if (result && result[1]) {
        try {
          data[keys[index]] = JSON.parse(result[1] as string);
        } catch (error) {
          this.logger.error(`Failed to parse cached value for key: ${keys[index]}`);
        }
      }
    });

    return data;
  }

  async deleteMultiple(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    
    const prefixedKeys = keys.map(key => this.prefixKey(key));
    await this.redis.del(...prefixedKeys);
    
    this.logger.debug(`Bulk deleted ${keys.length} cache entries`);
  }

  /**
   * Cache invalidation patterns
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(this.prefixKey(pattern));
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(`Invalidated ${keys.length} cache entries matching pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`Failed to invalidate cache pattern: ${pattern}`, error);
    }
  }

  async invalidateWorkflowCache(workflowId: string): Promise<void> {
    await this.invalidatePattern(`workflow:*:${workflowId}*`);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.invalidatePattern(`user:*:${userId}*`);
  }

  /**
   * Cache statistics
   */
  async getCacheStats(): Promise<{
    info: any;
    keyCount: number;
    memoryUsage: string;
  }> {
    try {
      const info = await this.redis.info('memory');
      const keyCount = await this.redis.dbsize();
      
      return {
        info: this.parseRedisInfo(info),
        keyCount,
        memoryUsage: this.formatBytes(parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0')),
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats', error);
      return { info: {}, keyCount: 0, memoryUsage: '0 B' };
    }
  }

  private prefixKey(key: string): string {
    return `sbaro:${key}`;
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const lines = info.split('\r\n');
    const result: Record<string, string> = {};
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    });
    
    return result;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}