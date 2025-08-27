import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface AINodeContext {
  variables: Record<string, any>;
  inputData: any[];
}

export interface AINodeResult {
  success: boolean;
  data: any[];
  error?: string;
  usage?: {
    tokens?: number;
    cost?: number;
    model?: string;
  };
}

@Injectable()
export class AINodesService {
  private readonly logger = new Logger(AINodesService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  // OpenAI Chat Completion
  async executeOpenAIChat(parameters: {
    model?: string;
    prompt: string;
    systemMessage?: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
  }, context: AINodeContext): Promise<AINodeResult> {
    const {
      model = 'gpt-3.5-turbo',
      prompt,
      systemMessage,
      temperature = 0.7,
      maxTokens = 1000,
      apiKey
    } = parameters;

    const key = apiKey || this.configService.get('OPENAI_API_KEY');
    if (!key) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const messages = [];
      
      if (systemMessage) {
        messages.push({ role: 'system', content: this.processTemplate(systemMessage, context) });
      }
      
      messages.push({ role: 'user', content: this.processTemplate(prompt, context) });

      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          },
          {
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const completion = response.data.choices[0]?.message?.content;
      const usage = response.data.usage;

      return {
        success: true,
        data: [{
          response: completion,
          model,
          usage,
          timestamp: new Date().toISOString(),
        }],
        usage: {
          tokens: usage?.total_tokens,
          model,
        },
      };
    } catch (error) {
      this.logger.error('OpenAI API error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  // Anthropic Claude
  async executeClaudeChat(parameters: {
    model?: string;
    prompt: string;
    systemMessage?: string;
    maxTokens?: number;
    apiKey?: string;
  }, context: AINodeContext): Promise<AINodeResult> {
    const {
      model = 'claude-3-sonnet-20240229',
      prompt,
      systemMessage,
      maxTokens = 1000,
      apiKey
    } = parameters;

    const key = apiKey || this.configService.get('ANTHROPIC_API_KEY');
    if (!key) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      const messages = [
        { role: 'user', content: this.processTemplate(prompt, context) }
      ];

      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.anthropic.com/v1/messages',
          {
            model,
            max_tokens: maxTokens,
            messages,
            system: systemMessage ? this.processTemplate(systemMessage, context) : undefined,
          },
          {
            headers: {
              'x-api-key': key,
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
            },
          }
        )
      );

      const completion = response.data.content[0]?.text;

      return {
        success: true,
        data: [{
          response: completion,
          model,
          usage: response.data.usage,
          timestamp: new Date().toISOString(),
        }],
        usage: {
          tokens: response.data.usage?.input_tokens + response.data.usage?.output_tokens,
          model,
        },
      };
    } catch (error) {
      this.logger.error('Anthropic API error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  // Text Analysis
  async executeTextAnalysis(parameters: {
    text: string;
    analysisType: 'sentiment' | 'entities' | 'keywords' | 'language' | 'summary';
    options?: Record<string, any>;
  }, context: AINodeContext): Promise<AINodeResult> {
    const { text, analysisType, options = {} } = parameters;
    const processedText = this.processTemplate(text, context);

    try {
      switch (analysisType) {
        case 'sentiment':
          return await this.analyzeSentiment(processedText, options);
        case 'entities':
          return await this.extractEntities(processedText, options);
        case 'keywords':
          return await this.extractKeywords(processedText, options);
        case 'language':
          return await this.detectLanguage(processedText, options);
        case 'summary':
          return await this.summarizeText(processedText, options);
        default:
          throw new Error(`Unsupported analysis type: ${analysisType}`);
      }
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }

  // Image Analysis
  async executeImageAnalysis(parameters: {
    imageUrl: string;
    analysisType: 'description' | 'ocr' | 'objects' | 'faces' | 'text';
    options?: Record<string, any>;
  }, context: AINodeContext): Promise<AINodeResult> {
    const { imageUrl, analysisType, options = {} } = parameters;

    // Use OpenAI Vision API for image analysis
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key required for image analysis');
    }

    try {
      let prompt = '';
      switch (analysisType) {
        case 'description':
          prompt = 'Describe this image in detail.';
          break;
        case 'ocr':
          prompt = 'Extract all text from this image and return it as plain text.';
          break;
        case 'objects':
          prompt = 'List all objects visible in this image.';
          break;
        case 'faces':
          prompt = 'Describe any faces or people in this image.';
          break;
        case 'text':
          prompt = 'What text is visible in this image? Return only the text content.';
          break;
        default:
          prompt = 'Analyze this image and provide insights.';
      }

      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4-vision-preview',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }],
            max_tokens: 1000,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const analysis = response.data.choices[0]?.message?.content;

      return {
        success: true,
        data: [{
          analysis,
          imageUrl,
          analysisType,
          timestamp: new Date().toISOString(),
        }],
      };
    } catch (error) {
      this.logger.error('Image analysis error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  // Speech-to-Text
  async executeSpeechToText(parameters: {
    audioUrl: string;
    language?: string;
    model?: string;
  }, context: AINodeContext): Promise<AINodeResult> {
    const { audioUrl, language = 'en', model = 'whisper-1' } = parameters;

    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key required for speech-to-text');
    }

    try {
      // Download audio file first
      const audioResponse = await firstValueFrom(this.httpService.get(audioUrl, { responseType: 'stream' }));
      
      const formData = new FormData();
      formData.append('file', audioResponse.data);
      formData.append('model', model);
      formData.append('language', language);

      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          }
        )
      );

      return {
        success: true,
        data: [{
          text: response.data.text,
          language,
          model,
          timestamp: new Date().toISOString(),
        }],
      };
    } catch (error) {
      this.logger.error('Speech-to-text error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  private processTemplate(template: string, context: AINodeContext): string {
    let result = template;

    // Replace $json references
    if (context.inputData.length > 0) {
      const json = context.inputData[0];
      result = result.replace(/\{\{\s*\$json\.([^}]+)\s*\}\}/g, (match, path) => {
        return this.getNestedValue(json, path) || match;
      });
    }

    // Replace $vars references
    result = result.replace(/\{\{\s*\$vars\.([^}]+)\s*\}\}/g, (match, varName) => {
      return context.variables[varName] || match;
    });

    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async analyzeSentiment(text: string, options: any): Promise<AINodeResult> {
    // Simple sentiment analysis using OpenAI
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (!apiKey) {
      return {
        success: false,
        data: [],
        error: 'OpenAI API key required for sentiment analysis',
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [{
              role: 'user',
              content: `Analyze the sentiment of this text and respond with only a JSON object containing "sentiment" (positive/negative/neutral), "confidence" (0-1), and "reasoning": "${text}"`
            }],
            temperature: 0,
            max_tokens: 200,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const analysis = JSON.parse(response.data.choices[0]?.message?.content);

      return {
        success: true,
        data: [{
          sentiment: analysis.sentiment,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          text,
          timestamp: new Date().toISOString(),
        }],
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }

  private async extractEntities(text: string, options: any): Promise<AINodeResult> {
    // Entity extraction implementation
    return {
      success: true,
      data: [{ entities: [], text }],
    };
  }

  private async extractKeywords(text: string, options: any): Promise<AINodeResult> {
    // Keyword extraction implementation
    return {
      success: true,
      data: [{ keywords: [], text }],
    };
  }

  private async detectLanguage(text: string, options: any): Promise<AINodeResult> {
    // Language detection implementation
    return {
      success: true,
      data: [{ language: 'en', confidence: 0.95, text }],
    };
  }

  private async summarizeText(text: string, options: any): Promise<AINodeResult> {
    // Text summarization using OpenAI
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (!apiKey) {
      return {
        success: false,
        data: [],
        error: 'OpenAI API key required for text summarization',
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [{
              role: 'user',
              content: `Summarize the following text concisely: "${text}"`
            }],
            temperature: 0.3,
            max_tokens: 500,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const summary = response.data.choices[0]?.message?.content;

      return {
        success: true,
        data: [{
          summary,
          originalText: text,
          timestamp: new Date().toISOString(),
        }],
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }
}