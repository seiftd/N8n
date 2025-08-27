import { JSONSchema7 } from 'jsonschema';

/**
 * Plugin metadata information
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable plugin name */
  name: string;
  /** Plugin description */
  description: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Plugin license */
  license: string;
  /** Plugin homepage URL */
  homepage?: string;
  /** Plugin repository URL */
  repository?: string;
  /** Plugin keywords for discovery */
  keywords: string[];
  /** Plugin category */
  category: PluginCategory;
  /** Minimum Sbaro version required */
  sbaroVersion: string;
  /** Plugin dependencies */
  dependencies?: Record<string, string>;
  /** Plugin configuration schema */
  configSchema?: JSONSchema7;
}

/**
 * Plugin categories for organization
 */
export enum PluginCategory {
  INTEGRATION = 'integration',
  TRANSFORMATION = 'transformation',
  NOTIFICATION = 'notification',
  STORAGE = 'storage',
  AI_ML = 'ai_ml',
  AUTHENTICATION = 'authentication',
  MONITORING = 'monitoring',
  UTILITY = 'utility',
  CUSTOM = 'custom',
}

/**
 * Plugin execution context
 */
export interface PluginContext {
  /** Current execution ID */
  executionId: string;
  /** Current workflow ID */
  workflowId: string;
  /** Current node ID */
  nodeId: string;
  /** User ID */
  userId: string;
  /** Organization ID */
  organizationId?: string;
  /** Execution environment */
  environment: 'development' | 'staging' | 'production';
  /** Plugin configuration */
  config: Record<string, any>;
  /** Node input data */
  inputData: any[];
  /** Node parameters */
  parameters: Record<string, any>;
  /** Available credentials */
  credentials: Record<string, any>;
  /** Plugin logger */
  logger: PluginLogger;
  /** Plugin storage */
  storage: PluginStorage;
  /** HTTP client */
  http: PluginHttpClient;
  /** Event emitter */
  events: PluginEventEmitter;
}

/**
 * Plugin execution result
 */
export interface PluginResult {
  /** Execution success status */
  success: boolean;
  /** Output data */
  data: any[];
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Execution metrics */
  metrics?: {
    executionTime: number;
    memoryUsage: number;
    [key: string]: any;
  };
}

/**
 * Plugin node definition
 */
export interface PluginNodeDefinition {
  /** Node type identifier */
  type: string;
  /** Node display name */
  name: string;
  /** Node description */
  description: string;
  /** Node category */
  category: string;
  /** Node icon (optional) */
  icon?: string;
  /** Node color (hex) */
  color?: string;
  /** Input handles */
  inputs: PluginNodeHandle[];
  /** Output handles */
  outputs: PluginNodeHandle[];
  /** Node parameters schema */
  parametersSchema: JSONSchema7;
  /** Credentials required */
  credentials?: PluginCredentialRequirement[];
  /** Node execution function */
  execute: (context: PluginContext) => Promise<PluginResult>;
  /** Node validation function */
  validate?: (parameters: Record<string, any>) => ValidationResult;
}

/**
 * Plugin node handle (input/output)
 */
export interface PluginNodeHandle {
  /** Handle ID */
  id: string;
  /** Handle label */
  label: string;
  /** Handle data type */
  type: 'any' | 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Handle description */
  description?: string;
  /** Whether handle is required */
  required?: boolean;
}

/**
 * Plugin credential requirement
 */
export interface PluginCredentialRequirement {
  /** Credential type */
  type: string;
  /** Credential name */
  name: string;
  /** Credential description */
  description: string;
  /** Whether credential is required */
  required: boolean;
  /** Credential schema */
  schema: JSONSchema7;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

/**
 * Plugin storage interface
 */
export interface PluginStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * Plugin HTTP client interface
 */
export interface PluginHttpClient {
  get(url: string, config?: any): Promise<any>;
  post(url: string, data?: any, config?: any): Promise<any>;
  put(url: string, data?: any, config?: any): Promise<any>;
  delete(url: string, config?: any): Promise<any>;
  patch(url: string, data?: any, config?: any): Promise<any>;
  request(config: any): Promise<any>;
}

/**
 * Plugin event emitter interface
 */
export interface PluginEventEmitter {
  emit(event: string, data?: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  /** Plugin enabled status */
  enabled: boolean;
  /** Plugin configuration values */
  config: Record<string, any>;
  /** Plugin credentials */
  credentials: Record<string, any>;
  /** Plugin environment variables */
  env: Record<string, string>;
}

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  /** Plugin metadata */
  metadata: PluginMetadata;
  /** Plugin configuration */
  config: PluginConfig;
  /** Plugin node definitions */
  nodes: PluginNodeDefinition[];
  /** Plugin installation status */
  status: 'installed' | 'enabled' | 'disabled' | 'error';
  /** Plugin installation date */
  installedAt: Date;
  /** Plugin last update date */
  updatedAt: Date;
  /** Plugin installation path */
  path: string;
}