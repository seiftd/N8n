import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { speech, textToSpeech } from '@google-cloud/speech';
import * as natural from 'natural';
import * as compromise from 'compromise';
import * as sentiment from 'sentiment';
import * as keywordExtractor from 'keyword-extractor';

export interface VoiceCommand {
  id: string;
  userId: string;
  sessionId: string;
  audioData?: Buffer;
  transcript?: string;
  intent: {
    action: string;
    entities: Record<string, any>;
    confidence: number;
  };
  context: {
    currentWorkflow?: string;
    activeExecution?: string;
    userPreferences: Record<string, any>;
  };
  timestamp: Date;
}

export interface VoiceResponse {
  id: string;
  type: 'text' | 'audio' | 'action' | 'confirmation';
  content: string;
  audioUrl?: string;
  action?: {
    type: string;
    parameters: Record<string, any>;
    requiresConfirmation: boolean;
  };
  suggestions?: string[];
}

export interface ConversationContext {
  sessionId: string;
  userId: string;
  history: Array<{
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: any;
  }>;
  currentWorkflow?: string;
  pendingActions: any[];
  userPreferences: {
    language: string;
    voiceSpeed: number;
    verbosity: 'minimal' | 'normal' | 'detailed';
    confirmActions: boolean;
  };
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/voice-interface',
})
export class VoiceInterfaceService {
  private readonly logger = new Logger(VoiceInterfaceService.name);
  
  @WebSocketServer()
  server: Server;

  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;
  private readonly speechConfig: sdk.SpeechConfig;
  private readonly googleSpeechClient: any;
  private readonly googleTTSClient: any;
  
  private activeSessions = new Map<string, ConversationContext>();
  private voiceCommands = new Map<string, VoiceCommand>();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize Azure Speech SDK
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY || '',
      process.env.AZURE_SPEECH_REGION || ''
    );

    // Initialize Google Cloud Speech clients
    this.googleSpeechClient = new speech.SpeechClient();
    this.googleTTSClient = new textToSpeech.TextToSpeechClient();
  }

  /**
   * Handle voice command from user
   */
  @SubscribeMessage('voice-command')
  async handleVoiceCommand(
    @MessageBody() data: { audioData: string; sessionId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      const { audioData, sessionId, userId } = data;
      
      this.logger.log(`Processing voice command for session: ${sessionId}`);

      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');

      // Transcribe audio to text
      const transcript = await this.transcribeAudio(audioBuffer);
      
      if (!transcript) {
        client.emit('voice-response', {
          type: 'text',
          content: 'Sorry, I couldn\'t understand what you said. Could you please repeat?',
        });
        return;
      }

      // Process the voice command
      const voiceCommand: VoiceCommand = {
        id: this.generateId(),
        userId,
        sessionId,
        audioData: audioBuffer,
        transcript,
        intent: await this.extractIntent(transcript),
        context: this.getSessionContext(sessionId),
        timestamp: new Date(),
      };

      this.voiceCommands.set(voiceCommand.id, voiceCommand);

      // Generate and send response
      const response = await this.processVoiceCommand(voiceCommand);
      
      // Update conversation context
      this.updateConversationContext(sessionId, transcript, response.content);

      // Send response to client
      client.emit('voice-response', response);

      // If response includes audio, generate and send it
      if (response.type === 'audio' || this.shouldIncludeAudio(sessionId)) {
        const audioResponse = await this.generateSpeechResponse(response.content, sessionId);
        client.emit('voice-audio', { audioUrl: audioResponse });
      }

    } catch (error) {
      this.logger.error('Voice command processing failed:', error);
      client.emit('voice-response', {
        type: 'text',
        content: 'I encountered an error processing your request. Please try again.',
      });
    }
  }

  /**
   * Handle text chat message
   */
  @SubscribeMessage('chat-message')
  async handleChatMessage(
    @MessageBody() data: { message: string; sessionId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      const { message, sessionId, userId } = data;
      
      this.logger.log(`Processing chat message for session: ${sessionId}`);

      // Process as voice command but without audio
      const voiceCommand: VoiceCommand = {
        id: this.generateId(),
        userId,
        sessionId,
        transcript: message,
        intent: await this.extractIntent(message),
        context: this.getSessionContext(sessionId),
        timestamp: new Date(),
      };

      const response = await this.processVoiceCommand(voiceCommand);
      
      // Update conversation context
      this.updateConversationContext(sessionId, message, response.content);

      client.emit('chat-response', response);

    } catch (error) {
      this.logger.error('Chat message processing failed:', error);
      client.emit('chat-response', {
        type: 'text',
        content: 'I encountered an error processing your message. Please try again.',
      });
    }
  }

  /**
   * Start new conversation session
   */
  @SubscribeMessage('start-session')
  async handleStartSession(
    @MessageBody() data: { userId: string; preferences?: any },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const sessionId = this.generateId();
    
    const context: ConversationContext = {
      sessionId,
      userId: data.userId,
      history: [],
      pendingActions: [],
      userPreferences: {
        language: 'en-US',
        voiceSpeed: 1.0,
        verbosity: 'normal',
        confirmActions: true,
        ...data.preferences,
      },
    };

    this.activeSessions.set(sessionId, context);

    client.emit('session-started', {
      sessionId,
      welcomeMessage: 'Hello! I\'m your AI assistant. You can speak or type to interact with your workflows. How can I help you today?',
    });

    this.logger.log(`Started new session: ${sessionId} for user: ${data.userId}`);
  }

  /**
   * Transcribe audio to text using multiple speech recognition services
   */
  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Try Azure Speech Service first
      const azureResult = await this.transcribeWithAzure(audioBuffer);
      if (azureResult) return azureResult;

      // Fallback to Google Speech-to-Text
      const googleResult = await this.transcribeWithGoogle(audioBuffer);
      if (googleResult) return googleResult;

      // Fallback to OpenAI Whisper
      const openaiResult = await this.transcribeWithWhisper(audioBuffer);
      return openaiResult;

    } catch (error) {
      this.logger.error('Audio transcription failed:', error);
      return '';
    }
  }

  private async transcribeWithAzure(audioBuffer: Buffer): Promise<string> {
    try {
      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve(result.text);
            } else {
              resolve('');
            }
            recognizer.close();
          },
          (error) => {
            recognizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      this.logger.warn('Azure transcription failed:', error);
      return '';
    }
  }

  private async transcribeWithGoogle(audioBuffer: Buffer): Promise<string> {
    try {
      const request = {
        audio: { content: audioBuffer.toString('base64') },
        config: {
          encoding: 'WEBM_OPUS' as const,
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
        },
      };

      const [response] = await this.googleSpeechClient.recognize(request);
      const transcription = response.results
        ?.map((result: any) => result.alternatives[0].transcript)
        .join('\n');

      return transcription || '';
    } catch (error) {
      this.logger.warn('Google transcription failed:', error);
      return '';
    }
  }

  private async transcribeWithWhisper(audioBuffer: Buffer): Promise<string> {
    try {
      // Convert buffer to file-like object for OpenAI
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
      
      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en',
      });

      return transcription.text;
    } catch (error) {
      this.logger.warn('Whisper transcription failed:', error);
      return '';
    }
  }

  /**
   * Extract intent and entities from text using advanced NLP
   */
  private async extractIntent(text: string): Promise<{ action: string; entities: Record<string, any>; confidence: number }> {
    try {
      // Use multiple approaches for robust intent recognition
      const [aiIntent, nlpIntent] = await Promise.all([
        this.extractIntentWithAI(text),
        this.extractIntentWithNLP(text),
      ]);

      // Combine results for higher accuracy
      return this.combineIntentResults(aiIntent, nlpIntent);
    } catch (error) {
      this.logger.error('Intent extraction failed:', error);
      return { action: 'unknown', entities: {}, confidence: 0 };
    }
  }

  private async extractIntentWithAI(text: string): Promise<any> {
    const prompt = `
Analyze this user request and extract the intent and entities:
"${text}"

Available actions:
- create_workflow: Create a new workflow
- execute_workflow: Run an existing workflow
- edit_workflow: Modify a workflow
- delete_workflow: Delete a workflow
- view_executions: Show execution history
- view_workflows: List workflows
- get_status: Check workflow/execution status
- help: Get help or information
- configure: Change settings or preferences

Extract:
1. Primary action/intent
2. Entities (workflow names, parameters, values)
3. Confidence score (0-1)

Return JSON format:
{
  "action": "action_name",
  "entities": {
    "workflow_name": "name if mentioned",
    "parameters": {},
    "values": []
  },
  "confidence": 0.9
}
`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at understanding user intents for workflow automation. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0]?.message?.content || '{}');
  }

  private extractIntentWithNLP(text: string): any {
    const doc = compromise(text);
    
    // Extract action verbs
    const verbs = doc.verbs().out('array');
    const actionVerbs = ['create', 'make', 'build', 'run', 'execute', 'start', 'edit', 'modify', 'delete', 'remove', 'show', 'list', 'view', 'check', 'get'];
    const detectedActions = verbs.filter(verb => actionVerbs.some(action => verb.toLowerCase().includes(action)));

    // Extract entities
    const nouns = doc.nouns().out('array');
    const workflowKeywords = ['workflow', 'automation', 'process', 'task', 'job'];
    const workflowMentions = nouns.filter(noun => workflowKeywords.some(keyword => noun.toLowerCase().includes(keyword)));

    // Determine primary action
    let primaryAction = 'unknown';
    if (detectedActions.length > 0) {
      const action = detectedActions[0].toLowerCase();
      if (action.includes('create') || action.includes('make') || action.includes('build')) {
        primaryAction = 'create_workflow';
      } else if (action.includes('run') || action.includes('execute') || action.includes('start')) {
        primaryAction = 'execute_workflow';
      } else if (action.includes('edit') || action.includes('modify')) {
        primaryAction = 'edit_workflow';
      } else if (action.includes('delete') || action.includes('remove')) {
        primaryAction = 'delete_workflow';
      } else if (action.includes('show') || action.includes('list') || action.includes('view')) {
        primaryAction = workflowMentions.length > 0 ? 'view_workflows' : 'view_executions';
      }
    }

    // Calculate confidence based on keyword matches
    const confidence = Math.min((detectedActions.length * 0.3 + workflowMentions.length * 0.2 + 0.5), 1);

    return {
      action: primaryAction,
      entities: {
        workflow_name: this.extractWorkflowName(text),
        mentioned_nouns: nouns,
        action_verbs: detectedActions,
      },
      confidence,
    };
  }

  private extractWorkflowName(text: string): string | null {
    // Look for quoted strings or common patterns
    const quotedMatch = text.match(/"([^"]+)"/);
    if (quotedMatch) return quotedMatch[1];

    const namedMatch = text.match(/(?:workflow|automation|process)\s+(?:called|named)\s+([a-zA-Z0-9\s]+)/i);
    if (namedMatch) return namedMatch[1].trim();

    return null;
  }

  private combineIntentResults(aiIntent: any, nlpIntent: any): any {
    // Prefer AI result if confidence is high, otherwise combine
    if (aiIntent.confidence > 0.8) {
      return aiIntent;
    }

    if (nlpIntent.confidence > aiIntent.confidence) {
      return {
        action: nlpIntent.action,
        entities: { ...nlpIntent.entities, ...aiIntent.entities },
        confidence: Math.max(nlpIntent.confidence, aiIntent.confidence * 0.8),
      };
    }

    return {
      action: aiIntent.action || nlpIntent.action,
      entities: { ...nlpIntent.entities, ...aiIntent.entities },
      confidence: Math.max(aiIntent.confidence, nlpIntent.confidence),
    };
  }

  /**
   * Process voice command and generate appropriate response
   */
  private async processVoiceCommand(command: VoiceCommand): Promise<VoiceResponse> {
    const { intent, context } = command;

    try {
      switch (intent.action) {
        case 'create_workflow':
          return await this.handleCreateWorkflow(command);
        
        case 'execute_workflow':
          return await this.handleExecuteWorkflow(command);
        
        case 'edit_workflow':
          return await this.handleEditWorkflow(command);
        
        case 'delete_workflow':
          return await this.handleDeleteWorkflow(command);
        
        case 'view_workflows':
          return await this.handleViewWorkflows(command);
        
        case 'view_executions':
          return await this.handleViewExecutions(command);
        
        case 'get_status':
          return await this.handleGetStatus(command);
        
        case 'help':
          return await this.handleHelp(command);
        
        case 'configure':
          return await this.handleConfigure(command);
        
        default:
          return await this.handleUnknownIntent(command);
      }
    } catch (error) {
      this.logger.error('Command processing failed:', error);
      return {
        id: this.generateId(),
        type: 'text',
        content: 'I encountered an error while processing your request. Please try again or be more specific.',
      };
    }
  }

  private async handleCreateWorkflow(command: VoiceCommand): Promise<VoiceResponse> {
    const workflowName = command.intent.entities.workflow_name || 'New Workflow';
    
    if (command.transcript && command.transcript.length > 20) {
      // Use the full transcript as workflow description for autonomous generation
      return {
        id: this.generateId(),
        type: 'action',
        content: `I'll create a workflow called "${workflowName}" based on your description. Let me generate it for you.`,
        action: {
          type: 'generate_workflow',
          parameters: {
            description: command.transcript,
            name: workflowName,
            userId: command.userId,
          },
          requiresConfirmation: true,
        },
        suggestions: [
          'Generate the workflow automatically',
          'Let me provide more details first',
          'Show me similar templates',
        ],
      };
    }

    return {
      id: this.generateId(),
      type: 'text',
      content: `I'd love to help you create a workflow! Could you tell me more about what you want this workflow to do? For example, "Create a workflow that sends me an email when someone fills out my contact form."`,
      suggestions: [
        'Create a data processing workflow',
        'Create an email automation workflow',
        'Create a social media posting workflow',
      ],
    };
  }

  private async handleExecuteWorkflow(command: VoiceCommand): Promise<VoiceResponse> {
    const workflowName = command.intent.entities.workflow_name;
    
    if (!workflowName) {
      return {
        id: this.generateId(),
        type: 'text',
        content: 'Which workflow would you like to execute? Please specify the workflow name.',
        suggestions: [
          'Show me my workflows',
          'Execute my latest workflow',
          'Execute the most used workflow',
        ],
      };
    }

    return {
      id: this.generateId(),
      type: 'action',
      content: `I'll execute the workflow "${workflowName}" for you.`,
      action: {
        type: 'execute_workflow',
        parameters: {
          workflowName,
          userId: command.userId,
        },
        requiresConfirmation: false,
      },
    };
  }

  private async handleViewWorkflows(command: VoiceCommand): Promise<VoiceResponse> {
    return {
      id: this.generateId(),
      type: 'action',
      content: 'Here are your workflows. I can help you manage, execute, or modify any of them.',
      action: {
        type: 'list_workflows',
        parameters: {
          userId: command.userId,
          includeStats: true,
        },
        requiresConfirmation: false,
      },
      suggestions: [
        'Execute a workflow',
        'Create a new workflow',
        'Show execution history',
      ],
    };
  }

  private async handleHelp(command: VoiceCommand): Promise<VoiceResponse> {
    const helpContent = `
I'm your AI workflow assistant! Here's what I can help you with:

🔹 **Create workflows**: Just describe what you want to automate
🔹 **Execute workflows**: Tell me which workflow to run
🔹 **Manage workflows**: Edit, delete, or view your workflows
🔹 **Monitor executions**: Check status and view execution history
🔹 **Get insights**: Ask about performance and optimization

Try saying things like:
• "Create a workflow that posts to social media daily"
• "Execute my email marketing workflow"
• "Show me my recent workflow executions"
• "How is my data processing workflow performing?"
`;

    return {
      id: this.generateId(),
      type: 'text',
      content: helpContent,
      suggestions: [
        'Create a new workflow',
        'Show my workflows',
        'Check execution status',
      ],
    };
  }

  private async handleUnknownIntent(command: VoiceCommand): Promise<VoiceResponse> {
    // Use AI to generate a helpful response for unclear requests
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful workflow automation assistant. The user said something unclear. Provide a helpful response that guides them toward workflow-related actions.',
        },
        {
          role: 'user',
          content: `User said: "${command.transcript}". Help them clarify their request.`,
        },
      ],
      temperature: 0.7,
    });

    return {
      id: this.generateId(),
      type: 'text',
      content: response.choices[0]?.message?.content || 'I\'m not sure what you\'d like to do. Could you please be more specific? You can ask me to create, execute, or manage workflows.',
      suggestions: [
        'Create a workflow',
        'Execute a workflow',
        'Show my workflows',
        'Get help',
      ],
    };
  }

  private async handleEditWorkflow(command: VoiceCommand): Promise<VoiceResponse> {
    const workflowName = command.intent.entities.workflow_name;
    
    return {
      id: this.generateId(),
      type: 'text',
      content: workflowName 
        ? `I can help you edit "${workflowName}". What changes would you like to make?`
        : 'Which workflow would you like to edit? Please specify the workflow name.',
      suggestions: [
        'Add a new step',
        'Modify existing parameters',
        'Change the trigger conditions',
        'Show me the current workflow',
      ],
    };
  }

  private async handleDeleteWorkflow(command: VoiceCommand): Promise<VoiceResponse> {
    const workflowName = command.intent.entities.workflow_name;
    
    if (!workflowName) {
      return {
        id: this.generateId(),
        type: 'text',
        content: 'Which workflow would you like to delete? Please specify the workflow name.',
      };
    }

    return {
      id: this.generateId(),
      type: 'confirmation',
      content: `Are you sure you want to delete the workflow "${workflowName}"? This action cannot be undone.`,
      action: {
        type: 'delete_workflow',
        parameters: {
          workflowName,
          userId: command.userId,
        },
        requiresConfirmation: true,
      },
    };
  }

  private async handleViewExecutions(command: VoiceCommand): Promise<VoiceResponse> {
    return {
      id: this.generateId(),
      type: 'action',
      content: 'Here are your recent workflow executions with their status and performance metrics.',
      action: {
        type: 'list_executions',
        parameters: {
          userId: command.userId,
          limit: 10,
          includeMetrics: true,
        },
        requiresConfirmation: false,
      },
    };
  }

  private async handleGetStatus(command: VoiceCommand): Promise<VoiceResponse> {
    return {
      id: this.generateId(),
      type: 'action',
      content: 'Let me check the status of your workflows and active executions.',
      action: {
        type: 'get_system_status',
        parameters: {
          userId: command.userId,
          includePerformance: true,
        },
        requiresConfirmation: false,
      },
    };
  }

  private async handleConfigure(command: VoiceCommand): Promise<VoiceResponse> {
    return {
      id: this.generateId(),
      type: 'text',
      content: 'I can help you configure your preferences. What would you like to change?',
      suggestions: [
        'Change voice settings',
        'Update notification preferences',
        'Modify default workflow settings',
        'Configure integration credentials',
      ],
    };
  }

  /**
   * Generate speech response using text-to-speech
   */
  private async generateSpeechResponse(text: string, sessionId: string): Promise<string> {
    try {
      const context = this.activeSessions.get(sessionId);
      const language = context?.userPreferences.language || 'en-US';
      const speed = context?.userPreferences.voiceSpeed || 1.0;

      // Try Google Text-to-Speech first
      const audioBuffer = await this.generateSpeechWithGoogle(text, language, speed);
      
      // In a real implementation, save audio to storage and return URL
      const audioUrl = await this.saveAudioFile(audioBuffer);
      
      return audioUrl;
    } catch (error) {
      this.logger.error('Speech generation failed:', error);
      return '';
    }
  }

  private async generateSpeechWithGoogle(text: string, language: string, speed: number): Promise<Buffer> {
    const request = {
      input: { text },
      voice: {
        languageCode: language,
        ssmlGender: 'NEUTRAL' as const,
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
        speakingRate: speed,
      },
    };

    const [response] = await this.googleTTSClient.synthesizeSpeech(request);
    return Buffer.from(response.audioContent, 'binary');
  }

  private async saveAudioFile(audioBuffer: Buffer): Promise<string> {
    // In a real implementation, save to cloud storage (S3, GCS, etc.)
    const filename = `voice-response-${Date.now()}.mp3`;
    const url = `https://audio.sbaro.com/${filename}`;
    
    // Mock implementation
    return url;
  }

  /**
   * Utility methods
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getSessionContext(sessionId: string): any {
    const session = this.activeSessions.get(sessionId);
    return {
      currentWorkflow: session?.currentWorkflow,
      userPreferences: session?.userPreferences || {},
    };
  }

  private updateConversationContext(sessionId: string, userMessage: string, assistantResponse: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.history.push(
        {
          type: 'user',
          content: userMessage,
          timestamp: new Date(),
        },
        {
          type: 'assistant',
          content: assistantResponse,
          timestamp: new Date(),
        }
      );

      // Keep only last 20 messages to manage memory
      if (session.history.length > 20) {
        session.history = session.history.slice(-20);
      }
    }
  }

  private shouldIncludeAudio(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return session?.userPreferences.voiceSpeed !== undefined;
  }
}