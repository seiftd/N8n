import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, UserRole } from '../../entities/user.entity';
import { Role, RoleType } from '../../entities/role.entity';
import { Permission, PermissionAction, PermissionResource } from '../../entities/permission.entity';
import { Organization } from '../../entities/organization.entity';

export interface PermissionCheck {
  action: PermissionAction;
  resource: PermissionResource;
  resourceId?: string;
  organizationId?: string;
}

export interface RoleAssignment {
  userId: string;
  roleId: string;
  organizationId?: string;
  expiresAt?: Date;
}

@Injectable()
export class RBACService {
  private readonly logger = new Logger(RBACService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
  ) {}

  async initializeSystemRoles(): Promise<void> {
    this.logger.log('Initializing system roles and permissions');

    // Create system permissions
    await this.createSystemPermissions();
    
    // Create system roles
    await this.createSystemRoles();
    
    this.logger.log('System roles and permissions initialized');
  }

  /**
   * Check if user has permission for specific action on resource
   */
  async hasPermission(
    userId: string,
    check: PermissionCheck,
  ): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['organization'],
      });

      if (!user || !user.isActive) {
        return false;
      }

      // Super admin has all permissions
      if (user.role === UserRole.ADMIN) {
        return true;
      }

      // Check custom permissions
      const permissionString = `${check.action}:${check.resource}`;
      if (user.permissions.includes(permissionString)) {
        return true;
      }

      // Check role-based permissions
      const userRoles = await this.getUserRoles(userId, check.organizationId);
      
      for (const role of userRoles) {
        const hasRolePermission = await this.roleHasPermission(role.id, check);
        if (hasRolePermission) {
          return true;
        }
      }

      // Check organization-specific permissions
      if (check.organizationId && user.organizationId === check.organizationId) {
        return this.checkOrganizationPermission(user, check);
      }

      return false;
    } catch (error) {
      this.logger.error(`Permission check failed for user ${userId}:`, error.message);
      return false;
    }
  }

  /**
   * Require permission or throw ForbiddenException
   */
  async requirePermission(
    userId: string,
    check: PermissionCheck,
  ): Promise<void> {
    const hasPermission = await this.hasPermission(userId, check);
    
    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient permissions: ${check.action}:${check.resource}`
      );
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(
    userId: string,
    organizationId?: string,
  ): Promise<string[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const permissions = new Set<string>(user.permissions);

    // Add role-based permissions
    const userRoles = await this.getUserRoles(userId, organizationId);
    
    for (const role of userRoles) {
      const rolePermissions = await this.getRolePermissions(role.id);
      rolePermissions.forEach(permission => permissions.add(permission));
    }

    return Array.from(permissions);
  }

  /**
   * Assign role to user
   */
  async assignRole(
    userId: string,
    roleId: string,
    assignedBy: string,
    organizationId?: string,
  ): Promise<void> {
    // Verify role exists
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if assigner has permission
    await this.requirePermission(assignedBy, {
      action: PermissionAction.MANAGE,
      resource: PermissionResource.ROLE,
      organizationId,
    });

    // Update user role (simplified - in production, use many-to-many relationship)
    user.role = role.name as UserRole;
    await this.userRepository.save(user);

    this.logger.log(`Role ${role.name} assigned to user ${user.email} by ${assignedBy}`);
  }

  /**
   * Create custom role
   */
  async createRole(
    data: {
      name: string;
      description?: string;
      permissions: string[];
      organizationId?: string;
    },
    createdBy: string,
  ): Promise<Role> {
    // Check permission
    await this.requirePermission(createdBy, {
      action: PermissionAction.CREATE,
      resource: PermissionResource.ROLE,
      organizationId: data.organizationId,
    });

    // Create role
    const role = this.roleRepository.create({
      name: data.name,
      description: data.description,
      type: RoleType.CUSTOM,
      organizationId: data.organizationId,
    });

    const savedRole = await this.roleRepository.save(role);

    // Assign permissions
    await this.setRolePermissions(savedRole.id, data.permissions);

    this.logger.log(`Role ${data.name} created by ${createdBy}`);
    return savedRole;
  }

  /**
   * Update role permissions
   */
  async setRolePermissions(roleId: string, permissionStrings: string[]): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Find permissions by permission strings
    const permissions = await this.permissionRepository
      .createQueryBuilder('permission')
      .where('CONCAT(permission.action, \':\', permission.resource) IN (:...permissionStrings)', {
        permissionStrings,
      })
      .getMany();

    role.permissions = permissions;
    await this.roleRepository.save(role);
  }

  /**
   * Get user roles
   */
  private async getUserRoles(userId: string, organizationId?: string): Promise<Role[]> {
    // In a full implementation, this would query a user_roles table
    // For now, simplified to use the user's primary role
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      return [];
    }

    const role = await this.roleRepository.findOne({
      where: { name: user.role },
      relations: ['permissions'],
    });

    return role ? [role] : [];
  }

  /**
   * Check if role has permission
   */
  private async roleHasPermission(roleId: string, check: PermissionCheck): Promise<boolean> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      return false;
    }

    return role.permissions.some(permission => 
      permission.action === check.action && permission.resource === check.resource
    );
  }

  /**
   * Get role permissions
   */
  private async getRolePermissions(roleId: string): Promise<string[]> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      return [];
    }

    return role.permissions.map(permission => permission.permissionString);
  }

  /**
   * Check organization-specific permissions
   */
  private checkOrganizationPermission(user: User, check: PermissionCheck): boolean {
    // Organization owner has all permissions within their org
    if (user.role === UserRole.OWNER) {
      return true;
    }

    // Add more organization-specific logic here
    return false;
  }

  /**
   * Create system permissions
   */
  private async createSystemPermissions(): Promise<void> {
    const permissions = [
      // Workflow permissions
      { action: PermissionAction.CREATE, resource: PermissionResource.WORKFLOW, name: 'Create Workflow' },
      { action: PermissionAction.READ, resource: PermissionResource.WORKFLOW, name: 'Read Workflow' },
      { action: PermissionAction.UPDATE, resource: PermissionResource.WORKFLOW, name: 'Update Workflow' },
      { action: PermissionAction.DELETE, resource: PermissionResource.WORKFLOW, name: 'Delete Workflow' },
      { action: PermissionAction.EXECUTE, resource: PermissionResource.WORKFLOW, name: 'Execute Workflow' },
      
      // Execution permissions
      { action: PermissionAction.READ, resource: PermissionResource.EXECUTION, name: 'Read Execution' },
      { action: PermissionAction.CREATE, resource: PermissionResource.EXECUTION, name: 'Create Execution' },
      
      // User permissions
      { action: PermissionAction.CREATE, resource: PermissionResource.USER, name: 'Create User' },
      { action: PermissionAction.READ, resource: PermissionResource.USER, name: 'Read User' },
      { action: PermissionAction.UPDATE, resource: PermissionResource.USER, name: 'Update User' },
      { action: PermissionAction.DELETE, resource: PermissionResource.USER, name: 'Delete User' },
      
      // System permissions
      { action: PermissionAction.ADMIN, resource: PermissionResource.SYSTEM, name: 'System Admin' },
      { action: PermissionAction.MANAGE, resource: PermissionResource.SETTINGS, name: 'Manage Settings' },
    ];

    for (const permData of permissions) {
      const existing = await this.permissionRepository.findOne({
        where: { action: permData.action, resource: permData.resource },
      });

      if (!existing) {
        const permission = this.permissionRepository.create(permData);
        await this.permissionRepository.save(permission);
      }
    }
  }

  /**
   * Create system roles
   */
  private async createSystemRoles(): Promise<void> {
    const roles = [
      {
        name: 'admin',
        description: 'System administrator with full access',
        type: RoleType.SYSTEM,
        permissions: ['admin:system'],
      },
      {
        name: 'user',
        description: 'Regular user with basic workflow permissions',
        type: RoleType.SYSTEM,
        permissions: ['create:workflow', 'read:workflow', 'update:workflow', 'execute:workflow', 'read:execution'],
      },
      {
        name: 'viewer',
        description: 'Read-only access to workflows and executions',
        type: RoleType.SYSTEM,
        permissions: ['read:workflow', 'read:execution'],
      },
    ];

    for (const roleData of roles) {
      const existing = await this.roleRepository.findOne({
        where: { name: roleData.name, type: roleData.type },
      });

      if (!existing) {
        const role = this.roleRepository.create({
          name: roleData.name,
          description: roleData.description,
          type: roleData.type,
          isSystemRole: true,
        });

        const savedRole = await this.roleRepository.save(role);
        await this.setRolePermissions(savedRole.id, roleData.permissions);
      }
    }
  }
}