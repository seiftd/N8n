import { Entity, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum CredentialType {
  HTTP_BASIC_AUTH = 'httpBasicAuth',
  HTTP_HEADER_AUTH = 'httpHeaderAuth',
  HTTP_QUERY_AUTH = 'httpQueryAuth',
  OAUTH1 = 'oauth1Api',
  OAUTH2 = 'oauth2Api',
  API_KEY = 'apiKey',
  JWT = 'jwt',
  DATABASE = 'database',
  SSH = 'ssh',
  FTP = 'ftp',
  SMTP = 'smtp',
  IMAP = 'imap',
  AWS = 'aws',
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
  CUSTOM = 'custom',
}

@Entity('credentials')
@Index(['name', 'ownerId'])
@Index(['type'])
export class Credential extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: CredentialType,
  })
  type: CredentialType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text' })
  data: string; // Encrypted JSON string

  @Column({ nullable: true })
  testUrl: string;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  lastUsedAt: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.credentials, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ name: 'ownerId' })
  ownerId: string;
}