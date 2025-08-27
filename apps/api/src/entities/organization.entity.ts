import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum OrganizationPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

@Entity('organizations')
@Index(['slug'], { unique: true })
export class Organization extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: OrganizationPlan,
    default: OrganizationPlan.FREE,
  })
  plan: OrganizationPlan;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, length: 255 })
  logoUrl: string;

  @Column({ nullable: true, length: 255 })
  website: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    allowSelfRegistration?: boolean;
    defaultUserRole?: string;
    requireEmailVerification?: boolean;
    passwordPolicy?: {
      minLength?: number;
      requireUppercase?: boolean;
      requireLowercase?: boolean;
      requireNumbers?: boolean;
      requireSymbols?: boolean;
    };
    sessionTimeout?: number;
    maxFailedLogins?: number;
    lockoutDuration?: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  billingInfo: {
    customerId?: string;
    subscriptionId?: string;
    billingEmail?: string;
    paymentMethod?: string;
    nextBillingDate?: Date;
  };

  // Usage limits
  @Column({ default: 100 })
  maxUsers: number;

  @Column({ default: 50 })
  maxWorkflows: number;

  @Column({ default: 1000 })
  maxExecutionsPerMonth: number;

  @Column({ default: 10 * 1024 * 1024 * 1024 }) // 10GB
  maxStorageBytes: number;

  // Relations
  @OneToMany(() => User, (user) => user.organizationId)
  users: User[];

  // Virtual properties
  get userCount(): number {
    return this.users?.length || 0;
  }
}