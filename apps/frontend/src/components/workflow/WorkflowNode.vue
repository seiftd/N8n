<template>
  <div
    :class="[
      'workflow-node',
      'bg-white border-2 rounded-lg shadow-sm min-w-[200px]',
      selected ? 'border-primary-500 shadow-md' : 'border-gray-200',
      data.disabled ? 'opacity-60' : '',
      'hover:shadow-md transition-all duration-200'
    ]"
  >
    <!-- Node Header -->
    <div
      :style="{ backgroundColor: nodeDefinition?.color || '#94A3B8' }"
      class="px-3 py-2 rounded-t-md text-white"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <!-- Node Icon -->
          <div class="flex-shrink-0 w-5 h-5 mr-2">
            <component
              :is="getNodeIcon(nodeDefinition?.icon)"
              class="w-full h-full"
            />
          </div>
          
          <!-- Node Name -->
          <span class="text-sm font-medium truncate">
            {{ data.label }}
          </span>
        </div>

        <!-- Node Status Indicators -->
        <div class="flex items-center space-x-1">
          <!-- Disabled Indicator -->
          <svg
            v-if="data.disabled"
            class="w-4 h-4 text-white opacity-75"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636 5.636 18.364" />
          </svg>

          <!-- Error Indicator -->
          <svg
            v-if="hasError"
            class="w-4 h-4 text-red-200"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>

          <!-- Continue on Fail Indicator -->
          <svg
            v-if="data.continueOnFail"
            class="w-4 h-4 text-white opacity-75"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Node Body -->
    <div class="p-3">
      <!-- Description -->
      <p
        v-if="data.description || nodeDefinition?.description"
        class="text-xs text-gray-600 mb-2"
      >
        {{ data.description || nodeDefinition?.description }}
      </p>

      <!-- Parameters Preview -->
      <div
        v-if="hasConfiguredParameters"
        class="text-xs text-gray-500 space-y-1"
      >
        <div
          v-for="param in previewParameters"
          :key="param.name"
          class="flex justify-between"
        >
          <span class="font-medium">{{ param.displayName }}:</span>
          <span class="truncate ml-2 max-w-[100px]">{{ formatParameterValue(param.value) }}</span>
        </div>
      </div>

      <!-- Validation Errors -->
      <div
        v-if="validationErrors.length > 0"
        class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs"
      >
        <div class="text-red-800 font-medium">Errors:</div>
        <ul class="text-red-700 mt-1">
          <li v-for="error in validationErrors" :key="error">• {{ error }}</li>
        </ul>
      </div>

      <!-- Notes -->
      <div
        v-if="data.notes"
        class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800"
      >
        <div class="font-medium">Notes:</div>
        <div class="mt-1">{{ data.notes }}</div>
      </div>
    </div>

    <!-- Input Handles -->
    <div class="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1/2">
      <Handle
        v-for="input in nodeDefinition?.inputs || []"
        :key="input.name"
        :id="`${id}-input-${input.name}`"
        type="target"
        :position="Position.Left"
        :style="{ top: getHandlePosition(input, 'input') }"
        class="w-3 h-3 bg-gray-400 border-2 border-white rounded-full hover:bg-primary-500 transition-colors"
      />
    </div>

    <!-- Output Handles -->
    <div class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2">
      <Handle
        v-for="output in nodeDefinition?.outputs || []"
        :key="output.name"
        :id="`${id}-output-${output.name}`"
        type="source"
        :position="Position.Right"
        :style="{ top: getHandlePosition(output, 'output') }"
        class="w-3 h-3 bg-gray-400 border-2 border-white rounded-full hover:bg-primary-500 transition-colors"
      />
    </div>

    <!-- Execution Status Overlay -->
    <div
      v-if="executionStatus"
      :class="[
        'absolute inset-0 rounded-lg flex items-center justify-center',
        'bg-white bg-opacity-90 backdrop-blur-sm',
        executionStatus === 'running' ? 'border-blue-500' : '',
        executionStatus === 'success' ? 'border-green-500' : '',
        executionStatus === 'error' ? 'border-red-500' : ''
      ]"
    >
      <!-- Running -->
      <div v-if="executionStatus === 'running'" class="text-center">
        <svg class="animate-spin h-6 w-6 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <div class="text-xs text-blue-600 mt-1">Running...</div>
      </div>

      <!-- Success -->
      <div v-else-if="executionStatus === 'success'" class="text-center">
        <svg class="h-6 w-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <div class="text-xs text-green-600 mt-1">Success</div>
      </div>

      <!-- Error -->
      <div v-else-if="executionStatus === 'error'" class="text-center">
        <svg class="h-6 w-6 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <div class="text-xs text-red-600 mt-1">Error</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NODE_DEFINITIONS } from '@/types/nodes'
import type { NodeDefinition, NodeParameter } from '@/types/nodes'

interface Props {
  id: string
  data: {
    label: string
    description?: string
    parameters?: Record<string, any>
    credentials?: Record<string, any>
    disabled?: boolean
    continueOnFail?: boolean
    retryOnFail?: number
    waitBetweenTries?: number
    alwaysOutputData?: boolean
    notes?: string
  }
  selected?: boolean
  executionStatus?: 'running' | 'success' | 'error' | null
}

interface Emits {
  (e: 'update', data: Partial<Props['data']>): void
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  executionStatus: null
})

const emit = defineEmits<Emits>()

// Computed
const nodeType = computed(() => {
  // Extract node type from the node data or derive from label
  return Object.keys(NODE_DEFINITIONS).find(type => 
    NODE_DEFINITIONS[type].name === props.data.label
  ) || 'default'
})

const nodeDefinition = computed((): NodeDefinition | undefined => {
  return NODE_DEFINITIONS[nodeType.value]
})

const hasError = computed(() => {
  return validationErrors.value.length > 0
})

const hasConfiguredParameters = computed(() => {
  return props.data.parameters && Object.keys(props.data.parameters).length > 0
})

const previewParameters = computed(() => {
  if (!props.data.parameters || !nodeDefinition.value) return []
  
  return nodeDefinition.value.parameters
    .filter(param => props.data.parameters![param.name] !== undefined)
    .slice(0, 3) // Show only first 3 parameters
    .map(param => ({
      name: param.name,
      displayName: param.displayName,
      value: props.data.parameters![param.name]
    }))
})

const validationErrors = computed(() => {
  const errors: string[] = []
  
  if (!nodeDefinition.value) return errors
  
  // Check required parameters
  nodeDefinition.value.parameters.forEach(param => {
    if (param.required && !props.data.parameters?.[param.name]) {
      errors.push(`${param.displayName} is required`)
    }
  })
  
  // Check required credentials
  if (nodeDefinition.value.credentials?.length) {
    nodeDefinition.value.credentials.forEach(credType => {
      if (!props.data.credentials?.[credType]) {
        errors.push(`${credType} credential is required`)
      }
    })
  }
  
  return errors
})

// Methods
const getNodeIcon = (iconName?: string) => {
  // Return appropriate icon component based on icon name
  // For now, return a simple div with the icon name
  return 'div'
}

const getHandlePosition = (handle: any, type: 'input' | 'output') => {
  // Calculate handle position based on number of handles
  const handles = type === 'input' 
    ? nodeDefinition.value?.inputs || []
    : nodeDefinition.value?.outputs || []
  
  const index = handles.findIndex(h => h.name === handle.name)
  const total = handles.length
  
  if (total === 1) return '0px'
  
  const spacing = 100 / (total + 1)
  return `${(index + 1) * spacing - 50}%`
}

const formatParameterValue = (value: any): string => {
  if (typeof value === 'string') {
    return value.length > 20 ? `${value.substring(0, 20)}...` : value
  }
  if (typeof value === 'object') {
    return Array.isArray(value) ? `[${value.length} items]` : '{...}'
  }
  return String(value)
}
</script>

<style scoped>
.workflow-node {
  min-width: 200px;
  max-width: 250px;
  position: relative;
}

.workflow-node:hover {
  transform: translateY(-1px);
}

.vue-flow__handle {
  width: 12px;
  height: 12px;
  border: 2px solid white;
  background: #9CA3AF;
  transition: all 0.2s;
}

.vue-flow__handle:hover {
  background: #3B82F6;
  transform: scale(1.2);
}

.vue-flow__handle.vue-flow__handle-connecting {
  background: #10B981;
}
</style>