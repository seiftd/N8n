import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Workflow } from './workflow.entity';
import { Execution } from './execution.entity';
import { Credential } from './credential.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer',
}

@Entity('users')
@Index(['email'], { unique: true })
export class User extends BaseEntity {
  @Column({ length: 255 })
  firstName: string;

  @Column({ length: 255 })
  lastName: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255 })
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