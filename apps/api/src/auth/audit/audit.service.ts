import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditLevel } from '../../entities/audit-log.entity';

export interface AuditContext {
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    action: AuditAction,
    description: string,
    context: AuditContext = {},
    options: {
      level?: AuditLevel;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, any>;
      changes?: AuditLog['changes'];
      executionTime?: number;
    } = {},
  ): Promise<AuditLog> {
    try {
      const auditLog = this.auditLogRepository.create({
        action,
        level: options.level || AuditLevel.INFO,
        description,
        userId: context.userId,
        organizationId: context.organizationId,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        metadata: options.metadata,
        changes: options.changes,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        executionTime: options.executionTime,
      });

      const savedLog = await this.auditLogRepository.save(auditLog);
      
      this.logger.debug(`Audit log created: ${action} - ${description}`);
      return savedLog;
    } catch (error) {
      this.logger.error('Failed to create audit log:', error.message);
      throw error;
    }
  }

  // Convenience methods for common audit events
  async logUserLogin(userId: string, context: AuditContext): Promise<AuditLog> {
    return this.log(
      AuditAction.USER_LOGIN,
      'User logged in successfully',
      context,
      { resourceType: 'user', resourceId: userId }
    );
  }

  async logWorkflowExecution(workflowId: string, executionId: string, context: AuditContext): Promise<AuditLog> {
    return this.log(
      AuditAction.WORKFLOW_EXECUTE,
      'Workflow execution started',
      context,
      { resourceType: 'workflow', resourceId: workflowId, metadata: { executionId } }
    );
  }

  async logSecurityEvent(
    action: AuditAction,
    description: string,
    context: AuditContext,
    level: AuditLevel = AuditLevel.WARNING,
  ): Promise<AuditLog> {
    return this.log(action, description, context, { level });
  }
}