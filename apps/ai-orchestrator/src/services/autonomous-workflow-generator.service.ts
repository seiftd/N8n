import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { LLMChain } from 'langchain/chains';
import { OpenAI as LangChainOpenAI } from '@langchain/openai';
import { PromptTemplate } from 'langchain/prompts';
import * as natural from 'natural';
import * as compromise from 'compromise';

import { Workflow, WorkflowNode, WorkflowConnection } from '../../../api/src/entities';

export interface WorkflowGenerationRequest {
  userId: string;
  description: string;
  context?: {
    industry?: string;
    useCase?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    requirements?: string[];
    constraints?: string[];
  };
  preferences?: {
    preferredNodes?: string[];
    avoidNodes?: string[];
    maxNodes?: number;
    executionTime?: 'fast' | 'thorough';
  };
}

export interface GeneratedWorkflow {
  workflow: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    estimatedExecutionTime: number;
    complexity: number;
  };
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    description: string;
    position: { x: number; y: number };
    parameters: Record<string, any>;
    reasoning: string;
  }>;
  connections: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    conditions?: string;
  }>;
  metadata: {
    confidence: number;
    alternativeApproaches: string[];
    optimizationSuggestions: string[];
    implementationNotes: string[];
  };
}

@Injectable()
export class AutonomousWorkflowGenerator {
  private readonly logger = new Logger(AutonomousWorkflowGenerator.name);
  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;
  private readonly llmChain: LLMChain;

  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    
    @InjectRepository(WorkflowNode)
    private nodeRepository: Repository<WorkflowNode>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.initializeLLMChain();
  }

  /**
   * Generate a complete workflow from natural language description
   */
  async generateWorkflow(request: WorkflowGenerationRequest): Promise<GeneratedWorkflow> {
    this.logger.log(`Generating workflow for user ${request.userId}: "${request.description}"`);

    try {
      // Analyze intent and extract requirements
      const analysis = await this.analyzeIntent(request.description, request.context);
      
      // Generate workflow structure using advanced LLM reasoning
      const workflowStructure = await this.generateWorkflowStructure(analysis, request.preferences);
      
      // Optimize and validate the generated workflow
      const optimizedWorkflow = await this.optimizeWorkflow(workflowStructure);
      
      // Add intelligent positioning and connections
      const finalWorkflow = await this.enhanceWorkflowLayout(optimizedWorkflow);

      this.logger.log(`Generated workflow with ${finalWorkflow.nodes.length} nodes and confidence ${finalWorkflow.metadata.confidence}`);
      
      return finalWorkflow;
    } catch (error) {
      this.logger.error('Failed to generate workflow:', error);
      throw new Error(`Workflow generation failed: ${error.message}`);
    }
  }

  /**
   * Analyze user intent using advanced NLP and LLM reasoning
   */
  private async analyzeIntent(description: string, context?: any): Promise<{
    intent: string;
    entities: any[];
    requirements: string[];
    dataFlow: string[];
    businessLogic: string[];
    integrations: string[];
    confidence: number;
  }> {
    // Use multiple AI models for comprehensive analysis
    const [openaiAnalysis, anthropicAnalysis, nlpAnalysis] = await Promise.all([
      this.analyzeWithOpenAI(description, context),
      this.analyzeWithAnthropic(description, context),
      this.analyzeWithNLP(description),
    ]);

    // Combine and synthesize results
    return this.synthesizeAnalysis(openaiAnalysis, anthropicAnalysis, nlpAnalysis);
  }

  private async analyzeWithOpenAI(description: string, context?: any): Promise<any> {
    const prompt = this.createAnalysisPrompt(description, context);
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert workflow automation analyst. Analyze user requirements and extract:
          1. Primary intent and objectives
          2. Data sources and targets
          3. Processing steps required
          4. Business logic and conditions
          5. Integration requirements
          6. Success criteria
          
          Return a structured JSON analysis.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0]?.message?.content || '{}');
  }

  private async analyzeWithAnthropic(description: string, context?: any): Promise<any> {
    const prompt = this.createAnalysisPrompt(description, context);
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `As a workflow automation expert, analyze this requirement and provide a detailed breakdown:

${prompt}

Focus on:
- Workflow patterns and best practices
- Error handling and edge cases
- Performance considerations
- Security implications
- Scalability requirements

Provide response in JSON format.`
        }
      ]
    });

    return JSON.parse(response.content[0]?.text || '{}');
  }

  private analyzeWithNLP(description: string): any {
    // Use natural language processing for entity extraction
    const doc = compromise(description);
    
    // Extract entities
    const people = doc.people().out('array');
    const places = doc.places().out('array');
    const organizations = doc.organizations().out('array');
    const verbs = doc.verbs().out('array');
    const nouns = doc.nouns().out('array');

    // Tokenize and analyze sentiment
    const tokens = natural.WordTokenizer.tokenize(description);
    const sentiment = natural.SentimentAnalyzer.getSentiment(
      tokens.map(token => natural.PorterStemmer.stem(token)),
      natural.SentimentAnalyzer,
      'English'
    );

    // Extract key phrases
    const sentences = natural.SentenceTokenizer.tokenize(description);
    const keyPhrases = this.extractKeyPhrases(sentences);

    return {
      entities: { people, places, organizations },
      actions: verbs,
      subjects: nouns,
      sentiment,
      keyPhrases,
      complexity: this.calculateComplexity(description),
    };
  }

  /**
   * Generate workflow structure using advanced AI reasoning
   */
  private async generateWorkflowStructure(analysis: any, preferences?: any): Promise<any> {
    const structurePrompt = `
Based on this analysis:
${JSON.stringify(analysis, null, 2)}

And these preferences:
${JSON.stringify(preferences, null, 2)}

Generate a complete workflow structure with:
1. Workflow metadata (name, description, category, tags)
2. Required nodes with specific types and configurations
3. Data flow between nodes
4. Error handling and conditional logic
5. Performance optimizations

Available node types: ${this.getAvailableNodeTypes().join(', ')}

Return a detailed JSON workflow structure.
`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert workflow architect. Design optimal workflows that are:
          - Efficient and performant
          - Resilient with proper error handling
          - Scalable and maintainable
          - Following best practices
          
          Consider real-world constraints and provide practical solutions.`
        },
        {
          role: 'user',
          content: structurePrompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0]?.message?.content || '{}');
  }

  /**
   * Optimize generated workflow using AI-driven analysis
   */
  private async optimizeWorkflow(workflow: any): Promise<any> {
    // Analyze workflow for optimization opportunities
    const optimizations = await this.analyzeOptimizationOpportunities(workflow);
    
    // Apply optimizations
    const optimizedWorkflow = await this.applyOptimizations(workflow, optimizations);
    
    // Validate and score the optimized workflow
    const validation = await this.validateWorkflow(optimizedWorkflow);
    
    return {
      ...optimizedWorkflow,
      metadata: {
        ...optimizedWorkflow.metadata,
        confidence: validation.confidence,
        optimizations: optimizations,
        validationResults: validation,
      }
    };
  }

  private async analyzeOptimizationOpportunities(workflow: any): Promise<string[]> {
    const optimizationPrompt = `
Analyze this workflow for optimization opportunities:
${JSON.stringify(workflow, null, 2)}

Identify:
1. Redundant or unnecessary nodes
2. Opportunities for parallelization
3. Caching opportunities
4. Error handling improvements
5. Performance bottlenecks
6. Security considerations

Return specific optimization suggestions.
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: optimizationPrompt
        }
      ]
    });

    const analysis = response.content[0]?.text || '';
    return this.parseOptimizationSuggestions(analysis);
  }

  private async applyOptimizations(workflow: any, optimizations: string[]): Promise<any> {
    // Apply each optimization using AI reasoning
    let optimizedWorkflow = { ...workflow };

    for (const optimization of optimizations) {
      optimizedWorkflow = await this.applySpecificOptimization(optimizedWorkflow, optimization);
    }

    return optimizedWorkflow;
  }

  private async applySpecificOptimization(workflow: any, optimization: string): Promise<any> {
    const optimizationPrompt = `
Apply this optimization to the workflow:
Optimization: ${optimization}

Current workflow:
${JSON.stringify(workflow, null, 2)}

Return the optimized workflow structure.
`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a workflow optimization expert. Apply the requested optimization while maintaining workflow functionality and integrity.'
        },
        {
          role: 'user',
          content: optimizationPrompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0]?.message?.content || JSON.stringify(workflow));
  }

  /**
   * Enhance workflow with intelligent layout and positioning
   */
  private async enhanceWorkflowLayout(workflow: any): Promise<GeneratedWorkflow> {
    // Calculate optimal node positions using graph algorithms
    const positions = this.calculateOptimalPositions(workflow.nodes, workflow.connections);
    
    // Apply positions to nodes
    workflow.nodes.forEach((node: any, index: number) => {
      node.position = positions[index];
    });

    // Add intelligent connection routing
    workflow.connections = this.optimizeConnections(workflow.nodes, workflow.connections);

    // Add metadata and confidence scoring
    const confidence = this.calculateWorkflowConfidence(workflow);
    const alternatives = await this.generateAlternativeApproaches(workflow);

    return {
      workflow: {
        name: workflow.name || 'Generated Workflow',
        description: workflow.description || 'AI-generated workflow',
        category: workflow.category || 'automation',
        tags: workflow.tags || [],
        estimatedExecutionTime: this.estimateExecutionTime(workflow.nodes),
        complexity: this.calculateWorkflowComplexity(workflow.nodes),
      },
      nodes: workflow.nodes,
      connections: workflow.connections,
      metadata: {
        confidence,
        alternativeApproaches: alternatives,
        optimizationSuggestions: workflow.metadata?.optimizations || [],
        implementationNotes: this.generateImplementationNotes(workflow),
      }
    };
  }

  /**
   * Iteratively improve workflow based on feedback and execution results
   */
  async improveWorkflow(
    workflowId: string,
    executionResults: any[],
    userFeedback?: string
  ): Promise<GeneratedWorkflow> {
    // Analyze execution performance
    const performanceAnalysis = this.analyzeExecutionPerformance(executionResults);
    
    // Analyze user feedback if provided
    const feedbackAnalysis = userFeedback ? await this.analyzeFeedback(userFeedback) : null;
    
    // Generate improvement suggestions
    const improvements = await this.generateImprovements(performanceAnalysis, feedbackAnalysis);
    
    // Apply improvements and regenerate workflow
    const currentWorkflow = await this.workflowRepository.findOne({
      where: { id: workflowId },
      relations: ['nodes', 'connections']
    });

    if (!currentWorkflow) {
      throw new Error('Workflow not found');
    }

    return this.applyImprovements(currentWorkflow, improvements);
  }

  // Helper methods
  private initializeLLMChain(): void {
    const llm = new LangChainOpenAI({
      temperature: 0.7,
      modelName: 'gpt-4-turbo-preview',
    });

    const prompt = PromptTemplate.fromTemplate(`
You are an expert workflow automation system. Given the following user request, generate a comprehensive workflow:

User Request: {userRequest}
Context: {context}

Generate a workflow that:
1. Fulfills the user's requirements
2. Follows best practices
3. Includes proper error handling
4. Is optimized for performance

Workflow Structure:
{format_instructions}
`);

    this.llmChain = new LLMChain({ llm, prompt });
  }

  private createAnalysisPrompt(description: string, context?: any): string {
    return `
User Request: "${description}"

${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}

Please analyze this request and extract:
1. Primary objectives and goals
2. Data sources and destinations
3. Processing requirements
4. Business rules and conditions
5. Integration needs
6. Performance requirements
7. Security considerations
8. Error handling needs
`;
  }

  private synthesizeAnalysis(openaiAnalysis: any, anthropicAnalysis: any, nlpAnalysis: any): any {
    // Combine insights from multiple AI models and NLP
    return {
      intent: openaiAnalysis.intent || anthropicAnalysis.intent || 'automation',
      entities: [
        ...(openaiAnalysis.entities || []),
        ...(anthropicAnalysis.entities || []),
        ...(nlpAnalysis.entities?.people || []),
        ...(nlpAnalysis.entities?.organizations || []),
      ],
      requirements: [
        ...(openaiAnalysis.requirements || []),
        ...(anthropicAnalysis.requirements || []),
      ],
      dataFlow: openaiAnalysis.dataFlow || anthropicAnalysis.dataFlow || [],
      businessLogic: openaiAnalysis.businessLogic || anthropicAnalysis.businessLogic || [],
      integrations: openaiAnalysis.integrations || anthropicAnalysis.integrations || [],
      confidence: Math.min(
        openaiAnalysis.confidence || 0.8,
        anthropicAnalysis.confidence || 0.8,
        nlpAnalysis.complexity < 0.7 ? 0.9 : 0.7
      ),
    };
  }

  private getAvailableNodeTypes(): string[] {
    return [
      // Triggers
      'manual-trigger', 'webhook-trigger', 'schedule-trigger', 'email-trigger',
      // Actions
      'http-request', 'email-send', 'file-read', 'file-write', 'database-query',
      // Logic
      'if-condition', 'switch', 'merge', 'split', 'loop', 'delay',
      // Transformations
      'json-transform', 'csv-transform', 'xml-transform', 'filter', 'sort',
      // AI/ML
      'openai-chat', 'anthropic-chat', 'text-analysis', 'image-analysis',
      // Integrations
      'slack-message', 'teams-message', 'discord-message', 'twitter-post',
      // Storage
      'save-file', 'load-file', 'database-insert', 'database-update',
      // Utilities
      'code-execution', 'variable-set', 'variable-get', 'format-date',
    ];
  }

  private extractKeyPhrases(sentences: string[]): string[] {
    // Simple key phrase extraction using TF-IDF concepts
    const words = sentences.join(' ').toLowerCase().split(/\s+/);
    const wordFreq = words.reduce((freq, word) => {
      freq[word] = (freq[word] || 0) + 1;
      return freq;
    }, {} as Record<string, number>);

    return Object.entries(wordFreq)
      .filter(([word, freq]) => freq > 1 && word.length > 3)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private calculateComplexity(description: string): number {
    const factors = [
      description.length / 1000, // Length factor
      (description.match(/\band\b|\bor\b|\bif\b|\bthen\b|\bwhen\b/gi) || []).length * 0.1, // Logic complexity
      (description.match(/\bapi\b|\bintegration\b|\bconnect\b/gi) || []).length * 0.2, // Integration complexity
      (description.match(/\breal.?time\b|\binstant\b|\bimmediate/gi) || []).length * 0.3, // Time complexity
    ];

    return Math.min(factors.reduce((sum, factor) => sum + factor, 0), 1);
  }

  private parseOptimizationSuggestions(analysis: string): string[] {
    // Parse optimization suggestions from AI response
    const lines = analysis.split('\n').filter(line => line.trim());
    return lines
      .filter(line => line.includes('optimize') || line.includes('improve') || line.includes('enhance'))
      .slice(0, 5);
  }

  private calculateOptimalPositions(nodes: any[], connections: any[]): Array<{ x: number; y: number }> {
    // Implement force-directed graph layout algorithm
    const positions = nodes.map((_, i) => ({
      x: (i % 4) * 250 + 100,
      y: Math.floor(i / 4) * 150 + 100,
    }));

    // Apply graph layout algorithm for better positioning
    return this.forceDirectedLayout(nodes, connections, positions);
  }

  private forceDirectedLayout(
    nodes: any[],
    connections: any[],
    initialPositions: Array<{ x: number; y: number }>
  ): Array<{ x: number; y: number }> {
    // Simplified force-directed layout
    const positions = [...initialPositions];
    const iterations = 50;
    const k = 100; // Spring constant

    for (let iter = 0; iter < iterations; iter++) {
      const forces = positions.map(() => ({ x: 0, y: 0 }));

      // Repulsive forces between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = k * k / distance;

          forces[i].x += (dx / distance) * force;
          forces[i].y += (dy / distance) * force;
          forces[j].x -= (dx / distance) * force;
          forces[j].y -= (dy / distance) * force;
        }
      }

      // Attractive forces for connected nodes
      connections.forEach(conn => {
        const sourceIndex = nodes.findIndex(n => n.id === conn.source);
        const targetIndex = nodes.findIndex(n => n.id === conn.target);

        if (sourceIndex >= 0 && targetIndex >= 0) {
          const dx = positions[targetIndex].x - positions[sourceIndex].x;
          const dy = positions[targetIndex].y - positions[sourceIndex].y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = distance / k;

          forces[sourceIndex].x += (dx / distance) * force;
          forces[sourceIndex].y += (dy / distance) * force;
          forces[targetIndex].x -= (dx / distance) * force;
          forces[targetIndex].y -= (dy / distance) * force;
        }
      });

      // Apply forces
      positions.forEach((pos, i) => {
        pos.x += forces[i].x * 0.1;
        pos.y += forces[i].y * 0.1;
      });
    }

    return positions;
  }

  private optimizeConnections(nodes: any[], connections: any[]): any[] {
    // Add intelligent connection routing and conditions
    return connections.map(conn => ({
      ...conn,
      style: this.getConnectionStyle(conn),
      conditions: this.generateConnectionConditions(conn, nodes),
    }));
  }

  private getConnectionStyle(connection: any): any {
    return {
      strokeWidth: 2,
      stroke: '#666',
      strokeDasharray: connection.conditional ? '5,5' : undefined,
    };
  }

  private generateConnectionConditions(connection: any, nodes: any[]): string | undefined {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);

    if (sourceNode?.type === 'if-condition' || targetNode?.type === 'if-condition') {
      return 'condition === true';
    }

    return undefined;
  }

  private calculateWorkflowConfidence(workflow: any): number {
    const factors = [
      workflow.nodes.length > 0 ? 0.3 : 0,
      workflow.connections.length > 0 ? 0.2 : 0,
      workflow.nodes.every((n: any) => n.type && n.name) ? 0.3 : 0,
      workflow.connections.every((c: any) => c.source && c.target) ? 0.2 : 0,
    ];

    return factors.reduce((sum, factor) => sum + factor, 0);
  }

  private async generateAlternativeApproaches(workflow: any): Promise<string[]> {
    const prompt = `
Given this workflow:
${JSON.stringify(workflow, null, 2)}

Suggest 3 alternative approaches that could achieve the same goals with different strategies.
`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
    });

    const alternatives = response.choices[0]?.message?.content || '';
    return alternatives.split('\n').filter(line => line.trim()).slice(0, 3);
  }

  private estimateExecutionTime(nodes: any[]): number {
    // Estimate execution time based on node types
    const timeEstimates: Record<string, number> = {
      'http-request': 2000,
      'database-query': 500,
      'email-send': 1000,
      'file-read': 300,
      'file-write': 400,
      'openai-chat': 3000,
      'code-execution': 1000,
      'if-condition': 50,
      'delay': 5000,
    };

    return nodes.reduce((total, node) => {
      return total + (timeEstimates[node.type] || 100);
    }, 0);
  }

  private calculateWorkflowComplexity(nodes: any[]): number {
    const complexityScores: Record<string, number> = {
      'manual-trigger': 1,
      'http-request': 3,
      'database-query': 4,
      'openai-chat': 5,
      'code-execution': 4,
      'if-condition': 2,
      'loop': 3,
    };

    const totalComplexity = nodes.reduce((total, node) => {
      return total + (complexityScores[node.type] || 2);
    }, 0);

    return Math.min(totalComplexity / nodes.length, 5);
  }

  private generateImplementationNotes(workflow: any): string[] {
    const notes = [];

    // Add notes based on workflow characteristics
    if (workflow.nodes.some((n: any) => n.type.includes('database'))) {
      notes.push('Ensure database credentials are properly configured');
    }

    if (workflow.nodes.some((n: any) => n.type.includes('ai') || n.type.includes('openai'))) {
      notes.push('AI API keys required for AI-powered nodes');
    }

    if (workflow.nodes.some((n: any) => n.type === 'email-send')) {
      notes.push('Email server configuration needed for email notifications');
    }

    notes.push('Test workflow in development environment before production deployment');
    notes.push('Monitor execution performance and optimize as needed');

    return notes;
  }

  private analyzeExecutionPerformance(executionResults: any[]): any {
    // Analyze execution results for performance insights
    const avgExecutionTime = executionResults.reduce((sum, result) => sum + result.duration, 0) / executionResults.length;
    const successRate = executionResults.filter(result => result.success).length / executionResults.length;
    const commonErrors = this.getCommonErrors(executionResults);

    return {
      avgExecutionTime,
      successRate,
      commonErrors,
      bottlenecks: this.identifyBottlenecks(executionResults),
    };
  }

  private async analyzeFeedback(feedback: string): Promise<any> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Analyze user feedback about a workflow and extract improvement suggestions.'
        },
        {
          role: 'user',
          content: `User feedback: "${feedback}"\n\nExtract key improvement areas and suggestions.`
        }
      ],
      temperature: 0.3,
    });

    return {
      sentiment: this.analyzeSentiment(feedback),
      suggestions: response.choices[0]?.message?.content?.split('\n').filter(line => line.trim()) || [],
    };
  }

  private async generateImprovements(performanceAnalysis: any, feedbackAnalysis: any): Promise<string[]> {
    const improvements = [];

    if (performanceAnalysis.avgExecutionTime > 10000) {
      improvements.push('Optimize slow-running nodes');
    }

    if (performanceAnalysis.successRate < 0.95) {
      improvements.push('Improve error handling and retry logic');
    }

    if (feedbackAnalysis?.suggestions) {
      improvements.push(...feedbackAnalysis.suggestions.slice(0, 3));
    }

    return improvements;
  }

  private async applyImprovements(workflow: any, improvements: string[]): Promise<GeneratedWorkflow> {
    // Apply improvements and regenerate workflow
    for (const improvement of improvements) {
      workflow = await this.applySpecificOptimization(workflow, improvement);
    }

    return this.enhanceWorkflowLayout(workflow);
  }

  private getCommonErrors(executionResults: any[]): string[] {
    const errors = executionResults
      .filter(result => !result.success)
      .map(result => result.error)
      .filter(Boolean);

    const errorCounts = errors.reduce((counts, error) => {
      counts[error] = (counts[error] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([error]) => error);
  }

  private identifyBottlenecks(executionResults: any[]): string[] {
    // Identify nodes that consistently take longest to execute
    const nodeTimes: Record<string, number[]> = {};

    executionResults.forEach(result => {
      if (result.nodeExecutions) {
        result.nodeExecutions.forEach((nodeExec: any) => {
          if (!nodeTimes[nodeExec.nodeId]) {
            nodeTimes[nodeExec.nodeId] = [];
          }
          nodeTimes[nodeExec.nodeId].push(nodeExec.duration);
        });
      }
    });

    return Object.entries(nodeTimes)
      .map(([nodeId, times]) => ({
        nodeId,
        avgTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 3)
      .map(item => item.nodeId);
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['good', 'great', 'excellent', 'love', 'perfect', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'broken', 'slow'];

    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private async validateWorkflow(workflow: any): Promise<{ confidence: number; issues: string[] }> {
    const issues = [];
    let confidence = 1.0;

    // Check for isolated nodes
    const connectedNodes = new Set([
      ...workflow.connections.map((c: any) => c.source),
      ...workflow.connections.map((c: any) => c.target),
    ]);

    const isolatedNodes = workflow.nodes.filter((n: any) => !connectedNodes.has(n.id));
    if (isolatedNodes.length > 0) {
      issues.push(`${isolatedNodes.length} isolated nodes found`);
      confidence -= 0.2;
    }

    // Check for missing required parameters
    const nodesWithMissingParams = workflow.nodes.filter((n: any) => 
      !n.parameters || Object.keys(n.parameters).length === 0
    );
    if (nodesWithMissingParams.length > 0) {
      issues.push('Some nodes have missing parameters');
      confidence -= 0.1;
    }

    return { confidence: Math.max(confidence, 0), issues };
  }
}