import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../api/src/entities/base.entity';
import { User } from '../../../api/src/entities/user.entity';

export enum TemplateCategory {
  BUSINESS_AUTOMATION = 'business_automation',
  DATA_PROCESSING = 'data_processing',
  MARKETING = 'marketing',
  CUSTOMER_SUPPORT = 'customer_support',
  DEVELOPMENT = 'development',
  FINANCE = 'finance',
  HEALTHCARE = 'healthcare',
  EDUCATION = 'education',
  ECOMMERCE = 'ecommerce',
  SOCIAL_MEDIA = 'social_media',
  AI_ML = 'ai_ml',
  UTILITIES = 'utilities',
  INTEGRATION = 'integration',
  OTHER = 'other',
}

export enum TemplateStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum TemplateVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  ORGANIZATION = 'organization',
  PREMIUM = 'premium',
}

@Entity('marketplace_templates')
@Index(['category', 'status'])
@Index(['authorId'])
@Index(['tags'], { where: 'tags IS NOT NULL' })
@Index(['downloadCount'])
@Index(['rating'])
export class MarketplaceTemplate extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  readme: string;

  @Column({
    type: 'enum',
    enum: TemplateCategory,
  })
  category: TemplateCategory;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.DRAFT,
  })
  status: TemplateStatus;

  @Column({
    type: 'enum',
    enum: TemplateVisibility,
    default: TemplateVisibility.PUBLIC,
  })
  visibility: TemplateVisibility;

  @Column()
  authorId: string;

  @Column({ nullable: true })
  organizationId: string;

  @Column({ length: 20 })
  version: string;

  @Column({ type: 'jsonb' })
  workflowDefinition: {
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: any;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }>;
    metadata: {
      sbaro_version: string;
      created_at: string;
      variables: Record<string, any>;
      settings: Record<string, any>;
    };
  };

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  useCases: string[];

  @Column({ type: 'jsonb', nullable: true })
  requirements: {
    credentials?: Array<{
      service: string;
      type: string;
      required: boolean;
      description: string;
    }>;
    dependencies?: Array<{
      package: string;
      version: string;
      optional: boolean;
    }>;
    environment?: Record<string, string>;
    minimum_sbaro_version: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  configuration: {
    variables: Array<{
      name: string;
      type: string;
      default_value?: any;
      description: string;
      required: boolean;
    }>;
    settings: Array<{
      key: string;
      value: any;
      description: string;
    }>;
  };

  @Column({ nullable: true, length: 500 })
  thumbnailUrl: string;

  @Column({ type: 'text', array: true, default: '{}' })
  screenshots: string[];

  @Column({ nullable: true, length: 500 })
  demoUrl: string;

  @Column({ nullable: true, length: 500 })
  videoUrl: string;

  @Column({ nullable: true, length: 500 })
  documentationUrl: string;

  @Column({ nullable: true, length: 500 })
  sourceCodeUrl: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: 0 })
  downloadCount: number;

  @Column({ default: 0 })
  forkCount: number;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number;

  @Column({ length: 3, nullable: true })
  currency: string;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'jsonb', nullable: true })
  analytics: {
    weekly_downloads: number;
    monthly_downloads: number;
    unique_users: number;
    avg_execution_time: number;
    success_rate: number;
    popular_regions: string[];
  };

  @Column({ nullable: true })
  publishedAt: Date;

  @Column({ nullable: true })
  lastUpdatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @OneToMany(() => TemplateReview, (review) => review.template)
  reviews: TemplateReview[];

  @OneToMany(() => TemplateDownload, (download) => download.template)
  downloads: TemplateDownload[];

  @OneToMany(() => TemplateVersion, (version) => version.template)
  versions: TemplateVersion[];

  @OneToMany(() => TemplateFork, (fork) => fork.originalTemplate)
  forks: TemplateFork[];

  // Virtual properties
  get isPublished(): boolean {
    return this.status === TemplateStatus.APPROVED && !!this.publishedAt;
  }

  get isPremium(): boolean {
    return this.visibility === TemplateVisibility.PREMIUM && !!this.price;
  }
}

@Entity('template_reviews')
@Index(['templateId', 'rating'])
export class TemplateReview extends BaseEntity {
  @Column()
  templateId: string;

  @Column()
  userId: string;

  @Column({ type: 'int', width: 1 })
  rating: number; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ default: false })
  isVerified: boolean; // Verified purchase/usage

  @Column({ default: 0 })
  helpfulVotes: number;

  @Column({ nullable: true })
  usageContext: string; // How they used the template

  @ManyToOne(() => MarketplaceTemplate, (template) => template.reviews)
  @JoinColumn({ name: 'templateId' })
  template: MarketplaceTemplate;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('template_downloads')
@Index(['templateId', 'createdAt'])
export class TemplateDownload extends BaseEntity {
  @Column()
  templateId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true, length: 45 })
  ipAddress: string;

  @Column({ nullable: true, length: 500 })
  userAgent: string;

  @Column({ nullable: true })
  country: string;

  @Column({ default: false })
  isPremiumDownload: boolean;

  @ManyToOne(() => MarketplaceTemplate, (template) => template.downloads)
  @JoinColumn({ name: 'templateId' })
  template: MarketplaceTemplate;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('template_versions')
export class TemplateVersion extends BaseEntity {
  @Column()
  templateId: string;

  @Column({ length: 20 })
  version: string;

  @Column({ type: 'text', nullable: true })
  changelog: string;

  @Column({ type: 'jsonb' })
  workflowDefinition: any;

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: 0 })
  downloadCount: number;

  @ManyToOne(() => MarketplaceTemplate, (template) => template.versions)
  @JoinColumn({ name: 'templateId' })
  template: MarketplaceTemplate;
}

@Entity('template_forks')
export class TemplateFork extends BaseEntity {
  @Column()
  originalTemplateId: string;

  @Column()
  forkedTemplateId: string;

  @Column()
  userId: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @ManyToOne(() => MarketplaceTemplate, (template) => template.forks)
  @JoinColumn({ name: 'originalTemplateId' })
  originalTemplate: MarketplaceTemplate;

  @ManyToOne(() => MarketplaceTemplate)
  @JoinColumn({ name: 'forkedTemplateId' })
  forkedTemplate: MarketplaceTemplate;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('template_collections')
export class TemplateCollection extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  userId: string;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ type: 'text', array: true, default: '{}' })
  templateIds: string[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}