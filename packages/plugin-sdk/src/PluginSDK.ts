import { EventEmitter } from 'events';
import * as Joi from 'joi';
import { validate as validateSchema } from 'jsonschema';
import {
  PluginMetadata,
  PluginContext,
  PluginResult,
  PluginNodeDefinition,
  PluginLogger,
  PluginStorage,
  PluginHttpClient,
  PluginEventEmitter,
  ValidationResult,
  PluginConfig,
} from './types/plugin';

/**
 * Main SDK class for creating Sbaro plugins
 */
export class PluginSDK {
  private metadata: PluginMetadata;
  private nodes: Map<string, PluginNodeDefinition> = new Map();
  private config: PluginConfig | null = null;
  private eventEmitter = new EventEmitter();

  constructor(metadata: PluginMetadata) {
    this.validateMetadata(metadata);
    this.metadata = metadata;
  }

  /**
   * Register a new node type
   */
  registerNode(node: PluginNodeDefinition): void {
    // Validate node definition
    this.validateNodeDefinition(node);

    // Check for duplicate node types
    if (this.nodes.has(node.type)) {
      throw new Error(`Node type '${node.type}' is already registered`);
    }

    this.nodes.set(node.type, node);
  }

  /**
   * Get all registered nodes
   */
  getNodes(): PluginNodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get node by type
   */
  getNode(type: string): PluginNodeDefinition | undefined {
    return this.nodes.get(type);
  }

  /**
   * Execute a node
   */
  async executeNode(type: string, context: PluginContext): Promise<PluginResult> {
    const node = this.nodes.get(type);
    if (!node) {
      throw new Error(`Node type '${type}' not found`);
    }

    try {
      // Validate node parameters
      if (node.validate) {
        const validation = node.validate(context.parameters);
        if (!validation.valid) {
          return {
            success: false,
            data: [],
            error: `Validation failed: ${validation.errors.join(', ')}`,
          };
        }
      }

      // Validate parameters against schema
      const schemaValidation = validateSchema(context.parameters, node.parametersSchema);
      if (!schemaValidation.valid) {
        return {
          success: false,
          data: [],
          error: `Parameter validation failed: ${schemaValidation.errors.map(e => e.message).join(', ')}`,
        };
      }

      // Execute node
      const startTime = Date.now();
      const result = await node.execute(context);
      const executionTime = Date.now() - startTime;

      // Add execution metrics
      result.metrics = {
        ...result.metrics,
        executionTime,
        memoryUsage: process.memoryUsage().heapUsed,
      };

      return result;
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Initialize plugin with configuration
   */
  initialize(config: PluginConfig): void {
    this.config = config;
    
    // Validate configuration against schema
    if (this.metadata.configSchema) {
      const validation = validateSchema(config.config, this.metadata.configSchema);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }
    }

    this.eventEmitter.emit('initialized', config);
  }

  /**
   * Get plugin metadata
   */
  getMetadata(): PluginMetadata {
    return { ...this.metadata };
  }

  /**
   * Get plugin configuration
   */
  getConfig(): PluginConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Create a plugin context for testing
   */
  createTestContext(overrides: Partial<PluginContext> = {}): PluginContext {
    return {
      executionId: 'test-execution',
      workflowId: 'test-workflow',
      nodeId: 'test-node',
      userId: 'test-user',
      environment: 'development',
      config: this.config?.config || {},
      inputData: [],
      parameters: {},
      credentials: {},
      logger: this.createLogger(),
      storage: this.createStorage(),
      http: this.createHttpClient(),
      events: this.createEventEmitter(),
      ...overrides,
    };
  }

  /**
   * Validate plugin metadata
   */
  private validateMetadata(metadata: PluginMetadata): void {
    const schema = Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      version: Joi.string().pattern(/^\d+\.\d+\.\d+/).required(),
      author: Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().optional(),
        url: Joi.string().uri().optional(),
      }).required(),
      license: Joi.string().required(),
      homepage: Joi.string().uri().optional(),
      repository: Joi.string().uri().optional(),
      keywords: Joi.array().items(Joi.string()).required(),
      category: Joi.string().required(),
      sbaroVersion: Joi.string().required(),
      dependencies: Joi.object().optional(),
      configSchema: Joi.object().optional(),
    });

    const { error } = schema.validate(metadata);
    if (error) {
      throw new Error(`Invalid plugin metadata: ${error.message}`);
    }
  }

  /**
   * Validate node definition
   */
  private validateNodeDefinition(node: PluginNodeDefinition): void {
    if (!node.type || typeof node.type !== 'string') {
      throw new Error('Node type must be a non-empty string');
    }

    if (!node.name || typeof node.name !== 'string') {
      throw new Error('Node name must be a non-empty string');
    }

    if (!node.execute || typeof node.execute !== 'function') {
      throw new Error('Node execute function is required');
    }

    if (!Array.isArray(node.inputs) || !Array.isArray(node.outputs)) {
      throw new Error('Node inputs and outputs must be arrays');
    }

    if (!node.parametersSchema || typeof node.parametersSchema !== 'object') {
      throw new Error('Node parameters schema is required');
    }
  }

  /**
   * Create a logger instance
   */
  private createLogger(): PluginLogger {
    return {
      debug: (message: string, meta?: any) => {
        console.debug(`[${this.metadata.id}] DEBUG:`, message, meta);
      },
      info: (message: string, meta?: any) => {
        console.info(`[${this.metadata.id}] INFO:`, message, meta);
      },
      warn: (message: string, meta?: any) => {
        console.warn(`[${this.metadata.id}] WARN:`, message, meta);
      },
      error: (message: string, meta?: any) => {
        console.error(`[${this.metadata.id}] ERROR:`, message, meta);
      },
    };
  }

  /**
   * Create a storage instance
   */
  private createStorage(): PluginStorage {
    const storage = new Map<string, any>();

    return {
      async get(key: string): Promise<any> {
        return storage.get(key);
      },
      async set(key: string, value: any, ttl?: number): Promise<void> {
        storage.set(key, value);
        if (ttl) {
          setTimeout(() => storage.delete(key), ttl * 1000);
        }
      },
      async delete(key: string): Promise<void> {
        storage.delete(key);
      },
      async clear(): Promise<void> {
        storage.clear();
      },
      async keys(): Promise<string[]> {
        return Array.from(storage.keys());
      },
    };
  }

  /**
   * Create an HTTP client instance
   */
  private createHttpClient(): PluginHttpClient {
    const axios = require('axios');
    
    return {
      async get(url: string, config?: any): Promise<any> {
        const response = await axios.get(url, config);
        return response.data;
      },
      async post(url: string, data?: any, config?: any): Promise<any> {
        const response = await axios.post(url, data, config);
        return response.data;
      },
      async put(url: string, data?: any, config?: any): Promise<any> {
        const response = await axios.put(url, data, config);
        return response.data;
      },
      async delete(url: string, config?: any): Promise<any> {
        const response = await axios.delete(url, config);
        return response.data;
      },
      async patch(url: string, data?: any, config?: any): Promise<any> {
        const response = await axios.patch(url, data, config);
        return response.data;
      },
      async request(config: any): Promise<any> {
        const response = await axios.request(config);
        return response.data;
      },
    };
  }

  /**
   * Create an event emitter instance
   */
  private createEventEmitter(): PluginEventEmitter {
    return {
      emit: (event: string, data?: any) => {
        this.eventEmitter.emit(event, data);
      },
      on: (event: string, handler: (data: any) => void) => {
        this.eventEmitter.on(event, handler);
      },
      off: (event: string, handler: (data: any) => void) => {
        this.eventEmitter.off(event, handler);
      },
    };
  }
}

/**
 * Utility functions for plugin development
 */
export class PluginUtils {
  /**
   * Create a simple validation function
   */
  static createValidator(schema: any): (data: any) => ValidationResult {
    return (data: any): ValidationResult => {
      const { error } = Joi.object(schema).validate(data);
      
      if (error) {
        return {
          valid: false,
          errors: error.details.map(d => d.message),
          warnings: [],
        };
      }

      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    };
  }

  /**
   * Create a retry wrapper for async operations
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }

        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }

    throw lastError!;
  }

  /**
   * Create a timeout wrapper for async operations
   */
  static async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      ),
    ]);
  }

  /**
   * Sanitize and validate input data
   */
  static sanitizeInput(input: any, schema: any): any {
    // Basic input sanitization
    if (typeof input === 'string') {
      input = input.trim();
    }

    // Validate against schema
    const { error, value } = Joi.object(schema).validate(input);
    if (error) {
      throw new Error(`Input validation failed: ${error.message}`);
    }

    return value;
  }

  /**
   * Format error for consistent error handling
   */
  static formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }

    return 'An unknown error occurred';
  }
}

// Export the SDK class as default
export default PluginSDK;