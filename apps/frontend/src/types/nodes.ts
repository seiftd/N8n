export enum NodeCategory {
  TRIGGER = 'trigger',
  ACTION = 'action',
  LOGIC = 'logic',
  DATA = 'data',
  AI = 'ai',
  INTEGRATION = 'integration',
  UTILITY = 'utility'
}

export interface NodeDefinition {
  type: string
  category: NodeCategory
  name: string
  description: string
  icon: string
  color: string
  inputs: NodePort[]
  outputs: NodePort[]
  parameters: NodeParameter[]
  credentials?: string[]
  examples?: NodeExample[]
}

export interface NodePort {
  name: string
  type: 'main' | 'data' | 'error'
  required: boolean
  description?: string
}

export interface NodeParameter {
  name: string
  displayName: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'code' | 'expression'
  required: boolean
  default?: any
  description?: string
  options?: ParameterOption[]
  placeholder?: string
  validation?: ParameterValidation
}

export interface ParameterOption {
  name: string
  value: any
  description?: string
}

export interface ParameterValidation {
  min?: number
  max?: number
  pattern?: string
  custom?: string
}

export interface NodeExample {
  name: string
  description: string
  parameters: Record<string, any>
}

// Node type definitions
export const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
  // Trigger Nodes
  'manual-trigger': {
    type: 'manual-trigger',
    category: NodeCategory.TRIGGER,
    name: 'Manual Trigger',
    description: 'Trigger workflow manually',
    icon: 'play',
    color: '#10B981',
    inputs: [],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    parameters: [
      {
        name: 'description',
        displayName: 'Description',
        type: 'string',
        required: false,
        placeholder: 'Describe when this workflow should be triggered manually'
      }
    ]
  },

  'webhook-trigger': {
    type: 'webhook-trigger',
    category: NodeCategory.TRIGGER,
    name: 'Webhook Trigger',
    description: 'Trigger workflow via HTTP webhook',
    icon: 'webhook',
    color: '#6366F1',
    inputs: [],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    parameters: [
      {
        name: 'method',
        displayName: 'HTTP Method',
        type: 'select',
        required: true,
        default: 'POST',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' }
        ]
      },
      {
        name: 'path',
        displayName: 'Webhook Path',
        type: 'string',
        required: false,
        placeholder: 'Optional custom path',
        description: 'Custom path for the webhook URL'
      },
      {
        name: 'authentication',
        displayName: 'Authentication',
        type: 'select',
        required: false,
        default: 'none',
        options: [
          { name: 'None', value: 'none' },
          { name: 'Header Auth', value: 'header' },
          { name: 'Query Auth', value: 'query' }
        ]
      }
    ]
  },

  'schedule-trigger': {
    type: 'schedule-trigger',
    category: NodeCategory.TRIGGER,
    name: 'Schedule Trigger',
    description: 'Trigger workflow on schedule',
    icon: 'clock',
    color: '#F59E0B',
    inputs: [],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    parameters: [
      {
        name: 'schedule',
        displayName: 'Schedule',
        type: 'select',
        required: true,
        default: 'interval',
        options: [
          { name: 'Interval', value: 'interval' },
          { name: 'Cron Expression', value: 'cron' }
        ]
      },
      {
        name: 'interval',
        displayName: 'Interval (minutes)',
        type: 'number',
        required: false,
        default: 5,
        validation: { min: 1, max: 10080 }
      },
      {
        name: 'cron',
        displayName: 'Cron Expression',
        type: 'string',
        required: false,
        placeholder: '0 */5 * * * *',
        description: 'Cron expression for advanced scheduling'
      }
    ]
  },

  // Action Nodes
  'http-request': {
    type: 'http-request',
    category: NodeCategory.ACTION,
    name: 'HTTP Request',
    description: 'Make HTTP requests to external APIs',
    icon: 'globe',
    color: '#3B82F6',
    inputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    parameters: [
      {
        name: 'method',
        displayName: 'HTTP Method',
        type: 'select',
        required: true,
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' }
        ]
      },
      {
        name: 'url',
        displayName: 'URL',
        type: 'string',
        required: true,
        placeholder: 'https://api.example.com/endpoint'
      },
      {
        name: 'headers',
        displayName: 'Headers',
        type: 'json',
        required: false,
        default: {},
        description: 'HTTP headers as JSON object'
      },
      {
        name: 'body',
        displayName: 'Request Body',
        type: 'json',
        required: false,
        description: 'Request body for POST/PUT/PATCH requests'
      },
      {
        name: 'timeout',
        displayName: 'Timeout (seconds)',
        type: 'number',
        required: false,
        default: 30,
        validation: { min: 1, max: 300 }
      }
    ],
    credentials: ['httpBasicAuth', 'httpHeaderAuth', 'oauth2']
  },

  'code-execution': {
    type: 'code-execution',
    category: NodeCategory.ACTION,
    name: 'Code Execution',
    description: 'Execute custom JavaScript code',
    icon: 'code',
    color: '#8B5CF6',
    inputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    parameters: [
      {
        name: 'language',
        displayName: 'Language',
        type: 'select',
        required: true,
        default: 'javascript',
        options: [
          { name: 'JavaScript', value: 'javascript' },
          { name: 'Python', value: 'python' }
        ]
      },
      {
        name: 'code',
        displayName: 'Code',
        type: 'code',
        required: true,
        placeholder: '// Write your code here\nreturn { message: "Hello World" };'
      },
      {
        name: 'libraries',
        displayName: 'Libraries',
        type: 'multiselect',
        required: false,
        options: [
          { name: 'Lodash', value: 'lodash' },
          { name: 'Moment.js', value: 'moment' },
          { name: 'Axios', value: 'axios' }
        ]
      }
    ]
  },

  // Logic Nodes
  'if-condition': {
    type: 'if-condition',
    category: NodeCategory.LOGIC,
    name: 'If Condition',
    description: 'Branch execution based on conditions',
    icon: 'branch',
    color: '#EF4444',
    inputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    outputs: [
      { name: 'true', type: 'main', required: true, description: 'True branch' },
      { name: 'false', type: 'main', required: true, description: 'False branch' }
    ],
    parameters: [
      {
        name: 'condition',
        displayName: 'Condition',
        type: 'expression',
        required: true,
        placeholder: '{{$json.status}} === "active"',
        description: 'Expression that evaluates to true or false'
      },
      {
        name: 'operator',
        displayName: 'Operator',
        type: 'select',
        required: false,
        default: 'equal',
        options: [
          { name: 'Equal', value: 'equal' },
          { name: 'Not Equal', value: 'notEqual' },
          { name: 'Greater Than', value: 'greaterThan' },
          { name: 'Less Than', value: 'lessThan' },
          { name: 'Contains', value: 'contains' },
          { name: 'Exists', value: 'exists' }
        ]
      }
    ]
  },

  'merge': {
    type: 'merge',
    category: NodeCategory.LOGIC,
    name: 'Merge',
    description: 'Merge multiple data streams',
    icon: 'merge',
    color: '#06B6D4',
    inputs: [
      { name: 'input1', type: 'main', required: true, description: 'First input' },
      { name: 'input2', type: 'main', required: true, description: 'Second input' }
    ],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Merged output' }
    ],
    parameters: [
      {
        name: 'mode',
        displayName: 'Merge Mode',
        type: 'select',
        required: true,
        default: 'append',
        options: [
          { name: 'Append', value: 'append' },
          { name: 'Merge', value: 'merge' },
          { name: 'Choose Branch', value: 'chooseBranch' }
        ]
      },
      {
        name: 'waitForAll',
        displayName: 'Wait for All Inputs',
        type: 'boolean',
        required: false,
        default: true,
        description: 'Wait for all inputs before proceeding'
      }
    ]
  },

  // AI Nodes
  'openai-chat': {
    type: 'openai-chat',
    category: NodeCategory.AI,
    name: 'OpenAI Chat',
    description: 'Chat with OpenAI GPT models',
    icon: 'robot',
    color: '#10B981',
    inputs: [
      { name: 'main', type: 'main', required: true, description: 'Main execution flow' }
    ],
    outputs: [
      { name: 'main', type: 'main', required: true, description: 'Chat response' }
    ],
    parameters: [
      {
        name: 'model',
        displayName: 'Model',
        type: 'select',
        required: true,
        default: 'gpt-3.5-turbo',
        options: [
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
          { name: 'GPT-4', value: 'gpt-4' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' }
        ]
      },
      {
        name: 'prompt',
        displayName: 'Prompt',
        type: 'string',
        required: true,
        placeholder: 'Ask the AI a question...'
      },
      {
        name: 'systemMessage',
        displayName: 'System Message',
        type: 'string',
        required: false,
        placeholder: 'You are a helpful assistant...'
      },
      {
        name: 'temperature',
        displayName: 'Temperature',
        type: 'number',
        required: false,
        default: 0.7,
        validation: { min: 0, max: 2 }
      },
      {
        name: 'maxTokens',
        displayName: 'Max Tokens',
        type: 'number',
        required: false,
        default: 1000,
        validation: { min: 1, max: 4000 }
      }
    ],
    credentials: ['openai']
  }
}

export const NODE_CATEGORIES = [
  { id: NodeCategory.TRIGGER, name: 'Triggers', description: 'Start workflows' },
  { id: NodeCategory.ACTION, name: 'Actions', description: 'Perform operations' },
  { id: NodeCategory.LOGIC, name: 'Logic', description: 'Control flow' },
  { id: NodeCategory.DATA, name: 'Data', description: 'Process data' },
  { id: NodeCategory.AI, name: 'AI/ML', description: 'Artificial intelligence' },
  { id: NodeCategory.INTEGRATION, name: 'Integrations', description: 'Third-party services' },
  { id: NodeCategory.UTILITY, name: 'Utilities', description: 'Helper functions' }
]