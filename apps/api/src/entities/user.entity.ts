import { Entity, Column, OneToMany, ManyToMany, JoinTable, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Workflow } from './workflow.entity';
import { Execution } from './execution.entity';
import { Credential } from './credential.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer',
  OWNER = 'owner',
  EDITOR = 'editor',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  GITHUB = 'github',
  MICROSOFT = 'microsoft',
  SAML = 'saml',
}

@Entity('users')
@Index(['email'], { unique: true })
@Index(['provider', 'providerId'], { unique: true })
export class User extends BaseEntity {
  @Column({ length: 255 })
  firstName: string;

  @Column({ length: 255 })
  lastName: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255, nullable: true })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true, length: 255 })
  avatarUrl: string;

  // OAuth/SSO fields
  @Column({
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  provider: AuthProvider;

  @Column({ nullable: true, length: 255 })
  providerId: string;

  @Column({ type: 'jsonb', nullable: true })
  providerData: Record<string, any>;

  // Two-factor authentication
  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true, length: 32 })
  twoFactorSecret: string;

  @Column({ type: 'text', array: true, default: '{}' })
  twoFactorBackupCodes: string[];

  // Organization and team management
  @Column({ nullable: true })
  organizationId: string;

  @Column({ type: 'text', array: true, default: '{}' })
  teamIds: string[];

  // Custom permissions (JSON array of permission strings)
  @Column({ type: 'jsonb', default: '[]' })
  permissions: string[];

  // Session management
  @Column({ nullable: true })
  lastActivityAt: Date;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  // Account verification
  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  emailVerificationToken: string;

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  // Relations
  @OneToMany(() => Workflow, (workflow) => workflow.owner)
  workflows: Workflow[];

  @OneToMany(() => Execution, (execution) => execution.user)
  executions: Execution[];

  @OneToMany(() => Credential, (credential) => credential.owner)
  credentials: Credential[];

  // Virtual property for full name
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}