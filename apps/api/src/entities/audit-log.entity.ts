import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum AuditAction {
  // User actions
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_REGISTER = 'user.register',
  USER_PASSWORD_CHANGE = 'user.password_change',
  USER_PROFILE_UPDATE = 'user.profile_update',
  USER_DELETE = 'user.delete',
  
  // Workflow actions
  WORKFLOW_CREATE = 'workflow.create',
  WORKFLOW_UPDATE = 'workflow.update',
  WORKFLOW_DELETE = 'workflow.delete',
  WORKFLOW_EXECUTE = 'workflow.execute',
  WORKFLOW_ACTIVATE = 'workflow.activate',
  WORKFLOW_DEACTIVATE = 'workflow.deactivate',
  WORKFLOW_DUPLICATE = 'workflow.duplicate',
  WORKFLOW_EXPORT = 'workflow.export',
  WORKFLOW_IMPORT = 'workflow.import',
  
  // Execution actions
  EXECUTION_START = 'execution.start',
  EXECUTION_COMPLETE = 'execution.complete',
  EXECUTION_FAIL = 'execution.fail',
  EXECUTION_CANCEL = 'execution.cancel',
  EXECUTION_RETRY = 'execution.retry',
  
  // Credential actions
  CREDENTIAL_CREATE = 'credential.create',
  CREDENTIAL_UPDATE = 'credential.update',
  CREDENTIAL_DELETE = 'credential.delete',
  CREDENTIAL_ACCESS = 'credential.access',
  
  // Organization actions
  ORGANIZATION_CREATE = 'organization.create',
  ORGANIZATION_UPDATE = 'organization.update',
  ORGANIZATION_DELETE = 'organization.delete',
  ORGANIZATION_INVITE_USER = 'organization.invite_user',
  ORGANIZATION_REMOVE_USER = 'organization.remove_user',
  
  // Role and permission actions
  ROLE_CREATE = 'role.create',
  ROLE_UPDATE = 'role.update',
  ROLE_DELETE = 'role.delete',
  ROLE_ASSIGN = 'role.assign',
  ROLE_REVOKE = 'role.revoke',
  
  // System actions
  SYSTEM_BACKUP = 'system.backup',
  SYSTEM_RESTORE = 'system.restore',
  SYSTEM_SETTINGS_UPDATE = 'system.settings_update',
  SYSTEM_MAINTENANCE = 'system.maintenance',
}

export enum AuditLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

@Entity('audit_logs')
@Index(['action'])
@Index(['userId'])
@Index(['organizationId'])
@Index(['createdAt'])
@Index(['level'])
export class AuditLog extends BaseEntity {
  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditLevel,
    default: AuditLevel.INFO,
  })
  level: AuditLevel;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  organizationId: string;

  @Column({ nullable: true })
  resourceType: string;

  @Column({ nullable: true })
  resourceId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  changes: {
    before?: Record<string, any>;
    after?: Record<string, any>;
    fields?: string[];
  };

  @Column({ nullable: true, length: 45 })
  ipAddress: string;

  @Column({ nullable: true, length: 500 })
  userAgent: string;

  @Column({ nullable: true, length: 255 })
  sessionId: string;

  @Column({ nullable: true })
  executionTime: number; // in milliseconds

  @Column({ default: false })
  isSystemAction: boolean;

  // Relations
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Helper methods
  static createLog(data: {
    action: AuditAction;
    description: string;
    userId?: string;
    organizationId?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    changes?: AuditLog['changes'];
    level?: AuditLevel;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    executionTime?: number;
    isSystemAction?: boolean;
  }): Partial<AuditLog> {
    return {
      action: data.action,
      level: data.level || AuditLevel.INFO,
      description: data.description,
      userId: data.userId,
      organizationId: data.organizationId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      metadata: data.metadata,
      changes: data.changes,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      sessionId: data.sessionId,
      executionTime: data.executionTime,
      isSystemAction: data.isSystemAction || false,
    };
  }
}