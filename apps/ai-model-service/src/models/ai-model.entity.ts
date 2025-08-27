import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../api/src/entities/base.entity';
import { User } from '../../../api/src/entities/user.entity';

export enum ModelType {
  TEXT_CLASSIFICATION = 'text_classification',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
  NAMED_ENTITY_RECOGNITION = 'ner',
  LANGUAGE_MODEL = 'language_model',
  IMAGE_CLASSIFICATION = 'image_classification',
  OBJECT_DETECTION = 'object_detection',
  SPEECH_TO_TEXT = 'speech_to_text',
  TEXT_TO_SPEECH = 'text_to_speech',
  CUSTOM = 'custom',
}

export enum ModelStatus {
  DRAFT = 'draft',
  TRAINING = 'training',
  VALIDATING = 'validating',
  DEPLOYED = 'deployed',
  FAILED = 'failed',
  ARCHIVED = 'archived',
}

export enum ModelFramework {
  TENSORFLOW = 'tensorflow',
  PYTORCH = 'pytorch',
  HUGGINGFACE = 'huggingface',
  SCIKIT_LEARN = 'scikit_learn',
  LANGCHAIN = 'langchain',
  CUSTOM = 'custom',
}

@Entity('ai_models')
@Index(['name', 'userId'])
@Index(['type', 'status'])
@Index(['organizationId'])
export class AIModel extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ModelType,
  })
  type: ModelType;

  @Column({
    type: 'enum',
    enum: ModelStatus,
    default: ModelStatus.DRAFT,
  })
  status: ModelStatus;

  @Column({
    type: 'enum',
    enum: ModelFramework,
  })
  framework: ModelFramework;

  @Column()
  userId: string;

  @Column({ nullable: true })
  organizationId: string;

  @Column({ length: 50 })
  version: string;

  @Column({ type: 'jsonb' })
  configuration: {
    hyperparameters: Record<string, any>;
    architecture: Record<string, any>;
    training_config: {
      epochs?: number;
      batch_size?: number;
      learning_rate?: number;
      optimizer?: string;
      loss_function?: string;
    };
    deployment_config: {
      cpu_request?: string;
      memory_request?: string;
      gpu_required?: boolean;
      replicas?: number;
      auto_scaling?: boolean;
    };
  };

  @Column({ type: 'jsonb', nullable: true })
  trainingData: {
    dataset_id: string;
    dataset_url?: string;
    training_size: number;
    validation_size: number;
    test_size: number;
    data_format: 'json' | 'csv' | 'parquet' | 'tfrecord';
    preprocessing_steps: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  metrics: {
    training_accuracy?: number;
    validation_accuracy?: number;
    test_accuracy?: number;
    precision?: number;
    recall?: number;
    f1_score?: number;
    loss?: number;
    training_time_minutes?: number;
    model_size_mb?: number;
    inference_time_ms?: number;
  };

  @Column({ nullable: true })
  modelArtifactUrl: string;

  @Column({ nullable: true })
  dockerImageUrl: string;

  @Column({ nullable: true })
  deploymentUrl: string;

  @Column({ nullable: true })
  apiEndpoint: string;

  @Column({ type: 'jsonb', nullable: true })
  apiSchema: {
    input_schema: Record<string, any>;
    output_schema: Record<string, any>;
    examples: Array<{
      input: any;
      output: any;
      description?: string;
    }>;
  };

  @Column({ default: false })
  isPublic: boolean;

  @Column({ default: 0 })
  downloadCount: number;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ nullable: true })
  trainingStartedAt: Date;

  @Column({ nullable: true })
  trainingCompletedAt: Date;

  @Column({ nullable: true })
  deployedAt: Date;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  experimentTracking: {
    mlflow_run_id?: string;
    wandb_run_id?: string;
    experiment_id?: string;
    artifacts: Array<{
      name: string;
      type: string;
      url: string;
      size_bytes: number;
    }>;
  };

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => ModelVersion, (version) => version.model)
  versions: ModelVersion[];

  @OneToMany(() => ModelDeployment, (deployment) => deployment.model)
  deployments: ModelDeployment[];

  @OneToMany(() => ModelUsage, (usage) => usage.model)
  usageHistory: ModelUsage[];

  // Virtual properties
  get trainingDuration(): number | null {
    if (this.trainingStartedAt && this.trainingCompletedAt) {
      return this.trainingCompletedAt.getTime() - this.trainingStartedAt.getTime();
    }
    return null;
  }

  get isTraining(): boolean {
    return this.status === ModelStatus.TRAINING;
  }

  get isDeployed(): boolean {
    return this.status === ModelStatus.DEPLOYED && !!this.deploymentUrl;
  }
}

@Entity('model_versions')
export class ModelVersion extends BaseEntity {
  @Column()
  modelId: string;

  @Column({ length: 50 })
  version: string;

  @Column({ type: 'text', nullable: true })
  changelog: string;

  @Column({ type: 'jsonb' })
  metrics: Record<string, number>;

  @Column()
  artifactUrl: string;

  @Column({ default: false })
  isActive: boolean;

  @ManyToOne(() => AIModel, (model) => model.versions)
  @JoinColumn({ name: 'modelId' })
  model: AIModel;
}

@Entity('model_deployments')
export class ModelDeployment extends BaseEntity {
  @Column()
  modelId: string;

  @Column({ length: 100 })
  deploymentName: string;

  @Column()
  version: string;

  @Column()
  endpoint: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'running', 'failed', 'stopped'],
    default: 'pending',
  })
  status: string;

  @Column({ type: 'jsonb' })
  config: {
    replicas: number;
    cpu_limit: string;
    memory_limit: string;
    gpu_enabled: boolean;
    auto_scaling: boolean;
    max_replicas?: number;
    target_cpu_utilization?: number;
  };

  @Column({ nullable: true })
  deployedAt: Date;

  @Column({ nullable: true })
  stoppedAt: Date;

  @ManyToOne(() => AIModel, (model) => model.deployments)
  @JoinColumn({ name: 'modelId' })
  model: AIModel;
}

@Entity('model_usage')
@Index(['modelId', 'timestamp'])
export class ModelUsage extends BaseEntity {
  @Column()
  modelId: string;

  @Column({ nullable: true })
  userId: string;

  @Column()
  timestamp: Date;

  @Column({ type: 'jsonb' })
  request: {
    input_size_bytes: number;
    processing_time_ms: number;
    success: boolean;
    error?: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    ip_address?: string;
    user_agent?: string;
    api_key_id?: string;
    workflow_id?: string;
    node_id?: string;
  };

  @ManyToOne(() => AIModel, (model) => model.usageHistory)
  @JoinColumn({ name: 'modelId' })
  model: AIModel;
}