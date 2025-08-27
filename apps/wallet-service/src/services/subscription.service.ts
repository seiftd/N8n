import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Decimal } from 'decimal.js';
import * as cron from 'node-cron';

import {
  SubscriptionPlan,
  UserSubscription,
  SubscriptionUsageLog,
  SubscriptionDiscount,
  TokenRestriction,
  SubscriptionTier,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import { Wallet, Transaction, TransactionType, TransactionStatus } from '../entities/wallet.entity';
import { User } from '../../../api/src/entities/user.entity';

export interface SubscriptionPackage {
  tier: SubscriptionTier;
  name: string;
  description: string;
  priceInSbaro: string;
  priceInUSD: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  popularBadge?: string;
  savings?: string;
}

export interface UserSubscriptionInfo {
  currentPlan?: SubscriptionPackage;
  status: SubscriptionStatus;
  daysRemaining: number;
  usageStats: Record<string, number>;
  limits: Record<string, number>;
  canUpgrade: boolean;
  nextBillingDate?: Date;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(SubscriptionPlan)
    private subscriptionPlanRepository: Repository<SubscriptionPlan>,
    
    @InjectRepository(UserSubscription)
    private userSubscriptionRepository: Repository<UserSubscription>,
    
    @InjectRepository(SubscriptionUsageLog)
    private usageLogRepository: Repository<SubscriptionUsageLog>,
    
    @InjectRepository(SubscriptionDiscount)
    private discountRepository: Repository<SubscriptionDiscount>,
    
    @InjectRepository(TokenRestriction)
    private tokenRestrictionRepository: Repository<TokenRestriction>,
    
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    this.initializeSubscriptionPlans();
    this.startSubscriptionMonitoring();
  }

  /**
   * Get all available subscription plans
   */
  async getSubscriptionPlans(): Promise<SubscriptionPackage[]> {
    const plans = await this.subscriptionPlanRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });

    return plans.map(plan => ({
      tier: plan.tier,
      name: plan.name,
      description: plan.description,
      priceInSbaro: plan.priceInSbaro,
      priceInUSD: plan.priceInUSD,
      features: plan.features,
      limits: plan.limits,
      popularBadge: plan.popularBadge,
      savings: this.calculateSavings(plan.tier),
    }));
  }

  /**
   * Purchase subscription with SBARO tokens (excluding welcome tokens)
   */
  async purchaseSubscription(
    userId: string,
    tier: SubscriptionTier,
    discountCode?: string,
    autoRenew: boolean = false
  ): Promise<UserSubscription> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const wallet = await this.walletRepository.findOne({
        where: { userId, isActive: true },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const plan = await this.subscriptionPlanRepository.findOne({
        where: { tier, isActive: true },
      });
      if (!plan) {
        throw new NotFoundException('Subscription plan not found');
      }

      // Check if user already has an active subscription
      const existingSubscription = await this.userSubscriptionRepository.findOne({
        where: { userId, status: SubscriptionStatus.ACTIVE },
      });

      if (existingSubscription) {
        throw new BadRequestException('User already has an active subscription');
      }

      // Calculate final price with discount
      let finalPrice = new Decimal(plan.priceInSbaro);
      let discountAmount = new Decimal(0);

      if (discountCode) {
        const discount = await this.validateDiscount(discountCode, tier);
        if (discount) {
          discountAmount = this.calculateDiscountAmount(finalPrice, discount);
          finalPrice = finalPrice.minus(discountAmount);
        }
      }

      // Check available balance (excluding welcome tokens)
      const availableBalance = await this.getUsableBalanceForSubscriptions(userId);
      
      if (new Decimal(availableBalance).lt(finalPrice)) {
        throw new BadRequestException(
          `Insufficient SBARO tokens. Need ${finalPrice.toFixed(2)} SBARO but only ${availableBalance} available (welcome tokens cannot be used for subscriptions)`
        );
      }

      // Deduct tokens from wallet (excluding welcome tokens)
      const deductionResult = await this.deductTokensForSubscription(userId, finalPrice.toFixed(8));
      
      if (!deductionResult.success) {
        throw new BadRequestException(deductionResult.error);
      }

      // Create subscription
      const subscription = this.userSubscriptionRepository.create({
        userId,
        planId: plan.id,
        walletId: wallet.id,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        paidAmount: finalPrice.toFixed(8),
        discountAmount: discountAmount.toFixed(8),
        paymentTransactionId: deductionResult.transactionId,
        isAutoRenew: autoRenew,
        usageStats: {
          projectsUsed: 0,
          workflowsUsed: 0,
          executionsUsed: 0,
          aiJobsUsed: 0,
          storageUsedGB: 0,
          apiCallsUsed: 0,
          quantumJobsUsed: 0,
          vrSessionsUsed: 0,
        },
        lastUsageUpdate: new Date(),
      });

      const savedSubscription = await this.userSubscriptionRepository.save(subscription);

      // Update discount usage if applicable
      if (discountCode) {
        await this.updateDiscountUsage(discountCode);
      }

      // Emit subscription event
      this.server.emit('subscription-purchased', {
        userId,
        tier,
        planName: plan.name,
        expiresAt: savedSubscription.expiresAt,
        paidAmount: finalPrice.toFixed(2),
      });

      this.logger.log(`User ${userId} purchased ${tier} subscription for ${finalPrice.toFixed(2)} SBARO`);

      return savedSubscription;
    } catch (error) {
      this.logger.error('Failed to purchase subscription:', error);
      throw error;
    }
  }

  /**
   * Get user's current subscription information
   */
  async getUserSubscriptionInfo(userId: string): Promise<UserSubscriptionInfo> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });

    if (!subscription) {
      return {
        status: SubscriptionStatus.EXPIRED,
        daysRemaining: 0,
        usageStats: {},
        limits: this.getFreeTierLimits(),
        canUpgrade: true,
      };
    }

    const daysRemaining = Math.max(
      0,
      Math.ceil((subscription.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );

    return {
      currentPlan: {
        tier: subscription.plan.tier,
        name: subscription.plan.name,
        description: subscription.plan.description,
        priceInSbaro: subscription.plan.priceInSbaro,
        priceInUSD: subscription.plan.priceInUSD,
        features: subscription.plan.features,
        limits: subscription.plan.limits,
      },
      status: subscription.status,
      daysRemaining,
      usageStats: subscription.usageStats,
      limits: subscription.plan.limits,
      canUpgrade: daysRemaining > 0,
      nextBillingDate: subscription.isAutoRenew ? subscription.expiresAt : undefined,
    };
  }

  /**
   * Check if user can perform an action based on subscription limits
   */
  async checkSubscriptionLimit(
    userId: string,
    resourceType: 'project' | 'workflow' | 'execution' | 'ai_job' | 'storage' | 'api_call' | 'quantum_job' | 'vr_session',
    requestedAmount: number = 1
  ): Promise<{ allowed: boolean; current: number; limit: number; remaining: number }> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });

    let limits: Record<string, number>;
    let current: number;

    if (!subscription) {
      // Free tier limits
      limits = this.getFreeTierLimits();
      current = await this.getCurrentUsage(userId, resourceType);
    } else {
      limits = subscription.plan.limits;
      current = subscription.usageStats[this.getUsageStatsKey(resourceType)] || 0;
    }

    const limit = limits[this.getLimitKey(resourceType)] || 0;
    const remaining = Math.max(0, limit - current);
    const allowed = remaining >= requestedAmount;

    return {
      allowed,
      current,
      limit,
      remaining,
    };
  }

  /**
   * Record usage for subscription tracking
   */
  async recordUsage(
    userId: string,
    resourceType: 'project' | 'workflow' | 'execution' | 'ai_job' | 'storage' | 'api_call' | 'quantum_job' | 'vr_session',
    resourceId: string,
    quantity: number = 1,
    metadata?: Record<string, any>
  ): Promise<void> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (!subscription) {
      return; // No active subscription, skip tracking
    }

    // Log usage
    await this.usageLogRepository.save({
      subscriptionId: subscription.id,
      resourceType,
      resourceId,
      quantity,
      date: new Date(),
      metadata,
    });

    // Update subscription usage stats
    const usageKey = this.getUsageStatsKey(resourceType);
    const currentUsage = subscription.usageStats[usageKey] || 0;
    subscription.usageStats = {
      ...subscription.usageStats,
      [usageKey]: currentUsage + quantity,
    };
    subscription.lastUsageUpdate = new Date();

    await this.userSubscriptionRepository.save(subscription);

    // Emit usage update
    this.server.emit('usage-updated', {
      userId,
      resourceType,
      current: subscription.usageStats[usageKey],
      limit: subscription.plan?.limits[this.getLimitKey(resourceType)] || 0,
    });
  }

  /**
   * Get available balance for subscriptions (excluding welcome tokens)
   */
  async getUsableBalanceForSubscriptions(userId: string): Promise<string> {
    const wallet = await this.walletRepository.findOne({
      where: { userId, isActive: true },
    });

    if (!wallet) {
      return '0';
    }

    // Get all token restrictions for this user
    const restrictions = await this.tokenRestrictionRepository.find({
      where: { userId },
    });

    let totalBalance = new Decimal(wallet.sbaroBalance);
    let restrictedAmount = new Decimal(0);

    // Subtract welcome tokens and other restricted amounts
    for (const restriction of restrictions) {
      if (!restriction.restrictions.canUseForSubscriptions) {
        const availableAmount = new Decimal(restriction.amount).minus(restriction.usedAmount);
        if (availableAmount.gt(0)) {
          restrictedAmount = restrictedAmount.plus(availableAmount);
        }
      }
    }

    const usableBalance = totalBalance.minus(restrictedAmount);
    return Decimal.max(usableBalance, 0).toFixed(8);
  }

  /**
   * Transfer SBARO tokens between users (FREE - no fees)
   */
  async transferTokensBetweenUsers(
    fromUserId: string,
    toUserId: string,
    amount: string,
    description?: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const fromWallet = await this.walletRepository.findOne({
        where: { userId: fromUserId, isActive: true },
      });

      const toWallet = await this.walletRepository.findOne({
        where: { userId: toUserId, isActive: true },
      });

      if (!fromWallet || !toWallet) {
        return { success: false, error: 'Wallet not found' };
      }

      const transferAmount = new Decimal(amount);
      const fromBalance = new Decimal(fromWallet.sbaroBalance);

      if (fromBalance.lt(transferAmount)) {
        return { success: false, error: 'Insufficient balance' };
      }

      // Create transfer transaction (NO FEES!)
      const transaction = this.transactionRepository.create({
        walletId: fromWallet.id,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.CONFIRMED,
        amount: transferAmount.toFixed(8),
        fee: '0', // NO WITHDRAWAL OR TRANSFER FEES!
        toAddress: toWallet.walletAddress,
        fromAddress: fromWallet.walletAddress,
        description: description || `Transfer to user ${toUserId}`,
        metadata: {
          toUserId,
          fromUserId,
          freeTransfer: true,
        },
      });

      const savedTransaction = await this.transactionRepository.save(transaction);

      // Update sender balance
      const newFromBalance = fromBalance.minus(transferAmount);
      await this.walletRepository.update(fromWallet.id, {
        sbaroBalance: newFromBalance.toFixed(8),
        lastTransactionAt: new Date(),
      });

      // Update receiver balance
      const toBalance = new Decimal(toWallet.sbaroBalance);
      const newToBalance = toBalance.plus(transferAmount);
      await this.walletRepository.update(toWallet.id, {
        sbaroBalance: newToBalance.toFixed(8),
        lastTransactionAt: new Date(),
      });

      // Create corresponding credit transaction for receiver
      await this.transactionRepository.save({
        walletId: toWallet.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.CONFIRMED,
        amount: transferAmount.toFixed(8),
        fee: '0',
        fromAddress: fromWallet.walletAddress,
        toAddress: toWallet.walletAddress,
        description: `Received from user ${fromUserId}`,
        metadata: {
          fromUserId,
          toUserId,
          freeTransfer: true,
        },
      });

      // Emit transfer events
      this.server.emit('tokens-transferred', {
        fromUserId,
        toUserId,
        amount: transferAmount.toFixed(8),
        transactionId: savedTransaction.id,
      });

      this.logger.log(`Free transfer: ${amount} SBARO from ${fromUserId} to ${toUserId}`);

      return { success: true, transactionId: savedTransaction.id };
    } catch (error) {
      this.logger.error('Failed to transfer tokens:', error);
      return { success: false, error: 'Transfer failed' };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; refundAmount?: string }> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    // Calculate prorated refund
    const remainingDays = Math.max(
      0,
      Math.ceil((subscription.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );

    const totalDays = 30; // Monthly subscription
    const refundRatio = remainingDays / totalDays;
    const refundAmount = new Decimal(subscription.paidAmount).mul(refundRatio);

    // Update subscription status
    await this.userSubscriptionRepository.update(subscription.id, {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: reason,
    });

    // Process refund if applicable
    if (refundAmount.gt(0)) {
      const wallet = await this.walletRepository.findOne({
        where: { id: subscription.walletId },
      });

      if (wallet) {
        const currentBalance = new Decimal(wallet.sbaroBalance);
        const newBalance = currentBalance.plus(refundAmount);

        await this.walletRepository.update(wallet.id, {
          sbaroBalance: newBalance.toFixed(8),
          lastTransactionAt: new Date(),
        });

        // Create refund transaction
        await this.transactionRepository.save({
          walletId: wallet.id,
          type: TransactionType.REWARD,
          status: TransactionStatus.CONFIRMED,
          amount: refundAmount.toFixed(8),
          fee: '0',
          description: 'Subscription cancellation refund',
          metadata: {
            subscriptionId: subscription.id,
            refundReason: 'cancellation',
            originalAmount: subscription.paidAmount,
            refundRatio: refundRatio.toFixed(4),
          },
        });
      }
    }

    this.server.emit('subscription-cancelled', {
      userId,
      planName: subscription.plan.name,
      refundAmount: refundAmount.toFixed(8),
    });

    return {
      success: true,
      refundAmount: refundAmount.toFixed(8),
    };
  }

  // Private helper methods
  private async initializeSubscriptionPlans(): Promise<void> {
    try {
      const existingPlans = await this.subscriptionPlanRepository.count();
      
      if (existingPlans > 0) {
        return; // Plans already initialized
      }

      const plans = [
        {
          tier: SubscriptionTier.STARTER,
          name: 'Starter Plan',
          description: 'Perfect for individuals and small projects',
          priceInSbaro: '20',
          priceInUSD: '50.00',
          limits: {
            maxProjects: 4,
            maxWorkflows: 10,
            maxExecutionsPerMonth: 1000,
            maxAITrainingJobs: 2,
            maxStorageGB: 5,
            maxTeamMembers: 1,
            maxApiCalls: 10000,
          },
          features: {
            basicWorkflows: true,
            aiWorkflows: false,
            voiceInterface: false,
            predictiveAutomation: false,
            autonomousAgents: false,
            quantumOptimization: false,
            metaverseCollaboration: false,
            customAITraining: false,
            prioritySupport: false,
            advancedAnalytics: false,
            templateMarketplace: true,
            pluginDevelopment: false,
            whiteLabeling: false,
            enterpriseSSO: false,
            dedicatedAccount: false,
          },
          sortOrder: 1,
        },
        {
          tier: SubscriptionTier.PROFESSIONAL,
          name: 'Professional Plan',
          description: 'Advanced features for growing businesses',
          priceInSbaro: '50',
          priceInUSD: '125.00',
          limits: {
            maxProjects: 15,
            maxWorkflows: 50,
            maxExecutionsPerMonth: 10000,
            maxAITrainingJobs: 10,
            maxStorageGB: 25,
            maxTeamMembers: 5,
            maxApiCalls: 100000,
            maxQuantumJobs: 5,
          },
          features: {
            basicWorkflows: true,
            aiWorkflows: true,
            voiceInterface: true,
            predictiveAutomation: true,
            autonomousAgents: false,
            quantumOptimization: true,
            metaverseCollaboration: false,
            customAITraining: true,
            prioritySupport: true,
            advancedAnalytics: true,
            templateMarketplace: true,
            pluginDevelopment: true,
            whiteLabeling: false,
            enterpriseSSO: false,
            dedicatedAccount: false,
          },
          popularBadge: 'Most Popular',
          sortOrder: 2,
        },
        {
          tier: SubscriptionTier.BUSINESS,
          name: 'Business Plan',
          description: 'Complete solution for teams and organizations',
          priceInSbaro: '120',
          priceInUSD: '300.00',
          limits: {
            maxProjects: 50,
            maxWorkflows: 200,
            maxExecutionsPerMonth: 50000,
            maxAITrainingJobs: 50,
            maxStorageGB: 100,
            maxTeamMembers: 25,
            maxApiCalls: 500000,
            maxQuantumJobs: 25,
            maxVRSessions: 100,
          },
          features: {
            basicWorkflows: true,
            aiWorkflows: true,
            voiceInterface: true,
            predictiveAutomation: true,
            autonomousAgents: true,
            quantumOptimization: true,
            metaverseCollaboration: true,
            customAITraining: true,
            prioritySupport: true,
            advancedAnalytics: true,
            templateMarketplace: true,
            pluginDevelopment: true,
            whiteLabeling: true,
            enterpriseSSO: true,
            dedicatedAccount: false,
          },
          sortOrder: 3,
        },
        {
          tier: SubscriptionTier.ENTERPRISE,
          name: 'Enterprise Plan',
          description: 'Ultimate solution with dedicated support',
          priceInSbaro: '250',
          priceInUSD: '625.00',
          limits: {
            maxProjects: 200,
            maxWorkflows: 1000,
            maxExecutionsPerMonth: 250000,
            maxAITrainingJobs: 200,
            maxStorageGB: 500,
            maxTeamMembers: 100,
            maxApiCalls: 2000000,
            maxQuantumJobs: 100,
            maxVRSessions: 500,
          },
          features: {
            basicWorkflows: true,
            aiWorkflows: true,
            voiceInterface: true,
            predictiveAutomation: true,
            autonomousAgents: true,
            quantumOptimization: true,
            metaverseCollaboration: true,
            customAITraining: true,
            prioritySupport: true,
            advancedAnalytics: true,
            templateMarketplace: true,
            pluginDevelopment: true,
            whiteLabeling: true,
            enterpriseSSO: true,
            dedicatedAccount: true,
          },
          sortOrder: 4,
        },
        {
          tier: SubscriptionTier.UNLIMITED,
          name: 'Unlimited Plan',
          description: 'No limits, complete freedom',
          priceInSbaro: '500',
          priceInUSD: '1250.00',
          limits: {
            maxProjects: -1, // Unlimited
            maxWorkflows: -1,
            maxExecutionsPerMonth: -1,
            maxAITrainingJobs: -1,
            maxStorageGB: -1,
            maxTeamMembers: -1,
            maxApiCalls: -1,
            maxQuantumJobs: -1,
            maxVRSessions: -1,
          },
          features: {
            basicWorkflows: true,
            aiWorkflows: true,
            voiceInterface: true,
            predictiveAutomation: true,
            autonomousAgents: true,
            quantumOptimization: true,
            metaverseCollaboration: true,
            customAITraining: true,
            prioritySupport: true,
            advancedAnalytics: true,
            templateMarketplace: true,
            pluginDevelopment: true,
            whiteLabeling: true,
            enterpriseSSO: true,
            dedicatedAccount: true,
          },
          popularBadge: 'Best Value',
          sortOrder: 5,
        },
      ];

      for (const planData of plans) {
        await this.subscriptionPlanRepository.save(planData);
      }

      this.logger.log('Subscription plans initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize subscription plans:', error);
    }
  }

  private startSubscriptionMonitoring(): void {
    // Check for expired subscriptions every hour
    cron.schedule('0 * * * *', async () => {
      await this.processExpiredSubscriptions();
    });

    // Reset monthly usage stats on the first day of each month
    cron.schedule('0 0 1 * *', async () => {
      await this.resetMonthlyUsageStats();
    });
  }

  private async processExpiredSubscriptions(): Promise<void> {
    try {
      const expiredSubscriptions = await this.userSubscriptionRepository.find({
        where: {
          status: SubscriptionStatus.ACTIVE,
          expiresAt: { $lte: new Date() } as any,
        },
        relations: ['user', 'plan'],
      });

      for (const subscription of expiredSubscriptions) {
        if (subscription.isAutoRenew) {
          // Try to auto-renew
          await this.attemptAutoRenewal(subscription);
        } else {
          // Mark as expired
          await this.userSubscriptionRepository.update(subscription.id, {
            status: SubscriptionStatus.EXPIRED,
          });

          this.server.emit('subscription-expired', {
            userId: subscription.userId,
            planName: subscription.plan.name,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to process expired subscriptions:', error);
    }
  }

  private async attemptAutoRenewal(subscription: UserSubscription): Promise<void> {
    try {
      // Check if user has sufficient balance
      const availableBalance = await this.getUsableBalanceForSubscriptions(subscription.userId);
      const planPrice = new Decimal(subscription.plan.priceInSbaro);

      if (new Decimal(availableBalance).gte(planPrice)) {
        // Renew subscription
        const deductionResult = await this.deductTokensForSubscription(
          subscription.userId,
          planPrice.toFixed(8)
        );

        if (deductionResult.success) {
          await this.userSubscriptionRepository.update(subscription.id, {
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            paymentTransactionId: deductionResult.transactionId,
            usageStats: {
              projectsUsed: 0,
              workflowsUsed: 0,
              executionsUsed: 0,
              aiJobsUsed: 0,
              storageUsedGB: 0,
              apiCallsUsed: 0,
              quantumJobsUsed: 0,
              vrSessionsUsed: 0,
            },
          });

          this.server.emit('subscription-renewed', {
            userId: subscription.userId,
            planName: subscription.plan.name,
          });
        } else {
          await this.userSubscriptionRepository.update(subscription.id, {
            status: SubscriptionStatus.EXPIRED,
            isAutoRenew: false,
          });
        }
      } else {
        await this.userSubscriptionRepository.update(subscription.id, {
          status: SubscriptionStatus.EXPIRED,
          isAutoRenew: false,
        });
      }
    } catch (error) {
      this.logger.error('Auto-renewal failed:', error);
      await this.userSubscriptionRepository.update(subscription.id, {
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
      });
    }
  }

  private async resetMonthlyUsageStats(): Promise<void> {
    try {
      await this.userSubscriptionRepository.update(
        { status: SubscriptionStatus.ACTIVE },
        {
          usageStats: {
            projectsUsed: 0,
            workflowsUsed: 0,
            executionsUsed: 0,
            aiJobsUsed: 0,
            storageUsedGB: 0,
            apiCallsUsed: 0,
            quantumJobsUsed: 0,
            vrSessionsUsed: 0,
          },
          lastUsageUpdate: new Date(),
        }
      );

      this.logger.log('Monthly usage stats reset completed');
    } catch (error) {
      this.logger.error('Failed to reset monthly usage stats:', error);
    }
  }

  private async deductTokensForSubscription(
    userId: string,
    amount: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const wallet = await this.walletRepository.findOne({
        where: { userId, isActive: true },
      });

      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      const deductAmount = new Decimal(amount);
      const currentBalance = new Decimal(wallet.sbaroBalance);

      // Check usable balance (excluding welcome tokens)
      const usableBalance = await this.getUsableBalanceForSubscriptions(userId);
      
      if (new Decimal(usableBalance).lt(deductAmount)) {
        return { success: false, error: 'Insufficient usable balance' };
      }

      // Create transaction
      const transaction = this.transactionRepository.create({
        walletId: wallet.id,
        type: TransactionType.FEE,
        status: TransactionStatus.CONFIRMED,
        amount: deductAmount.toFixed(8),
        fee: '0',
        description: 'Subscription payment',
        metadata: {
          purpose: 'subscription',
          excludedWelcomeTokens: true,
        },
      });

      const savedTransaction = await this.transactionRepository.save(transaction);

      // Update wallet balance
      const newBalance = currentBalance.minus(deductAmount);
      await this.walletRepository.update(wallet.id, {
        sbaroBalance: newBalance.toFixed(8),
        lastTransactionAt: new Date(),
      });

      // Mark used tokens in restrictions
      await this.markTokensAsUsed(userId, deductAmount);

      return { success: true, transactionId: savedTransaction.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async markTokensAsUsed(userId: string, amount: Decimal): Promise<void> {
    const restrictions = await this.tokenRestrictionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' }, // Use newest tokens first (LIFO)
    });

    let remainingToDeduct = amount;

    for (const restriction of restrictions) {
      if (remainingToDeduct.lte(0)) break;

      if (restriction.restrictions.canUseForSubscriptions) {
        const availableAmount = new Decimal(restriction.amount).minus(restriction.usedAmount);
        
        if (availableAmount.gt(0)) {
          const deductFromThis = Decimal.min(remainingToDeduct, availableAmount);
          
          await this.tokenRestrictionRepository.update(restriction.id, {
            usedAmount: new Decimal(restriction.usedAmount).plus(deductFromThis).toFixed(8),
          });

          remainingToDeduct = remainingToDeduct.minus(deductFromThis);
        }
      }
    }
  }

  private getFreeTierLimits(): Record<string, number> {
    return {
      maxProjects: 1,
      maxWorkflows: 3,
      maxExecutionsPerMonth: 100,
      maxAITrainingJobs: 0,
      maxStorageGB: 1,
      maxTeamMembers: 1,
      maxApiCalls: 1000,
      maxQuantumJobs: 0,
      maxVRSessions: 0,
    };
  }

  private async getCurrentUsage(userId: string, resourceType: string): Promise<number> {
    // For free tier users, count actual usage from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const usageCount = await this.usageLogRepository.count({
      where: {
        subscription: { userId },
        resourceType,
        date: { $gte: thirtyDaysAgo } as any,
      },
    });

    return usageCount;
  }

  private getUsageStatsKey(resourceType: string): string {
    const mapping: Record<string, string> = {
      'project': 'projectsUsed',
      'workflow': 'workflowsUsed',
      'execution': 'executionsUsed',
      'ai_job': 'aiJobsUsed',
      'storage': 'storageUsedGB',
      'api_call': 'apiCallsUsed',
      'quantum_job': 'quantumJobsUsed',
      'vr_session': 'vrSessionsUsed',
    };
    return mapping[resourceType] || 'executionsUsed';
  }

  private getLimitKey(resourceType: string): string {
    const mapping: Record<string, string> = {
      'project': 'maxProjects',
      'workflow': 'maxWorkflows',
      'execution': 'maxExecutionsPerMonth',
      'ai_job': 'maxAITrainingJobs',
      'storage': 'maxStorageGB',
      'api_call': 'maxApiCalls',
      'quantum_job': 'maxQuantumJobs',
      'vr_session': 'maxVRSessions',
    };
    return mapping[resourceType] || 'maxExecutionsPerMonth';
  }

  private calculateSavings(tier: SubscriptionTier): string {
    const savings: Record<SubscriptionTier, string> = {
      [SubscriptionTier.STARTER]: '',
      [SubscriptionTier.PROFESSIONAL]: 'Save 20%',
      [SubscriptionTier.BUSINESS]: 'Save 35%',
      [SubscriptionTier.ENTERPRISE]: 'Save 50%',
      [SubscriptionTier.UNLIMITED]: 'Save 65%',
    };
    return savings[tier] || '';
  }

  private async validateDiscount(code: string, tier: SubscriptionTier): Promise<SubscriptionDiscount | null> {
    const discount = await this.discountRepository.findOne({
      where: {
        code,
        isActive: true,
        startDate: { $lte: new Date() } as any,
        endDate: { $gte: new Date() } as any,
      },
    });

    if (!discount) return null;

    if (discount.maxUses && discount.currentUses >= discount.maxUses) {
      return null;
    }

    if (discount.applicableTiers && !discount.applicableTiers.includes(tier)) {
      return null;
    }

    return discount;
  }

  private calculateDiscountAmount(price: Decimal, discount: SubscriptionDiscount): Decimal {
    let discountAmount: Decimal;

    if (discount.discountType === 'percentage') {
      discountAmount = price.mul(discount.discountValue).div(100);
    } else {
      discountAmount = new Decimal(discount.discountValue);
    }

    if (discount.maxDiscountAmount) {
      discountAmount = Decimal.min(discountAmount, discount.maxDiscountAmount);
    }

    return discountAmount;
  }

  private async updateDiscountUsage(code: string): Promise<void> {
    await this.discountRepository.increment({ code }, 'currentUses', 1);
  }
}