import { Entity, Column, ManyToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Role } from './role.entity';

export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute',
  MANAGE = 'manage',
  ADMIN = 'admin',
}

export enum PermissionResource {
  WORKFLOW = 'workflow',
  EXECUTION = 'execution',
  CREDENTIAL = 'credential',
  USER = 'user',
  ORGANIZATION = 'organization',
  ROLE = 'role',
  PERMISSION = 'permission',
  SETTINGS = 'settings',
  AUDIT_LOG = 'audit_log',
  SYSTEM = 'system',
}

@Entity('permissions')
@Index(['action', 'resource'], { unique: true })
export class Permission extends BaseEntity {
  @Column({
    type: 'enum',
    enum: PermissionAction,
  })
  action: PermissionAction;

  @Column({
    type: 'enum',
    enum: PermissionResource,
  })
  resource: PermissionResource;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  conditions: {
    // Condition-based permissions
    ownerOnly?: boolean;
    organizationOnly?: boolean;
    teamOnly?: boolean;
    customCondition?: string;
  };

  // Relations
  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];

  // Helper methods
  get permissionString(): string {
    return `${this.action}:${this.resource}`;
  }

  static fromString(permissionString: string): { action: PermissionAction; resource: PermissionResource } {
    const [action, resource] = permissionString.split(':');
    return {
      action: action as PermissionAction,
      resource: resource as PermissionResource,
    };
  }
}