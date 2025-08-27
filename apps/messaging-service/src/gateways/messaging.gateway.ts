import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessagingService } from '../services/messaging.service';
import { MessageType } from '../entities/message.entity';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  },
  namespace: '/messaging',
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private connectedUsers = new Map<string, string>(); // userId -> socketId
  private userSockets = new Map<string, AuthenticatedSocket>(); // socketId -> socket

  constructor(
    private readonly jwtService: JwtService,
    private readonly messagingService: MessagingService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn('WebSocket connection rejected: No token provided');
        client.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token);
      const userId = decoded.sub || decoded.id;

      if (!userId) {
        this.logger.warn('WebSocket connection rejected: Invalid token');
        client.disconnect();
        return;
      }

      client.userId = userId;
      client.user = decoded;

      // Store user connections
      this.connectedUsers.set(userId, client.id);
      this.userSockets.set(client.id, client);

      // Join user to their personal room
      await client.join(`user:${userId}`);

      // Join user to their conversation rooms
      await this.joinUserConversations(client, userId);

      // Notify other users that this user is online
      this.server.emit('user-online', {
        userId,
        timestamp: new Date(),
      });

      this.logger.log(`User ${userId} connected via WebSocket`);
    } catch (error) {
      this.logger.error('WebSocket authentication failed:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.connectedUsers.delete(client.userId);
      this.userSockets.delete(client.id);

      // Notify other users that this user is offline
      this.server.emit('user-offline', {
        userId: client.userId,
        timestamp: new Date(),
      });

      this.logger.log(`User ${client.userId} disconnected from WebSocket`);
    }
  }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      const { conversationId } = data;
      
      // Verify user is participant in this conversation
      // This would normally check with the messaging service
      await client.join(`conversation:${conversationId}`);
      
      this.logger.log(`User ${client.userId} joined conversation ${conversationId}`);
      
      return { success: true, message: 'Joined conversation successfully' };
    } catch (error) {
      this.logger.error('Failed to join conversation:', error);
      return { error: 'Failed to join conversation' };
    }
  }

  @SubscribeMessage('leave-conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string }
  ) {
    try {
      const { conversationId } = data;
      
      await client.leave(`conversation:${conversationId}`);
      
      this.logger.log(`User ${client.userId} left conversation ${conversationId}`);
      
      return { success: true, message: 'Left conversation successfully' };
    } catch (error) {
      this.logger.error('Failed to leave conversation:', error);
      return { error: 'Failed to leave conversation' };
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: {
      conversationId: string;
      content: string;
      type?: MessageType;
      replyToMessageId?: string;
      attachments?: any[];
    }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      const message = await this.messagingService.sendMessage(client.userId, {
        conversationId: data.conversationId,
        content: data.content,
        type: data.type || MessageType.TEXT,
        replyToMessageId: data.replyToMessageId,
        attachments: data.attachments || [],
      });

      // Message is automatically broadcasted by the messaging service
      return { success: true, data: message };
    } catch (error) {
      this.logger.error('Failed to send message via WebSocket:', error);
      return { error: 'Failed to send message' };
    }
  }

  @SubscribeMessage('start-typing')
  async handleStartTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      await this.messagingService.startTyping(client.userId, data.conversationId);
      
      // Broadcast to conversation participants (excluding sender)
      client.to(`conversation:${data.conversationId}`).emit('user-typing', {
        userId: client.userId,
        conversationId: data.conversationId,
        user: client.user,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to start typing:', error);
      return { error: 'Failed to start typing' };
    }
  }

  @SubscribeMessage('stop-typing')
  async handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      await this.messagingService.stopTyping(client.userId, data.conversationId);
      
      // Broadcast to conversation participants (excluding sender)
      client.to(`conversation:${data.conversationId}`).emit('user-stopped-typing', {
        userId: client.userId,
        conversationId: data.conversationId,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to stop typing:', error);
      return { error: 'Failed to stop typing' };
    }
  }

  @SubscribeMessage('mark-as-read')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; messageId: string }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      // This would normally update read status in the database
      // For now, just broadcast the read receipt
      client.to(`conversation:${data.conversationId}`).emit('message-read', {
        userId: client.userId,
        messageId: data.messageId,
        conversationId: data.conversationId,
        readAt: new Date(),
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to mark as read:', error);
      return { error: 'Failed to mark as read' };
    }
  }

  @SubscribeMessage('add-reaction')
  async handleAddReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; emoji: string }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      const reaction = await this.messagingService.addReaction(
        client.userId,
        data.messageId,
        data.emoji
      );

      // Reaction event is automatically broadcasted by the messaging service
      return { success: true, data: reaction };
    } catch (error) {
      this.logger.error('Failed to add reaction via WebSocket:', error);
      return { error: 'Failed to add reaction' };
    }
  }

  @SubscribeMessage('get-online-users')
  async handleGetOnlineUsers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId?: string }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      // Get all connected users
      const onlineUsers = Array.from(this.connectedUsers.keys());
      
      // If conversationId is provided, filter to conversation participants
      // This would normally check the database for conversation participants
      
      return { success: true, data: { onlineUsers } };
    } catch (error) {
      this.logger.error('Failed to get online users:', error);
      return { error: 'Failed to get online users' };
    }
  }

  @SubscribeMessage('share-workflow')
  async handleShareWorkflow(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: {
      conversationId: string;
      workflowId: string;
      message?: string;
    }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      const message = await this.messagingService.sendMessage(client.userId, {
        conversationId: data.conversationId,
        content: data.message || 'Shared a workflow',
        type: MessageType.WORKFLOW_SHARE,
        metadata: {
          workflowId: data.workflowId,
          sharedAt: new Date(),
        },
      });

      return { success: true, data: message };
    } catch (error) {
      this.logger.error('Failed to share workflow via WebSocket:', error);
      return { error: 'Failed to share workflow' };
    }
  }

  @SubscribeMessage('send-tokens')
  async handleSendTokens(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: {
      conversationId: string;
      recipientId: string;
      amount: string;
      message?: string;
    }
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      // Here you would integrate with the wallet service to actually transfer tokens
      // For now, we'll just send a message about the transfer
      
      const message = await this.messagingService.sendMessage(client.userId, {
        conversationId: data.conversationId,
        content: data.message || `Sent ${data.amount} SBARO tokens`,
        type: MessageType.TOKEN_TRANSFER,
        metadata: {
          recipientId: data.recipientId,
          tokenAmount: data.amount,
          transferredAt: new Date(),
        },
      });

      return { success: true, data: message };
    } catch (error) {
      this.logger.error('Failed to send tokens via WebSocket:', error);
      return { error: 'Failed to send tokens' };
    }
  }

  // Helper method to join user to their conversation rooms
  private async joinUserConversations(socket: AuthenticatedSocket, userId: string) {
    try {
      // This would normally fetch user's conversations from the database
      // For now, we'll just join them to a user-specific room
      await socket.join(`user:${userId}`);
      
      // In a real implementation, you would:
      // 1. Fetch user's active conversations
      // 2. Join socket to each conversation room
      // 3. Update online status for each conversation
      
      this.logger.log(`User ${userId} joined their conversation rooms`);
    } catch (error) {
      this.logger.error('Failed to join user conversations:', error);
    }
  }

  // Method to send message to specific user
  public sendToUser(userId: string, event: string, data: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }

  // Method to send message to conversation
  public sendToConversation(conversationId: string, event: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }

  // Method to check if user is online
  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // Method to get online users count
  public getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }
}