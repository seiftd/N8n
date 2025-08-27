import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../api/src/auth/guards/jwt-auth.guard';
import { MessagingService, CreateConversationDto, SendMessageDto } from '../services/messaging.service';
import { ConversationType, MessageType } from '../entities/message.entity';

@Controller('api/messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /**
   * Create a new conversation
   */
  @Post('conversations')
  async createConversation(
    @Request() req,
    @Body() createDto: CreateConversationDto
  ) {
    try {
      const conversation = await this.messagingService.createConversation(
        req.user.id,
        createDto
      );

      return {
        success: true,
        data: conversation,
        message: 'Conversation created successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Get user's conversations
   */
  @Get('conversations')
  async getUserConversations(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    try {
      const result = await this.messagingService.getUserConversations(
        req.user.id,
        parseInt(page),
        parseInt(limit)
      );

      return {
        success: true,
        data: result.conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          totalPages: Math.ceil(result.total / parseInt(limit)),
        },
        message: 'Conversations retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Get conversation details
   */
  @Get('conversations/:conversationId')
  async getConversationDetails(
    @Request() req,
    @Param('conversationId') conversationId: string
  ) {
    try {
      const conversation = await this.messagingService.getConversationDetails(
        req.user.id,
        conversationId
      );

      return {
        success: true,
        data: conversation,
        message: 'Conversation details retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Get messages in a conversation
   */
  @Get('conversations/:conversationId/messages')
  async getConversationMessages(
    @Request() req,
    @Param('conversationId') conversationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ) {
    try {
      const result = await this.messagingService.getConversationMessages(
        req.user.id,
        conversationId,
        parseInt(page),
        parseInt(limit)
      );

      return {
        success: true,
        data: result.messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          hasMore: result.hasMore,
        },
        message: 'Messages retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Send a message
   */
  @Post('messages')
  @UseInterceptors(FilesInterceptor('attachments', 10))
  async sendMessage(
    @Request() req,
    @Body() sendDto: SendMessageDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    try {
      // Process file attachments if any
      const attachments = [];
      if (files && files.length > 0) {
        for (const file of files) {
          // In a real implementation, you would upload to cloud storage
          attachments.push({
            url: `/uploads/${file.filename}`,
            filename: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
          });
        }
      }

      const message = await this.messagingService.sendMessage(req.user.id, {
        ...sendDto,
        attachments,
      });

      return {
        success: true,
        data: message,
        message: 'Message sent successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Add reaction to a message
   */
  @Post('messages/:messageId/reactions')
  async addReaction(
    @Request() req,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string
  ) {
    try {
      if (!emoji || emoji.length > 10) {
        throw new BadRequestException('Invalid emoji');
      }

      const reaction = await this.messagingService.addReaction(
        req.user.id,
        messageId,
        emoji
      );

      return {
        success: true,
        data: reaction,
        message: reaction ? 'Reaction added successfully' : 'Reaction removed successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Search messages
   */
  @Get('search')
  async searchMessages(
    @Request() req,
    @Query('q') query: string,
    @Query('conversationId') conversationId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    try {
      if (!query || query.trim().length < 2) {
        throw new BadRequestException('Search query must be at least 2 characters');
      }

      const result = await this.messagingService.searchMessages(
        req.user.id,
        query.trim(),
        conversationId,
        parseInt(page),
        parseInt(limit)
      );

      return {
        success: true,
        data: result.messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          totalPages: Math.ceil(result.total / parseInt(limit)),
        },
        message: 'Search completed successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Start direct conversation with a user
   */
  @Post('conversations/direct')
  async startDirectConversation(
    @Request() req,
    @Body('userId') targetUserId: string
  ) {
    try {
      if (!targetUserId) {
        throw new BadRequestException('Target user ID is required');
      }

      if (targetUserId === req.user.id) {
        throw new BadRequestException('Cannot start conversation with yourself');
      }

      const conversation = await this.messagingService.createConversation(
        req.user.id,
        {
          type: ConversationType.DIRECT,
          participantIds: [targetUserId],
        }
      );

      return {
        success: true,
        data: conversation,
        message: 'Direct conversation created successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Share workflow in conversation
   */
  @Post('conversations/:conversationId/share-workflow')
  async shareWorkflow(
    @Request() req,
    @Param('conversationId') conversationId: string,
    @Body() body: { workflowId: string; message?: string }
  ) {
    try {
      const { workflowId, message } = body;

      if (!workflowId) {
        throw new BadRequestException('Workflow ID is required');
      }

      const messageContent = message || 'Shared a workflow';
      
      const sentMessage = await this.messagingService.sendMessage(req.user.id, {
        conversationId,
        content: messageContent,
        type: MessageType.WORKFLOW_SHARE,
        metadata: {
          workflowId,
          sharedAt: new Date(),
        },
      });

      return {
        success: true,
        data: sentMessage,
        message: 'Workflow shared successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Send SBARO tokens in conversation
   */
  @Post('conversations/:conversationId/send-tokens')
  async sendTokens(
    @Request() req,
    @Param('conversationId') conversationId: string,
    @Body() body: { recipientId: string; amount: string; message?: string }
  ) {
    try {
      const { recipientId, amount, message } = body;

      if (!recipientId || !amount) {
        throw new BadRequestException('Recipient ID and amount are required');
      }

      // Here you would integrate with the wallet service to actually transfer tokens
      // For now, we'll just send a message about the transfer
      
      const messageContent = message || `Sent ${amount} SBARO tokens`;
      
      const sentMessage = await this.messagingService.sendMessage(req.user.id, {
        conversationId,
        content: messageContent,
        type: MessageType.TOKEN_TRANSFER,
        metadata: {
          recipientId,
          tokenAmount: amount,
          transferredAt: new Date(),
        },
      });

      return {
        success: true,
        data: sentMessage,
        message: 'Token transfer message sent successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Get typing indicators for a conversation
   */
  @Get('conversations/:conversationId/typing')
  async getTypingIndicators(
    @Request() req,
    @Param('conversationId') conversationId: string
  ) {
    try {
      // This would typically be handled via WebSocket, but providing REST endpoint too
      return {
        success: true,
        data: [],
        message: 'Typing indicators retrieved (use WebSocket for real-time)',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}