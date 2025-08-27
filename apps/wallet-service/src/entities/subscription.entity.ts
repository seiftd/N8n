import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../api/src/entities/base.entity';
import { User } from '../../../api/src/entities/user.entity';
import { Wallet } from './wallet.entity';

export enum SubscriptionTier {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
  UNLIMITED = 'unlimited',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
}

@Entity('subscription_plans')
export class SubscriptionPlan extends BaseEntity {
  @Column({
    type: 'enum',
    enum: SubscriptionTier,
    unique: true,
  })
  tier: SubscriptionTier;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceInSbaro: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceInUSD: string;

  @Column({ type: 'jsonb' })
  limits: {
    maxProjects: number;
    maxWorkflows: number;
    maxExecutionsPerMonth: number;
    maxAITrainingJobs: number;
    maxStorageGB: number;
    maxTeamMembers: number;
    maxApiCalls: number;
    maxQuantumJobs?: number;
    maxVRSessions?: number;
  };

  @Column({ type: 'jsonb' })
  features: {
    basicWorkflows: boolean;
    aiWorkflows: boolean;
    voiceInterface: boolean;
    predictiveAutomation: boolean;
    autonomousAgents: boolean;
    quantumOptimization: boolean;
    metaverseCollaboration: boolean;
    customAITraining: boolean;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
    templateMarketplace: boolean;
    pluginDevelopment: boolean;
    whiteLabeling: boolean;
    enterpriseSSO: boolean;
    dedicatedAccount: boolean;
  };

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  popularBadge: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @OneToMany(() => UserSubscription, (subscription) => subscription.plan)
  userSubscriptions: UserSubscription[];
}

@Entity('user_subscriptions')
@Index(['userId', 'status'])
@Index(['expiresAt'])
export class UserSubscription extends BaseEntity {
  @Column()
  userId: string;

  @Column()
  planId: string;

  @Column()
  walletId: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Column()
  startDate: Date;

  @Column()
  expiresAt: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  paidAmount: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountAmount: string;

  @Column({ nullable: true })
  paymentTransactionId: string;

  @Column({ default: false })
  isAutoRenew: boolean;

  @Column({ nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true, type: 'text' })
  cancellationReason: string;

  @Column({ type: 'jsonb' })
  usageStats: {
    projectsUsed: number;
    workflowsUsed: number;
    executionsUsed: number;
    aiJobsUsed: number;
    storageUsedGB: number;
    apiCallsUsed: number;
    quantumJobsUsed?: number;
    vrSessionsUsed?: number;
  };

  @Column({ nullable: true })
  lastUsageUpdate: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.userSubscriptions)
  @JoinColumn({ name: 'planId' })
  plan: SubscriptionPlan;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @OneToMany(() => SubscriptionUsageLog, (log) => log.subscription)
  usageLogs: SubscriptionUsageLog[];
}

@Entity('subscription_usage_logs')
@Index(['subscriptionId', 'date'])
@Index(['resourceType', 'date'])
export class SubscriptionUsageLog extends BaseEntity {
  @Column()
  subscriptionId: string;

  @Column({
    type: 'enum',
    enum: ['project', 'workflow', 'execution', 'ai_job', 'storage', 'api_call', 'quantum_job', 'vr_session'],
  })
  resourceType: string;

  @Column()
  resourceId: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => UserSubscription, (subscription) => subscription.usageLogs)
  @JoinColumn({ name: 'subscriptionId' })
  subscription: UserSubscription;
}

@Entity('subscription_discounts')
export class SubscriptionDiscount extends BaseEntity {
  @Column({ unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ['percentage', 'fixed_amount'],
  })
  discountType: 'percentage' | 'fixed_amount';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountValue: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxDiscountAmount: string;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({ type: 'int', nullable: true })
  maxUses: number;

  @Column({ type: 'int', default: 0 })
  currentUses: number;

  @Column({ type: 'simple-array', nullable: true })
  applicableTiers: SubscriptionTier[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isFirstTimeOnly: boolean;

  @Column({ default: false })
  excludeWelcomeTokens: boolean;
}

@Entity('token_restrictions')
@Index(['userId', 'tokenType'])
export class TokenRestriction extends BaseEntity {
  @Column()
  userId: string;

  @Column()
  walletId: string;

  @Column({
    type: 'enum',
    enum: ['welcome_bonus', 'reward', 'purchase', 'earned'],
  })
  tokenType: 'welcome_bonus' | 'reward' | 'purchase' | 'earned';

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  usedAmount: string;

  @Column({ type: 'jsonb' })
      restrictions: {
      canUseForSubscriptions: boolean;
      canUseForTrading: boolean;
      canUseForWorkflows: boolean;
      canUseForTransfers: boolean; // Welcome tokens CANNOT be transferred
      expiresAt?: Date;
      minimumHoldPeriod?: number; // days
    };

  @Column()
  createdFrom: string; // transaction ID or source

  @Column({ nullable: true })
  expiresAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}