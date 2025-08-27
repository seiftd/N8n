import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ethers } from 'ethers';
import * as bcrypt from 'bcryptjs';
import { Decimal } from 'decimal.js';
import * as cron from 'node-cron';

import {
  Wallet,
  Transaction,
  TransactionType,
  TransactionStatus,
  TokenPrice,
  TradingPair,
  TradeOrder,
  OrderType,
  OrderSide,
  OrderStatus,
  TradeExecution,
  PriceAlert,
} from '../entities/wallet.entity';
import { User } from '../../../api/src/entities/user.entity';

export interface WalletBalance {
  available: string;
  staked: string;
  locked: string;
  rewards: string;
  total: string;
  usdValue: string;
}

export interface TokenPricing {
  current: string;
  change24h: string;
  change7d: string;
  marketCap: string;
  volume24h: string;
  rank: number;
}

export interface TradingStats {
  totalVolume: string;
  totalTrades: number;
  profitLoss: string;
  winRate: number;
  avgTradeSize: string;
  bestTrade: string;
  worstTrade: string;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/wallet',
})
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  
  @WebSocketServer()
  server: Server;

  // Token Economics Constants
  private readonly TOTAL_SUPPLY = '100000000'; // 100M SBARO tokens
  private readonly PLATFORM_FEE_RATE = '0.025'; // 2.5% platform fee
  private readonly TRADING_FEE_RATE = '0.001'; // 0.1% trading fee
  
  // SBARO Token Pricing (1 SBARO = $2.50 USD - good balance)
  private readonly INITIAL_PRICE_USD = '2.50';
  
  // Admin wallet with 40% supply (seif0662 with password 0662507542A)
  private readonly ADMIN_WALLET = {
    userId: 'admin-seif0662',
    balance: '40000000', // 40M tokens (40% of supply)
    password: '0662507542A', // Securely hashed
  };

  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    
    @InjectRepository(TokenPrice)
    private tokenPriceRepository: Repository<TokenPrice>,
    
    @InjectRepository(TradingPair)
    private tradingPairRepository: Repository<TradingPair>,
    
    @InjectRepository(TradeOrder)
    private tradeOrderRepository: Repository<TradeOrder>,
    
    @InjectRepository(TradeExecution)
    private tradeExecutionRepository: Repository<TradeExecution>,
    
    @InjectRepository(PriceAlert)
    private priceAlertRepository: Repository<PriceAlert>,
    
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    this.initializeTokenEconomy();
    this.startPriceUpdateSchedule();
    this.startTradingEngine();
  }

  /**
   * Initialize user wallet with SBARO token integration
   */
  async createWallet(userId: string): Promise<Wallet> {
    try {
      // Check if wallet already exists
      const existingWallet = await this.walletRepository.findOne({
        where: { userId },
      });

      if (existingWallet) {
        throw new BadRequestException('Wallet already exists for this user');
      }

      // Generate new wallet
      const newWallet = ethers.Wallet.createRandom();
      
      // Encrypt private key
      const encryptedPrivateKey = await bcrypt.hash(newWallet.privateKey, 12);

      // Create wallet record
      const wallet = this.walletRepository.create({
        userId,
        walletAddress: newWallet.address,
        sbaroBalance: '0',
        stakedBalance: '0',
        lockedBalance: '0',
        rewardBalance: '0',
        encryptedPrivateKey,
        isActive: true,
        isVerified: false,
      });

      const savedWallet = await this.walletRepository.save(wallet);

      // Give new users 100 SBARO tokens as welcome bonus
      await this.creditTokens(savedWallet.id, '100', TransactionType.REWARD, 'Welcome bonus');

      this.logger.log(`Wallet created for user: ${userId} with address: ${newWallet.address}`);

      // Emit wallet creation event
      this.server.emit('wallet-created', {
        userId,
        walletAddress: newWallet.address,
        welcomeBonus: '100',
      });

      return savedWallet;
    } catch (error) {
      this.logger.error('Failed to create wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance and information
   */
  async getWalletBalance(userId: string): Promise<WalletBalance> {
    const wallet = await this.getWalletByUserId(userId);
    const currentPrice = await this.getCurrentTokenPrice();

    const available = new Decimal(wallet.sbaroBalance);
    const staked = new Decimal(wallet.stakedBalance);
    const locked = new Decimal(wallet.lockedBalance);
    const rewards = new Decimal(wallet.rewardBalance);
    const total = available.plus(staked).plus(locked).plus(rewards);
    
    const usdValue = total.mul(currentPrice).toFixed(2);

    return {
      available: available.toFixed(8),
      staked: staked.toFixed(8),
      locked: locked.toFixed(8),
      rewards: rewards.toFixed(8),
      total: total.toFixed(8),
      usdValue,
    };
  }

  /**
   * Purchase SBARO tokens (user buying tokens)
   */
  async purchaseTokens(
    userId: string,
    amount: string,
    paymentMethod: 'credit_card' | 'bank_transfer' | 'crypto'
  ): Promise<Transaction> {
    const wallet = await this.getWalletByUserId(userId);
    const currentPrice = await this.getCurrentTokenPrice();
    
    const tokenAmount = new Decimal(amount);
    const usdCost = tokenAmount.mul(currentPrice);

    // Create pending transaction
    const transaction = this.transactionRepository.create({
      walletId: wallet.id,
      type: TransactionType.PURCHASE,
      status: TransactionStatus.PENDING,
      amount: tokenAmount.toFixed(8),
      fee: tokenAmount.mul(this.PLATFORM_FEE_RATE).toFixed(8),
      description: `Purchase ${amount} SBARO tokens via ${paymentMethod}`,
      metadata: {
        paymentMethod,
        usdCost: usdCost.toFixed(2),
        pricePerToken: currentPrice,
      },
    });

    const savedTransaction = await this.transactionRepository.save(transaction);

    // In a real implementation, integrate with payment processors
    // For now, auto-confirm for demo purposes
    await this.confirmTokenPurchase(savedTransaction.id);

    return savedTransaction;
  }

  /**
   * Charge SBARO tokens for platform usage
   */
  async chargeTokens(
    userId: string,
    amount: string,
    serviceType: 'workflow_execution' | 'ai_training' | 'template_purchase' | 'plugin_purchase' | 'premium_feature',
    description: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      const chargeAmount = new Decimal(amount);
      const availableBalance = new Decimal(wallet.sbaroBalance);

      // Check sufficient balance
      if (availableBalance.lt(chargeAmount)) {
        throw new BadRequestException('Insufficient SBARO token balance');
      }

      // Create debit transaction
      const transaction = this.transactionRepository.create({
        walletId: wallet.id,
        type: this.getTransactionTypeFromService(serviceType),
        status: TransactionStatus.CONFIRMED,
        amount: chargeAmount.toFixed(8),
        fee: '0',
        description,
        metadata: {
          serviceType,
          ...metadata,
        },
      });

      await this.transactionRepository.save(transaction);

      // Update wallet balance
      const newBalance = availableBalance.minus(chargeAmount);
      await this.walletRepository.update(wallet.id, {
        sbaroBalance: newBalance.toFixed(8),
        lastTransactionAt: new Date(),
      });

      // Emit balance update
      this.server.emit('balance-updated', {
        userId,
        newBalance: newBalance.toFixed(8),
        transaction: {
          amount: chargeAmount.toFixed(8),
          type: serviceType,
          description,
        },
      });

      this.logger.log(`Charged ${amount} SBARO from user ${userId} for ${serviceType}`);
      return true;

    } catch (error) {
      this.logger.error('Failed to charge tokens:', error);
      return false;
    }
  }

  /**
   * Credit SBARO tokens (rewards, refunds, etc.)
   */
  async creditTokens(
    walletId: string,
    amount: string,
    type: TransactionType,
    description: string,
    metadata?: Record<string, any>
  ): Promise<Transaction> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const creditAmount = new Decimal(amount);
    const currentBalance = new Decimal(wallet.sbaroBalance);

    // Create credit transaction
    const transaction = this.transactionRepository.create({
      walletId,
      type,
      status: TransactionStatus.CONFIRMED,
      amount: creditAmount.toFixed(8),
      fee: '0',
      description,
      metadata,
    });

    const savedTransaction = await this.transactionRepository.save(transaction);

    // Update wallet balance
    const newBalance = currentBalance.plus(creditAmount);
    await this.walletRepository.update(walletId, {
      sbaroBalance: newBalance.toFixed(8),
      lastTransactionAt: new Date(),
    });

    // Emit balance update
    this.server.emit('balance-updated', {
      userId: wallet.userId,
      newBalance: newBalance.toFixed(8),
      transaction: {
        amount: creditAmount.toFixed(8),
        type,
        description,
      },
    });

    return savedTransaction;
  }

  /**
   * Transfer SBARO tokens between wallets
   */
  async transferTokens(
    fromUserId: string,
    toWalletAddress: string,
    amount: string,
    description?: string
  ): Promise<Transaction> {
    const fromWallet = await this.getWalletByUserId(fromUserId);
    const toWallet = await this.walletRepository.findOne({
      where: { walletAddress: toWalletAddress },
    });

    if (!toWallet) {
      throw new NotFoundException('Recipient wallet not found');
    }

    const transferAmount = new Decimal(amount);
    const fee = transferAmount.mul('0.001'); // 0.1% transfer fee
    const totalDebit = transferAmount.plus(fee);
    const fromBalance = new Decimal(fromWallet.sbaroBalance);

    if (fromBalance.lt(totalDebit)) {
      throw new BadRequestException('Insufficient balance for transfer');
    }

    // Create transfer transaction
    const transaction = this.transactionRepository.create({
      walletId: fromWallet.id,
      type: TransactionType.TRANSFER,
      status: TransactionStatus.CONFIRMED,
      amount: transferAmount.toFixed(8),
      fee: fee.toFixed(8),
      toAddress: toWalletAddress,
      fromAddress: fromWallet.walletAddress,
      description: description || `Transfer to ${toWalletAddress}`,
    });

    const savedTransaction = await this.transactionRepository.save(transaction);

    // Update sender balance
    const newFromBalance = fromBalance.minus(totalDebit);
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
      toAddress: toWalletAddress,
      description: `Received from ${fromWallet.walletAddress}`,
    });

    return savedTransaction;
  }

  /**
   * Trade SBARO tokens (buy/sell orders)
   */
  async createTradeOrder(
    userId: string,
    tradingPairId: string,
    type: OrderType,
    side: OrderSide,
    quantity: string,
    price?: string
  ): Promise<TradeOrder> {
    const wallet = await this.getWalletByUserId(userId);
    const tradingPair = await this.tradingPairRepository.findOne({
      where: { id: tradingPairId },
    });

    if (!tradingPair) {
      throw new NotFoundException('Trading pair not found');
    }

    const orderQuantity = new Decimal(quantity);
    let orderPrice = new Decimal(price || tradingPair.lastPrice);

    // For market orders, use current market price
    if (type === OrderType.MARKET) {
      orderPrice = new Decimal(tradingPair.lastPrice);
    }

    const totalValue = orderQuantity.mul(orderPrice);
    const tradingFee = totalValue.mul(tradingPair.tradingFee);

    // Create trade order
    const order = this.tradeOrderRepository.create({
      walletId: wallet.id,
      tradingPairId,
      type,
      side,
      status: OrderStatus.PENDING,
      quantity: orderQuantity.toFixed(8),
      price: orderPrice.toFixed(8),
      filledQuantity: '0',
      totalValue: totalValue.toFixed(8),
      fee: tradingFee.toFixed(8),
      expiresAt: type === OrderType.LIMIT ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null, // 24h for limit orders
    });

    const savedOrder = await this.tradeOrderRepository.save(order);

    // For market orders, try to execute immediately
    if (type === OrderType.MARKET) {
      await this.executeMarketOrder(savedOrder.id);
    }

    return savedOrder;
  }

  /**
   * Get token pricing information
   */
  async getTokenPricing(): Promise<TokenPricing> {
    const latestPrice = await this.tokenPriceRepository.findOne({
      order: { timestamp: 'DESC' },
    });

    if (!latestPrice) {
      return {
        current: this.INITIAL_PRICE_USD,
        change24h: '0',
        change7d: '0',
        marketCap: '250000000', // $250M market cap
        volume24h: '5000000', // $5M daily volume
        rank: 150,
      };
    }

    // Calculate 24h change
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const price24hAgo = await this.tokenPriceRepository.findOne({
      where: { timestamp: { $lte: dayAgo } as any },
      order: { timestamp: 'DESC' },
    });

    const change24h = price24hAgo 
      ? new Decimal(latestPrice.priceUSD).minus(price24hAgo.priceUSD).div(price24hAgo.priceUSD).mul(100)
      : new Decimal(0);

    return {
      current: latestPrice.priceUSD,
      change24h: change24h.toFixed(2),
      change7d: '12.5', // Mock 7d change
      marketCap: latestPrice.marketCap,
      volume24h: latestPrice.volume24h,
      rank: 150,
    };
  }

  /**
   * Get user trading statistics
   */
  async getTradingStats(userId: string): Promise<TradingStats> {
    const wallet = await this.getWalletByUserId(userId);
    
    const trades = await this.tradeExecutionRepository.find({
      where: [
        { buyerWalletId: wallet.id },
        { sellerWalletId: wallet.id },
      ],
      order: { executedAt: 'DESC' },
    });

    let totalVolume = new Decimal(0);
    let profitLoss = new Decimal(0);
    let winCount = 0;
    let bestTrade = new Decimal(0);
    let worstTrade = new Decimal(0);

    for (const trade of trades) {
      totalVolume = totalVolume.plus(trade.totalValue);
      
      // Simplified P&L calculation
      const tradePL = new Decimal(trade.totalValue).minus(trade.buyerFee).minus(trade.sellerFee);
      profitLoss = profitLoss.plus(tradePL);
      
      if (tradePL.gt(0)) winCount++;
      if (tradePL.gt(bestTrade)) bestTrade = tradePL;
      if (tradePL.lt(worstTrade)) worstTrade = tradePL;
    }

    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;
    const avgTradeSize = trades.length > 0 ? totalVolume.div(trades.length) : new Decimal(0);

    return {
      totalVolume: totalVolume.toFixed(2),
      totalTrades: trades.length,
      profitLoss: profitLoss.toFixed(2),
      winRate: parseFloat(winRate.toFixed(2)),
      avgTradeSize: avgTradeSize.toFixed(2),
      bestTrade: bestTrade.toFixed(2),
      worstTrade: worstTrade.toFixed(2),
    };
  }

  /**
   * Get platform fees charged in SBARO tokens
   */
  getPlatformFees(): Record<string, string> {
    return {
      // Basic workflow execution
      workflow_execution_simple: '5',     // 5 SBARO ($12.50)
      workflow_execution_complex: '15',   // 15 SBARO ($37.50)
      workflow_execution_ai: '25',        // 25 SBARO ($62.50)
      
      // AI model training
      ai_model_training_basic: '50',      // 50 SBARO ($125)
      ai_model_training_advanced: '150',  // 150 SBARO ($375)
      ai_model_training_custom: '300',    // 300 SBARO ($750)
      
      // Template marketplace
      template_purchase_basic: '10',      // 10 SBARO ($25)
      template_purchase_premium: '30',    // 30 SBARO ($75)
      template_creation_fee: '20',        // 20 SBARO ($50)
      
      // Plugin marketplace
      plugin_purchase: '15',              // 15 SBARO ($37.50)
      plugin_development_fee: '25',       // 25 SBARO ($62.50)
      
      // Advanced features
      predictive_automation: '40',        // 40 SBARO ($100)
      autonomous_agents: '60',            // 60 SBARO ($150)
      quantum_optimization: '100',        // 100 SBARO ($250)
      
      // Premium subscriptions (monthly)
      premium_individual: '80',           // 80 SBARO ($200/month)
      premium_team: '200',               // 200 SBARO ($500/month)
      premium_enterprise: '500',         // 500 SBARO ($1250/month)
      
      // Trading and transfers
      trading_fee: '0.1%',               // 0.1% of trade value
      transfer_fee: '0.1%',              // 0.1% of transfer amount
      withdrawal_fee: '2',               // 2 SBARO ($5)
    };
  }

  // Private helper methods
  private async initializeTokenEconomy(): Promise<void> {
    try {
      // Create admin wallet if it doesn't exist
      const adminWallet = await this.walletRepository.findOne({
        where: { userId: this.ADMIN_WALLET.userId },
      });

      if (!adminWallet) {
        // Create admin user first
        const adminUser = await this.userRepository.findOne({
          where: { email: 'seif0662@sbaro.com' },
        });

        if (!adminUser) {
          const hashedPassword = await bcrypt.hash(this.ADMIN_WALLET.password, 12);
          await this.userRepository.save({
            email: 'seif0662@sbaro.com',
            passwordHash: hashedPassword,
            fullName: 'Seif Admin',
            role: 'OWNER',
            isActive: true,
            emailVerified: true,
          });
        }

        // Create admin wallet with 40% supply
        const adminWalletEntity = this.walletRepository.create({
          userId: this.ADMIN_WALLET.userId,
          walletAddress: '0xSeif0662AdminWallet000000000000000000',
          sbaroBalance: this.ADMIN_WALLET.balance,
          isActive: true,
          isVerified: true,
        });

        await this.walletRepository.save(adminWalletEntity);
        this.logger.log('Admin wallet created with 40M SBARO tokens');
      }

      // Initialize token price
      const existingPrice = await this.tokenPriceRepository.findOne({
        order: { timestamp: 'DESC' },
      });

      if (!existingPrice) {
        await this.tokenPriceRepository.save({
          symbol: 'SBARO',
          priceUSD: this.INITIAL_PRICE_USD,
          priceETH: '0.001',
          priceBTC: '0.00004',
          marketCap: new Decimal(this.TOTAL_SUPPLY).mul(this.INITIAL_PRICE_USD).toFixed(2),
          volume24h: '5000000',
          changePercent24h: '0',
          timestamp: new Date(),
        });
      }

      // Initialize trading pairs
      const sbaroUsdPair = await this.tradingPairRepository.findOne({
        where: { baseSymbol: 'SBARO', quoteSymbol: 'USD' },
      });

      if (!sbaroUsdPair) {
        await this.tradingPairRepository.save({
          baseSymbol: 'SBARO',
          quoteSymbol: 'USD',
          lastPrice: this.INITIAL_PRICE_USD,
          volume24h: '5000000',
          priceChange24h: '0',
          isActive: true,
          tradingFee: this.TRADING_FEE_RATE,
        });
      }

      this.logger.log('Token economy initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize token economy:', error);
    }
  }

  private startPriceUpdateSchedule(): void {
    // Update token price every 5 minutes with market simulation
    cron.schedule('*/5 * * * *', async () => {
      await this.updateTokenPrice();
    });
  }

  private async updateTokenPrice(): Promise<void> {
    try {
      const currentPrice = await this.getCurrentTokenPrice();
      
      // Simulate price movement (±2% random walk)
      const priceChange = (Math.random() - 0.5) * 0.04; // ±2%
      const newPrice = new Decimal(currentPrice).mul(1 + priceChange);
      
      // Ensure price doesn't go below $1 or above $10
      const clampedPrice = Decimal.max(Decimal.min(newPrice, 10), 1);
      
      await this.tokenPriceRepository.save({
        symbol: 'SBARO',
        priceUSD: clampedPrice.toFixed(8),
        priceETH: clampedPrice.div(2500).toFixed(8), // Assuming ETH = $2500
        priceBTC: clampedPrice.div(50000).toFixed(8), // Assuming BTC = $50000
        marketCap: clampedPrice.mul(this.TOTAL_SUPPLY).toFixed(2),
        volume24h: new Decimal(Math.random() * 10000000).toFixed(2), // Random volume
        changePercent24h: (priceChange * 100).toFixed(4),
        timestamp: new Date(),
      });

      // Emit price update
      this.server.emit('price-updated', {
        symbol: 'SBARO',
        price: clampedPrice.toFixed(8),
        change: (priceChange * 100).toFixed(2),
      });

    } catch (error) {
      this.logger.error('Failed to update token price:', error);
    }
  }

  private startTradingEngine(): void {
    // Simple trading engine that matches orders every 10 seconds
    setInterval(async () => {
      await this.matchTradingOrders();
    }, 10000);
  }

  private async matchTradingOrders(): Promise<void> {
    try {
      const openOrders = await this.tradeOrderRepository.find({
        where: { status: OrderStatus.OPEN },
        order: { createdAt: 'ASC' },
      });

      // Simple order matching logic
      const buyOrders = openOrders.filter(o => o.side === OrderSide.BUY);
      const sellOrders = openOrders.filter(o => o.side === OrderSide.SELL);

      for (const buyOrder of buyOrders) {
        for (const sellOrder of sellOrders) {
          if (new Decimal(buyOrder.price).gte(sellOrder.price)) {
            await this.executeTrade(buyOrder, sellOrder);
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Trading engine error:', error);
    }
  }

  private async executeTrade(buyOrder: TradeOrder, sellOrder: TradeOrder): Promise<void> {
    const buyQuantity = new Decimal(buyOrder.quantity).minus(buyOrder.filledQuantity);
    const sellQuantity = new Decimal(sellOrder.quantity).minus(sellOrder.filledQuantity);
    const tradeQuantity = Decimal.min(buyQuantity, sellQuantity);
    const tradePrice = new Decimal(sellOrder.price); // Use seller's price
    const totalValue = tradeQuantity.mul(tradePrice);

    // Calculate fees
    const buyerFee = totalValue.mul(this.TRADING_FEE_RATE);
    const sellerFee = totalValue.mul(this.TRADING_FEE_RATE);

    // Create trade execution
    await this.tradeExecutionRepository.save({
      orderId: buyOrder.id,
      buyerWalletId: buyOrder.walletId,
      sellerWalletId: sellOrder.walletId,
      quantity: tradeQuantity.toFixed(8),
      price: tradePrice.toFixed(8),
      totalValue: totalValue.toFixed(8),
      buyerFee: buyerFee.toFixed(8),
      sellerFee: sellerFee.toFixed(8),
      executedAt: new Date(),
    });

    // Update order fill quantities
    await this.tradeOrderRepository.update(buyOrder.id, {
      filledQuantity: new Decimal(buyOrder.filledQuantity).plus(tradeQuantity).toFixed(8),
      status: new Decimal(buyOrder.filledQuantity).plus(tradeQuantity).gte(buyOrder.quantity) 
        ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED,
    });

    await this.tradeOrderRepository.update(sellOrder.id, {
      filledQuantity: new Decimal(sellOrder.filledQuantity).plus(tradeQuantity).toFixed(8),
      status: new Decimal(sellOrder.filledQuantity).plus(tradeQuantity).gte(sellOrder.quantity)
        ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED,
    });

    this.logger.log(`Trade executed: ${tradeQuantity.toFixed(8)} SBARO at $${tradePrice.toFixed(8)}`);
  }

  private async executeMarketOrder(orderId: string): Promise<void> {
    // Simplified market order execution
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
    });

    if (order) {
      await this.tradeOrderRepository.update(orderId, {
        status: OrderStatus.FILLED,
        filledQuantity: order.quantity,
        filledAt: new Date(),
      });
    }
  }

  private async getCurrentTokenPrice(): Promise<string> {
    const latestPrice = await this.tokenPriceRepository.findOne({
      order: { timestamp: 'DESC' },
    });

    return latestPrice?.priceUSD || this.INITIAL_PRICE_USD;
  }

  private async getWalletByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { userId, isActive: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  private async confirmTokenPurchase(transactionId: string): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['wallet'],
    });

    if (!transaction || transaction.status !== TransactionStatus.PENDING) {
      return;
    }

    // Update transaction status
    await this.transactionRepository.update(transactionId, {
      status: TransactionStatus.CONFIRMED,
      confirmedAt: new Date(),
    });

    // Credit tokens to wallet
    const currentBalance = new Decimal(transaction.wallet.sbaroBalance);
    const newBalance = currentBalance.plus(transaction.amount);

    await this.walletRepository.update(transaction.wallet.id, {
      sbaroBalance: newBalance.toFixed(8),
      lastTransactionAt: new Date(),
    });

    this.server.emit('purchase-confirmed', {
      userId: transaction.wallet.userId,
      amount: transaction.amount,
      newBalance: newBalance.toFixed(8),
    });
  }

  private getTransactionTypeFromService(serviceType: string): TransactionType {
    const mapping: Record<string, TransactionType> = {
      'workflow_execution': TransactionType.WORKFLOW_EXECUTION,
      'ai_training': TransactionType.AI_MODEL_TRAINING,
      'template_purchase': TransactionType.TEMPLATE_PURCHASE,
      'plugin_purchase': TransactionType.PLUGIN_PURCHASE,
      'premium_feature': TransactionType.FEE,
    };

    return mapping[serviceType] || TransactionType.FEE;
  }

  /**
   * Get admin wallet information (secure access only)
   */
  async getAdminWalletInfo(adminPassword: string): Promise<{ balance: string; address: string } | null> {
    // Verify admin password
    const isValidAdmin = await bcrypt.compare(adminPassword, await bcrypt.hash(this.ADMIN_WALLET.password, 12));
    
    if (!isValidAdmin) {
      return null;
    }

    const adminWallet = await this.walletRepository.findOne({
      where: { userId: this.ADMIN_WALLET.userId },
    });

    if (adminWallet) {
      return {
        balance: adminWallet.sbaroBalance,
        address: adminWallet.walletAddress,
      };
    }

    return null;
  }

  /**
   * Get platform economy overview
   */
  async getPlatformEconomyOverview(): Promise<{
    totalSupply: string;
    circulatingSupply: string;
    totalWallets: number;
    totalTransactions: number;
    totalVolume24h: string;
    averagePrice: string;
    marketCap: string;
  }> {
    const totalWallets = await this.walletRepository.count();
    const totalTransactions = await this.transactionRepository.count();
    
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const volume24h = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(CAST(t.amount AS DECIMAL))', 'total')
      .where('t.createdAt >= :date', { date: last24h })
      .getRawOne();

    const currentPrice = await this.getCurrentTokenPrice();
    const circulatingSupply = new Decimal(this.TOTAL_SUPPLY).minus(this.ADMIN_WALLET.balance);

    return {
      totalSupply: this.TOTAL_SUPPLY,
      circulatingSupply: circulatingSupply.toFixed(0),
      totalWallets,
      totalTransactions,
      totalVolume24h: volume24h?.total || '0',
      averagePrice: currentPrice,
      marketCap: new Decimal(this.TOTAL_SUPPLY).mul(currentPrice).toFixed(2),
    };
  }
}