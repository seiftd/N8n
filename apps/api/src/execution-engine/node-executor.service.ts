import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as vm from 'vm';

import { WorkflowNode } from '../entities';
import { ExecutionContext, NodeExecutionResult } from './execution-engine.service';

@Injectable()
export class NodeExecutorService {
  private readonly logger = new Logger(NodeExecutorService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async executeNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Executing node: ${node.id} (${node.type})`);

      // Check if node is disabled
      if (node.data.disabled) {
        return {
          success: true,
          data: inputData,
          duration: Date.now() - startTime,
          metadata: { skipped: true, reason: 'Node is disabled' },
        };
      }

      let result: NodeExecutionResult;

      switch (node.type) {
        case 'manual-trigger':
        case 'webhook-trigger':
        case 'schedule-trigger':
          result = await this.executeTriggerNode(node, inputData, context);
          break;

        case 'http-request':
          result = await this.executeHttpRequestNode(node, inputData, context);
          break;

        case 'code-execution':
          result = await this.executeCodeNode(node, inputData, context);
          break;

        case 'if-condition':
          result = await this.executeIfConditionNode(node, inputData, context);
          break;

        case 'merge':
          result = await this.executeMergeNode(node, inputData, context);
          break;

        case 'set-variable':
          result = await this.executeSetVariableNode(node, inputData, context);
          break;

        case 'openai-chat':
          result = await this.executeOpenAIChatNode(node, inputData, context);
          break;

        default:
          throw new Error(`Unsupported node type: ${node.type}`);
      }

      result.duration = Date.now() - startTime;
      this.logger.debug(`Node execution completed: ${node.id} in ${result.duration}ms`);

      return result;

    } catch (error) {
      this.logger.error(`Node execution failed: ${node.id}`, error.stack);
      
      return {
        success: false,
        data: [],
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeTriggerNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // Trigger nodes pass through the initial data
    const data = context.triggerData ? [context.triggerData] : inputData;
    
    return {
      success: true,
      data,
      duration: 0,
      metadata: { nodeType: 'trigger' },
    };
  }

  private async executeHttpRequestNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { method = 'GET', url, headers = {}, body, timeout = 30000 } = node.data.parameters || {};

    if (!url) {
      throw new Error('HTTP Request node requires a URL parameter');
    }

    try {
      const requestConfig = {
        method: method.toLowerCase(),
        url: this.replaceVariables(url, inputData, context),
        headers: this.replaceVariables(headers, inputData, context),
        timeout,
      };

      if (body && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
        requestConfig['data'] = this.replaceVariables(body, inputData, context);
      }

      const response = await firstValueFrom(
        this.httpService.request(requestConfig)
      );

      return {
        success: true,
        data: [{
          statusCode: response.status,
          headers: response.headers,
          body: response.data,
        }],
        duration: 0, // Will be set by caller
      };

    } catch (error) {
      if (error.response) {
        // HTTP error response
        return {
          success: !node.data.continueOnFail,
          data: [{
            statusCode: error.response.status,
            headers: error.response.headers,
            body: error.response.data,
            error: `HTTP ${error.response.status}: ${error.response.statusText}`,
          }],
          error: node.data.continueOnFail ? undefined : error.message,
          duration: 0,
        };
      }
      
      throw error;
    }
  }

  private async executeCodeNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { code, language = 'javascript' } = node.data.parameters || {};

    if (!code) {
      throw new Error('Code node requires code parameter');
    }

    if (language !== 'javascript') {
      throw new Error(`Unsupported code language: ${language}`);
    }

    try {
      // Create sandbox environment
      const sandbox = {
        $input: inputData,
        $json: inputData[0] || {},
        $context: context,
        $vars: context.variables,
        console: {
          log: (...args) => this.logger.debug('Code node log:', ...args),
          error: (...args) => this.logger.error('Code node error:', ...args),
        },
        setTimeout,
        clearTimeout,
        Date,
        Math,
        JSON,
        // Safe utility functions
        fetch: undefined, // Disable fetch for security
        require: undefined, // Disable require for security
      };

      const vmContext = vm.createContext(sandbox);
      const result = vm.runInContext(code, vmContext, {
        timeout: 30000, // 30 second timeout
        displayErrors: true,
      });

      return {
        success: true,
        data: Array.isArray(result) ? result : [result],
        duration: 0,
      };

    } catch (error) {
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  private async executeIfConditionNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { condition } = node.data.parameters || {};

    if (!condition) {
      throw new Error('If condition node requires a condition parameter');
    }

    try {
      // Evaluate condition
      const isTrue = this.evaluateCondition(condition, inputData, context);
      
      return {
        success: true,
        data: inputData,
        duration: 0,
        metadata: { 
          conditionResult: isTrue,
          outputPath: isTrue ? 'true' : 'false',
        },
      };

    } catch (error) {
      throw new Error(`Condition evaluation failed: ${error.message}`);
    }
  }

  private async executeMergeNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { mode = 'append' } = node.data.parameters || {};

    let mergedData: any[];

    switch (mode) {
      case 'append':
        mergedData = inputData.flat();
        break;
      
      case 'merge':
        // Merge objects
        if (inputData.every(item => typeof item === 'object' && !Array.isArray(item))) {
          mergedData = [Object.assign({}, ...inputData)];
        } else {
          mergedData = inputData.flat();
        }
        break;
      
      default:
        mergedData = inputData;
    }

    return {
      success: true,
      data: mergedData,
      duration: 0,
    };
  }

  private async executeSetVariableNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { variableName, value } = node.data.parameters || {};

    if (!variableName) {
      throw new Error('Set variable node requires variableName parameter');
    }

    const processedValue = this.replaceVariables(value, inputData, context);
    context.variables[variableName] = processedValue;

    return {
      success: true,
      data: inputData,
      duration: 0,
      metadata: { 
        variableSet: variableName,
        value: processedValue,
      },
    };
  }

  private async executeOpenAIChatNode(
    node: WorkflowNode,
    inputData: any[],
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { 
      model = 'gpt-3.5-turbo',
      prompt,
      systemMessage,
      temperature = 0.7,
      maxTokens = 1000,
    } = node.data.parameters || {};

    if (!prompt) {
      throw new Error('OpenAI Chat node requires a prompt parameter');
    }

    // TODO: Get API key from credentials
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const messages = [];
      
      if (systemMessage) {
        messages.push({
          role: 'system',
          content: this.replaceVariables(systemMessage, inputData, context),
        });
      }

      messages.push({
        role: 'user',
        content: this.replaceVariables(prompt, inputData, context),
      });

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
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const completion = response.data.choices[0]?.message?.content;

      return {
        success: true,
        data: [{
          response: completion,
          usage: response.data.usage,
          model,
        }],
        duration: 0,
      };

    } catch (error) {
      throw new Error(`OpenAI API request failed: ${error.message}`);
    }
  }

  private replaceVariables(
    template: any,
    inputData: any[],
    context: ExecutionContext,
  ): any {
    if (typeof template !== 'string') {
      return template;
    }

    let result = template;

    // Replace $json references
    if (inputData.length > 0) {
      const json = inputData[0];
      result = result.replace(/\{\{\s*\$json\.([^}]+)\s*\}\}/g, (match, path) => {
        return this.getNestedValue(json, path) || match;
      });
    }

    // Replace $vars references
    result = result.replace(/\{\{\s*\$vars\.([^}]+)\s*\}\}/g, (match, varName) => {
      return context.variables[varName] || match;
    });

    // Replace $input references
    result = result.replace(/\{\{\s*\$input\[(\d+)\]\.([^}]+)\s*\}\}/g, (match, index, path) => {
      const item = inputData[parseInt(index)];
      return item ? this.getNestedValue(item, path) || match : match;
    });

    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private evaluateCondition(
    condition: string,
    inputData: any[],
    context: ExecutionContext,
  ): boolean {
    try {
      // Replace variables in condition
      const processedCondition = this.replaceVariables(condition, inputData, context);
      
      // Create safe evaluation context
      const sandbox = {
        $input: inputData,
        $json: inputData[0] || {},
        $vars: context.variables,
      };

      const vmContext = vm.createContext(sandbox);
      return Boolean(vm.runInContext(processedCondition, vmContext, {
        timeout: 5000,
        displayErrors: true,
      }));

    } catch (error) {
      this.logger.error('Condition evaluation error:', error.message);
      return false;
    }
  }
}