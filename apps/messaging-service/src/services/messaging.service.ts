import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as moment from 'moment';
import * as linkify from 'linkify-it';
import * as profanityCheck from 'profanity-check';

import {
  Conversation,
  ConversationParticipant,
  Message,
  MessageReaction,
  MessageThread,
  TypingIndicator,
  ConversationType,
  MessageType,
  MessageStatus,
} from '../entities/message.entity';
import { User } from '../../../api/src/entities/user.entity';

export interface CreateConversationDto {
  name?: string;
  type: ConversationType;
  participantIds: string[];
  description?: string;
  settings?: Record<string, any>;
}

export interface SendMessageDto {
  conversationId: string;
  content: string;
  type?: MessageType;
  attachments?: any[];
  replyToMessageId?: string;
  metadata?: Record<string, any>;
}

export interface ConversationSummary {
  id: string;
  name: string;
  type: ConversationType;
  participantCount: number;
  lastMessage?: {
    id: string;
    content: string;
    senderName: string;
    createdAt: Date;
    type: MessageType;
  };
  unreadCount: number;
  lastActivity: Date;
  isOnline: boolean;
  avatarUrl?: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly linkifyInstance = linkify();

  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    
    @InjectRepository(ConversationParticipant)
    private participantRepository: Repository<ConversationParticipant>,
    
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    
    @InjectRepository(MessageReaction)
    private reactionRepository: Repository<MessageReaction>,
    
    @InjectRepository(MessageThread)
    private threadRepository: Repository<MessageThread>,
    
    @InjectRepository(TypingIndicator)
    private typingRepository: Repository<TypingIndicator>,
    
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Create a new conversation
   */
  async createConversation(
    creatorId: string,
    createDto: CreateConversationDto
  ): Promise<Conversation> {
    try {
      // Validate participants exist
      const participants = await this.userRepository.find({
        where: { id: In([...createDto.participantIds, creatorId]) },
      });

      if (participants.length !== createDto.participantIds.length + 1) {
        throw new BadRequestException('Some participants not found');
      }

      // Check if direct conversation already exists
      if (createDto.type === ConversationType.DIRECT && createDto.participantIds.length === 1) {
        const existingConversation = await this.findDirectConversation(
          creatorId,
          createDto.participantIds[0]
        );
        if (existingConversation) {
          return existingConversation;
        }
      }

      // Create conversation
      const conversation = this.conversationRepository.create({
        name: createDto.name || this.generateConversationName(createDto.type, participants),
        type: createDto.type,
        participantIds: [...createDto.participantIds, creatorId],
        createdBy: creatorId,
        description: createDto.description,
        settings: {
          allowFileSharing: true,
          allowWorkflowSharing: true,
          allowTokenTransfers: true,
          messageRetentionDays: 90,
          pinnedMessageIds: [],
          ...createDto.settings,
        },
        metadata: {
          totalParticipants: createDto.participantIds.length + 1,
          totalMessages: 0,
        },
      });

      const savedConversation = await this.conversationRepository.save(conversation);

      // Add all participants
      const participantEntities = [...createDto.participantIds, creatorId].map(userId => 
        this.participantRepository.create({
          conversationId: savedConversation.id,
          userId,
          joinedAt: new Date(),
          role: userId === creatorId ? 'admin' : 'member',
          settings: {
            muteNotifications: false,
            pinnedConversation: false,
          },
        })
      );

      await this.participantRepository.save(participantEntities);

      // Emit conversation created event
      this.server.to(createDto.participantIds).emit('conversation-created', {
        conversation: savedConversation,
        participants,
      });

      this.logger.log(`Conversation ${savedConversation.id} created by user ${creatorId}`);
      return savedConversation;
    } catch (error) {
      this.logger.error('Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(
    senderId: string,
    sendDto: SendMessageDto
  ): Promise<Message> {
    try {
      // Verify sender is participant
      const participant = await this.participantRepository.findOne({
        where: {
          conversationId: sendDto.conversationId,
          userId: senderId,
          isActive: true,
        },
      });

      if (!participant) {
        throw new ForbiddenException('User is not a participant in this conversation');
      }

      // Content moderation
      const cleanContent = this.moderateContent(sendDto.content);
      
      // Extract mentions and hashtags
      const mentions = this.extractMentions(cleanContent);
      const hashtags = this.extractHashtags(cleanContent);
      const linkPreviews = await this.generateLinkPreviews(cleanContent);

      // Create message
      const message = this.messageRepository.create({
        conversationId: sendDto.conversationId,
        senderId,
        type: sendDto.type || MessageType.TEXT,
        content: cleanContent,
        attachments: sendDto.attachments || [],
        replyToMessageId: sendDto.replyToMessageId,
        metadata: {
          mentions,
          hashtags,
          linkPreviews,
          ...sendDto.metadata,
        },
        status: MessageStatus.SENT,
        readByUserIds: [senderId], // Sender has read their own message
        deliveredToUserIds: [], // Will be updated as users come online
      });

      const savedMessage = await this.messageRepository.save(message);

      // Update conversation
      await this.conversationRepository.update(sendDto.conversationId, {
        lastMessageId: savedMessage.id,
        lastMessageAt: savedMessage.createdAt,
      });

      // Update participant read status
      await this.participantRepository.update(
        { conversationId: sendDto.conversationId, userId: senderId },
        { lastReadAt: new Date(), lastReadMessageId: savedMessage.id }
      );

      // Increment unread count for other participants
      await this.participantRepository.increment(
        {
          conversationId: sendDto.conversationId,
          userId: { $ne: senderId } as any,
          isActive: true,
        },
        'unreadCount',
        1
      );

      // Get conversation participants for real-time delivery
      const participants = await this.participantRepository.find({
        where: { conversationId: sendDto.conversationId, isActive: true },
        relations: ['user'],
      });

      // Emit message to all participants
      const participantUserIds = participants
        .filter(p => p.userId !== senderId)
        .map(p => p.userId);

      this.server.to(participantUserIds).emit('message-received', {
        message: savedMessage,
        conversation: { id: sendDto.conversationId },
        sender: await this.userRepository.findOne({ where: { id: senderId } }),
      });

      // Send push notifications (placeholder for implementation)
      await this.sendPushNotifications(participantUserIds, savedMessage);

      this.logger.log(`Message sent by user ${senderId} in conversation ${sendDto.conversationId}`);
      return savedMessage;
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Get user's conversations with pagination
   */
  async getUserConversations(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ conversations: ConversationSummary[]; total: number }> {
    try {
      const [participants, total] = await this.participantRepository.findAndCount({
        where: { userId, isActive: true },
        relations: ['conversation', 'conversation.creator'],
        order: { conversation: { lastMessageAt: 'DESC' } },
        skip: (page - 1) * limit,
        take: limit,
      });

      const conversationSummaries: ConversationSummary[] = [];

      for (const participant of participants) {
        const conversation = participant.conversation;
        
        // Get last message
        const lastMessage = await this.messageRepository.findOne({
          where: { conversationId: conversation.id },
          relations: ['sender'],
          order: { createdAt: 'DESC' },
        });

        // Check if other participants are online (simplified)
        const isOnline = await this.checkConversationOnlineStatus(conversation.id, userId);

        conversationSummaries.push({
          id: conversation.id,
          name: conversation.name,
          type: conversation.type,
          participantCount: conversation.participantIds.length,
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            content: this.truncateMessage(lastMessage.content),
            senderName: lastMessage.sender.firstName + ' ' + lastMessage.sender.lastName,
            createdAt: lastMessage.createdAt,
            type: lastMessage.type,
          } : undefined,
          unreadCount: participant.unreadCount,
          lastActivity: conversation.lastMessageAt || conversation.createdAt,
          isOnline,
          avatarUrl: conversation.avatarUrl,
        });
      }

      return { conversations: conversationSummaries, total };
    } catch (error) {
      this.logger.error('Failed to get user conversations:', error);
      throw error;
    }
  }

  /**
   * Get messages in a conversation with pagination
   */
  async getConversationMessages(
    userId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ messages: Message[]; total: number; hasMore: boolean }> {
    try {
      // Verify user is participant
      const participant = await this.participantRepository.findOne({
        where: { conversationId, userId, isActive: true },
      });

      if (!participant) {
        throw new ForbiddenException('User is not a participant in this conversation');
      }

      const [messages, total] = await this.messageRepository.findAndCount({
        where: { conversationId, isDeleted: false },
        relations: ['sender', 'replyToMessage', 'reactions', 'reactions.user'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Mark messages as read
      const unreadMessageIds = messages
        .filter(msg => !msg.readByUserIds?.includes(userId))
        .map(msg => msg.id);

      if (unreadMessageIds.length > 0) {
        await this.messageRepository.update(
          { id: In(unreadMessageIds) },
          { readByUserIds: () => `array_append("readByUserIds", '${userId}')` }
        );

        // Update participant read status
        await this.participantRepository.update(
          { conversationId, userId },
          {
            lastReadAt: new Date(),
            lastReadMessageId: messages[0]?.id,
            unreadCount: 0,
          }
        );

        // Emit read receipt
        this.server.to(conversationId).emit('messages-read', {
          userId,
          messageIds: unreadMessageIds,
          conversationId,
        });
      }

      const hasMore = total > page * limit;

      return { messages: messages.reverse(), total, hasMore };
    } catch (error) {
      this.logger.error('Failed to get conversation messages:', error);
      throw error;
    }
  }

  /**
   * Add reaction to a message
   */
  async addReaction(
    userId: string,
    messageId: string,
    emoji: string
  ): Promise<MessageReaction> {
    try {
      // Verify message exists and user can access it
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
        relations: ['conversation'],
      });

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      const participant = await this.participantRepository.findOne({
        where: { conversationId: message.conversationId, userId, isActive: true },
      });

      if (!participant) {
        throw new ForbiddenException('User cannot access this message');
      }

      // Check if reaction already exists
      const existingReaction = await this.reactionRepository.findOne({
        where: { messageId, userId, emoji },
      });

      if (existingReaction) {
        // Remove existing reaction (toggle)
        await this.reactionRepository.remove(existingReaction);
        
        this.server.to(message.conversationId).emit('reaction-removed', {
          messageId,
          userId,
          emoji,
        });

        return null;
      }

      // Add new reaction
      const reaction = this.reactionRepository.create({
        messageId,
        userId,
        emoji,
      });

      const savedReaction = await this.reactionRepository.save(reaction);

      this.server.to(message.conversationId).emit('reaction-added', {
        messageId,
        userId,
        emoji,
        user: await this.userRepository.findOne({ where: { id: userId } }),
      });

      return savedReaction;
    } catch (error) {
      this.logger.error('Failed to add reaction:', error);
      throw error;
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping(userId: string, conversationId: string): Promise<void> {
    try {
      const expiresAt = moment().add(10, 'seconds').toDate();

      await this.typingRepository.upsert(
        {
          conversationId,
          userId,
          startedAt: new Date(),
          expiresAt,
        },
        ['conversationId', 'userId']
      );

      this.server.to(conversationId).emit('user-typing', {
        userId,
        conversationId,
        user: await this.userRepository.findOne({ where: { id: userId } }),
      });

      // Auto-stop typing after 10 seconds
      setTimeout(async () => {
        await this.stopTyping(userId, conversationId);
      }, 10000);
    } catch (error) {
      this.logger.error('Failed to start typing:', error);
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(userId: string, conversationId: string): Promise<void> {
    try {
      await this.typingRepository.delete({ conversationId, userId });

      this.server.to(conversationId).emit('user-stopped-typing', {
        userId,
        conversationId,
      });
    } catch (error) {
      this.logger.error('Failed to stop typing:', error);
    }
  }

  /**
   * Search messages across conversations
   */
  async searchMessages(
    userId: string,
    query: string,
    conversationId?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ messages: Message[]; total: number }> {
    try {
      // Get user's accessible conversations
      const userConversations = await this.participantRepository.find({
        where: { userId, isActive: true },
        select: ['conversationId'],
      });

      const conversationIds = userConversations.map(p => p.conversationId);

      if (conversationIds.length === 0) {
        return { messages: [], total: 0 };
      }

      const whereCondition: any = {
        conversationId: conversationId ? conversationId : In(conversationIds),
        isDeleted: false,
      };

      // Add text search condition (PostgreSQL full-text search)
      if (query.trim()) {
        whereCondition.content = { $ilike: `%${query}%` } as any;
      }

      const [messages, total] = await this.messageRepository.findAndCount({
        where: whereCondition,
        relations: ['sender', 'conversation'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { messages, total };
    } catch (error) {
      this.logger.error('Failed to search messages:', error);
      throw error;
    }
  }

  /**
   * Get conversation details
   */
  async getConversationDetails(
    userId: string,
    conversationId: string
  ): Promise<Conversation> {
    try {
      const participant = await this.participantRepository.findOne({
        where: { conversationId, userId, isActive: true },
      });

      if (!participant) {
        throw new ForbiddenException('User is not a participant in this conversation');
      }

      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
        relations: ['participants', 'participants.user', 'creator'],
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return conversation;
    } catch (error) {
      this.logger.error('Failed to get conversation details:', error);
      throw error;
    }
  }

  // Private helper methods
  private async findDirectConversation(user1Id: string, user2Id: string): Promise<Conversation | null> {
    const conversation = await this.conversationRepository
      .createQueryBuilder('conversation')
      .where('conversation.type = :type', { type: ConversationType.DIRECT })
      .andWhere('conversation.participantIds @> :user1', { user1: [user1Id] })
      .andWhere('conversation.participantIds @> :user2', { user2: [user2Id] })
      .andWhere('conversation.isActive = true')
      .getOne();

    return conversation;
  }

  private generateConversationName(type: ConversationType, participants: User[]): string {
    if (type === ConversationType.DIRECT) {
      return participants
        .map(p => `${p.firstName} ${p.lastName}`)
        .join(' & ');
    }
    return `Group Chat with ${participants.length} members`;
  }

  private moderateContent(content: string): string {
    // Basic profanity filter
    if (profanityCheck.isProfane(content)) {
      return profanityCheck.censor(content);
    }
    return content;
  }

  private extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    
    return mentions;
  }

  private extractHashtags(content: string): string[] {
    const hashtagRegex = /#(\w+)/g;
    const hashtags: string[] = [];
    let match;
    
    while ((match = hashtagRegex.exec(content)) !== null) {
      hashtags.push(match[1]);
    }
    
    return hashtags;
  }

  private async generateLinkPreviews(content: string): Promise<any[]> {
    const links = this.linkifyInstance.match(content);
    
    if (!links) return [];

    // In a real implementation, you would fetch metadata from these URLs
    return links.map(link => ({
      url: link.url,
      title: 'Link Preview',
      description: 'Preview description',
    }));
  }

  private async checkConversationOnlineStatus(conversationId: string, excludeUserId: string): Promise<boolean> {
    // In a real implementation, you would check Redis for online users
    // For now, return a placeholder
    return Math.random() > 0.5;
  }

  private truncateMessage(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  private async sendPushNotifications(userIds: string[], message: Message): Promise<void> {
    // Placeholder for push notification implementation
    // Would integrate with Firebase, APNs, etc.
    this.logger.log(`Push notifications sent to ${userIds.length} users for message ${message.id}`);
  }
}