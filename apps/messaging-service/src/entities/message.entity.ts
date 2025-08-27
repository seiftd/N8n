import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../api/src/entities/base.entity';
import { User } from '../../../api/src/entities/user.entity';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  VIDEO = 'video',
  WORKFLOW_SHARE = 'workflow_share',
  TOKEN_TRANSFER = 'token_transfer',
  SYSTEM = 'system',
  EMOJI_REACTION = 'emoji_reaction',
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
  TEAM = 'team',
  SUPPORT = 'support',
}

@Entity('conversations')
@Index(['type', 'isActive'])
@Index(['lastMessageAt'])
export class Conversation extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.DIRECT,
  })
  type: ConversationType;

  @Column({ type: 'simple-array' })
  participantIds: string[];

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  lastMessageId: string;

  @Column({ nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    muteNotifications?: boolean;
    allowFileSharing?: boolean;
    allowWorkflowSharing?: boolean;
    allowTokenTransfers?: boolean;
    messageRetentionDays?: number;
    pinnedMessageIds?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    totalMessages?: number;
    totalParticipants?: number;
    organizationId?: string;
    teamId?: string;
  };

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @OneToMany(() => ConversationParticipant, (participant) => participant.conversation)
  participants: ConversationParticipant[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;
}

@Entity('conversation_participants')
@Index(['conversationId', 'userId'], { unique: true })
@Index(['userId', 'isActive'])
export class ConversationParticipant extends BaseEntity {
  @Column()
  conversationId: string;

  @Column()
  userId: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  joinedAt: Date;

  @Column({ nullable: true })
  leftAt: Date;

  @Column({ nullable: true })
  lastReadAt: Date;

  @Column({ nullable: true })
  lastReadMessageId: string;

  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  @Column({
    type: 'enum',
    enum: ['member', 'admin', 'moderator'],
    default: 'member',
  })
  role: 'member' | 'admin' | 'moderator';

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    muteNotifications?: boolean;
    customNickname?: string;
    pinnedConversation?: boolean;
    notificationSound?: string;
  };

  @ManyToOne(() => Conversation, (conversation) => conversation.participants)
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('messages')
@Index(['conversationId', 'createdAt'])
@Index(['senderId', 'createdAt'])
@Index(['type', 'createdAt'])
export class Message extends BaseEntity {
  @Column()
  conversationId: string;

  @Column()
  senderId: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  status: MessageStatus;

  @Column({ type: 'jsonb', nullable: true })
  attachments: {
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    thumbnailUrl?: string;
    duration?: number; // for voice/video
    width?: number; // for images/videos
    height?: number; // for images/videos
  }[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    workflowId?: string;
    tokenAmount?: string;
    recipientId?: string;
    replyToMessageId?: string;
    forwardedFromMessageId?: string;
    editedAt?: Date;
    mentions?: string[];
    hashtags?: string[];
    linkPreviews?: {
      url: string;
      title: string;
      description: string;
      imageUrl?: string;
    }[];
  };

  @Column({ nullable: true })
  replyToMessageId: string;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ nullable: true })
  deletedAt: Date;

  @Column({ nullable: true })
  editedAt: Date;

  @Column({ type: 'simple-array', nullable: true })
  readByUserIds: string[];

  @Column({ type: 'simple-array', nullable: true })
  deliveredToUserIds: string[];

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @ManyToOne(() => Message, { nullable: true })
  @JoinColumn({ name: 'replyToMessageId' })
  replyToMessage: Message;

  @OneToMany(() => MessageReaction, (reaction) => reaction.message)
  reactions: MessageReaction[];
}

@Entity('message_reactions')
@Index(['messageId', 'userId'], { unique: true })
@Index(['messageId', 'emoji'])
export class MessageReaction extends BaseEntity {
  @Column()
  messageId: string;

  @Column()
  userId: string;

  @Column({ length: 10 })
  emoji: string;

  @ManyToOne(() => Message, (message) => message.reactions)
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('message_threads')
@Index(['parentMessageId', 'createdAt'])
export class MessageThread extends BaseEntity {
  @Column()
  parentMessageId: string;

  @Column()
  conversationId: string;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ nullable: true })
  lastMessageId: string;

  @Column({ nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'simple-array' })
  participantIds: string[];

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Message)
  @JoinColumn({ name: 'parentMessageId' })
  parentMessage: Message;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;
}

@Entity('typing_indicators')
@Index(['conversationId', 'userId'], { unique: true })
export class TypingIndicator extends BaseEntity {
  @Column()
  conversationId: string;

  @Column()
  userId: string;

  @Column()
  startedAt: Date;

  @Column()
  expiresAt: Date;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}