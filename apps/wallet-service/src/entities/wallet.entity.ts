import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../api/src/entities/base.entity';
import { User } from '../../../api/src/entities/user.entity';

@Entity('wallets')
@Index(['userId'])
@Index(['walletAddress'])
export class Wallet extends BaseEntity {
  @Column()
  userId: string;

  @Column({ unique: true })
  walletAddress: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  sbaroBalance: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  stakedBalance: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  lockedBalance: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  rewardBalance: string;

  @Column({ type: 'text', nullable: true })
  encryptedPrivateKey: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  lastTransactionAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  PURCHASE = 'purchase',
  SALE = 'sale',
  STAKING = 'staking',
  UNSTAKING = 'unstaking',
  REWARD = 'reward',
  FEE = 'fee',
  WORKFLOW_EXECUTION = 'workflow_execution',
  TEMPLATE_PURCHASE = 'template_purchase',
  PLUGIN_PURCHASE = 'plugin_purchase',
  AI_MODEL_TRAINING = 'ai_model_training',
  DAO_VOTING = 'dao_voting',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('transactions')
@Index(['walletId', 'createdAt'])
@Index(['type', 'status'])
@Index(['txHash'])
export class Transaction extends BaseEntity {
  @Column()
  walletId: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  fee: string;

  @Column({ nullable: true })
  toAddress: string;

  @Column({ nullable: true })
  fromAddress: string;

  @Column({ nullable: true })
  txHash: string;

  @Column({ nullable: true })
  blockNumber: number;

  @Column({ nullable: true })
  blockHash: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  confirmedAt: Date;

  @Column({ nullable: true })
  failedAt: Date;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}

@Entity('token_prices')
@Index(['symbol', 'timestamp'])
export class TokenPrice extends BaseEntity {
  @Column({ default: 'SBARO' })
  symbol: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  priceUSD: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  priceETH: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  priceBTC: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  marketCap: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  volume24h: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  changePercent24h: string;

  @Column()
  timestamp: Date;
}

@Entity('trading_pairs')
export class TradingPair extends BaseEntity {
  @Column()
  baseSymbol: string;

  @Column()
  quoteSymbol: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  lastPrice: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  volume24h: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  priceChange24h: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0.001 })
  tradingFee: string;

  @OneToMany(() => TradeOrder, (order) => order.tradingPair)
  orders: TradeOrder[];
}

export enum OrderType {
  MARKET = 'market',
  LIMIT = 'limit',
  STOP_LOSS = 'stop_loss',
  TAKE_PROFIT = 'take_profit',
}

export enum OrderSide {
  BUY = 'buy',
  SELL = 'sell',
}

export enum OrderStatus {
  PENDING = 'pending',
  OPEN = 'open',
  PARTIALLY_FILLED = 'partially_filled',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Entity('trade_orders')
@Index(['walletId', 'status'])
@Index(['tradingPairId', 'side', 'price'])
export class TradeOrder extends BaseEntity {
  @Column()
  walletId: string;

  @Column()
  tradingPairId: string;

  @Column({
    type: 'enum',
    enum: OrderType,
  })
  type: OrderType;

  @Column({
    type: 'enum',
    enum: OrderSide,
  })
  side: OrderSide;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  quantity: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  price: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  filledQuantity: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalValue: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  fee: string;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  filledAt: Date;

  @Column({ nullable: true })
  cancelledAt: Date;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @ManyToOne(() => TradingPair, (pair) => pair.orders)
  @JoinColumn({ name: 'tradingPairId' })
  tradingPair: TradingPair;

  @OneToMany(() => TradeExecution, (execution) => execution.order)
  executions: TradeExecution[];
}

@Entity('trade_executions')
export class TradeExecution extends BaseEntity {
  @Column()
  orderId: string;

  @Column()
  buyerWalletId: string;

  @Column()
  sellerWalletId: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  quantity: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  price: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  totalValue: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  buyerFee: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  sellerFee: string;

  @Column()
  executedAt: Date;

  @ManyToOne(() => TradeOrder, (order) => order.executions)
  @JoinColumn({ name: 'orderId' })
  order: TradeOrder;
}

@Entity('price_alerts')
@Index(['walletId', 'isActive'])
export class PriceAlert extends BaseEntity {
  @Column()
  walletId: string;

  @Column()
  symbol: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  targetPrice: string;

  @Column({
    type: 'enum',
    enum: ['above', 'below'],
  })
  condition: 'above' | 'below';

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  triggeredAt: Date;

  @Column({ nullable: true })
  notificationSent: boolean;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}