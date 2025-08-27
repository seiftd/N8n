<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
      <h3 class="text-sm font-medium text-gray-900">
        {{ selectedNodes.length === 1 ? 'Node Properties' : `${selectedNodes.length} Nodes Selected` }}
      </h3>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Single Node Selection -->
      <div v-if="selectedNodes.length === 1 && selectedNode">
        <!-- Node Basic Info -->
        <div class="p-4 border-b border-gray-200">
          <div class="space-y-3">
            <!-- Node Name -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">
                Node Name
              </label>
              <input
                v-model="selectedNode.data.label"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateNode"
              />
            </div>

            <!-- Node Description -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                v-model="selectedNode.data.description"
                rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Optional description..."
                @input="updateNode"
              />
            </div>

            <!-- Node Type Badge -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">Type:</span>
              <span
                :style="{ backgroundColor: nodeDefinition?.color }"
                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
              >
                {{ nodeDefinition?.name }}
              </span>
            </div>
          </div>
        </div>

        <!-- Node Parameters -->
        <div v-if="nodeDefinition?.parameters?.length" class="p-4 border-b border-gray-200">
          <h4 class="text-xs font-medium text-gray-700 mb-3">Parameters</h4>
          <div class="space-y-4">
            <div
              v-for="parameter in nodeDefinition.parameters"
              :key="parameter.name"
              class="space-y-1"
            >
              <label class="block text-xs font-medium text-gray-700">
                {{ parameter.displayName }}
                <span v-if="parameter.required" class="text-red-500">*</span>
              </label>
              
              <!-- String Parameter -->
              <input
                v-if="parameter.type === 'string'"
                v-model="selectedNode.data.parameters[parameter.name]"
                type="text"
                :placeholder="parameter.placeholder"
                :required="parameter.required"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateNode"
              />

              <!-- Number Parameter -->
              <input
                v-else-if="parameter.type === 'number'"
                v-model.number="selectedNode.data.parameters[parameter.name]"
                type="number"
                :min="parameter.validation?.min"
                :max="parameter.validation?.max"
                :required="parameter.required"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateNode"
              />

              <!-- Boolean Parameter -->
              <div
                v-else-if="parameter.type === 'boolean'"
                class="flex items-center"
              >
                <input
                  :id="`param-${parameter.name}`"
                  v-model="selectedNode.data.parameters[parameter.name]"
                  type="checkbox"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  @change="updateNode"
                />
                <label
                  :for="`param-${parameter.name}`"
                  class="ml-2 text-sm text-gray-700"
                >
                  {{ parameter.description || parameter.displayName }}
                </label>
              </div>

              <!-- Select Parameter -->
              <select
                v-else-if="parameter.type === 'select'"
                v-model="selectedNode.data.parameters[parameter.name]"
                :required="parameter.required"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @change="updateNode"
              >
                <option value="">Select option...</option>
                <option
                  v-for="option in parameter.options"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.name }}
                </option>
              </select>

              <!-- Multi-select Parameter -->
              <div
                v-else-if="parameter.type === 'multiselect'"
                class="space-y-2"
              >
                <div
                  v-for="option in parameter.options"
                  :key="option.value"
                  class="flex items-center"
                >
                  <input
                    :id="`param-${parameter.name}-${option.value}`"
                    v-model="selectedNode.data.parameters[parameter.name]"
                    :value="option.value"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    @change="updateNode"
                  />
                  <label
                    :for="`param-${parameter.name}-${option.value}`"
                    class="ml-2 text-sm text-gray-700"
                  >
                    {{ option.name }}
                  </label>
                </div>
              </div>

              <!-- JSON Parameter -->
              <textarea
                v-else-if="parameter.type === 'json'"
                v-model="jsonParameters[parameter.name]"
                rows="4"
                :placeholder="parameter.placeholder || 'Enter valid JSON...'"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateJsonParameter(parameter.name, $event)"
              />

              <!-- Code Parameter -->
              <textarea
                v-else-if="parameter.type === 'code'"
                v-model="selectedNode.data.parameters[parameter.name]"
                rows="6"
                :placeholder="parameter.placeholder"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateNode"
              />

              <!-- Expression Parameter -->
              <div
                v-else-if="parameter.type === 'expression'"
                class="space-y-2"
              >
                <textarea
                  v-model="selectedNode.data.parameters[parameter.name]"
                  rows="2"
                  :placeholder="parameter.placeholder"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  @input="updateNode"
                />
                <div class="text-xs text-gray-500">
                  Use expressions like {{$json.field}} to reference data
                </div>
              </div>

              <!-- Parameter Description -->
              <p
                v-if="parameter.description"
                class="text-xs text-gray-500"
              >
                {{ parameter.description }}
              </p>
            </div>
          </div>
        </div>

        <!-- Node Settings -->
        <div class="p-4 border-b border-gray-200">
          <h4 class="text-xs font-medium text-gray-700 mb-3">Node Settings</h4>
          <div class="space-y-3">
            <!-- Disabled -->
            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700">Disabled</label>
              <input
                v-model="selectedNode.data.disabled"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                @change="updateNode"
              />
            </div>

            <!-- Continue on Fail -->
            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700">Continue on Fail</label>
              <input
                v-model="selectedNode.data.continueOnFail"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                @change="updateNode"
              />
            </div>

            <!-- Retry on Fail -->
            <div v-if="selectedNode.data.continueOnFail">
              <label class="block text-xs font-medium text-gray-700 mb-1">
                Retry Attempts
              </label>
              <input
                v-model.number="selectedNode.data.retryOnFail"
                type="number"
                min="0"
                max="10"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateNode"
              />
            </div>

            <!-- Wait Between Tries -->
            <div v-if="selectedNode.data.retryOnFail && selectedNode.data.retryOnFail > 0">
              <label class="block text-xs font-medium text-gray-700 mb-1">
                Wait Between Tries (ms)
              </label>
              <input
                v-model.number="selectedNode.data.waitBetweenTries"
                type="number"
                min="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                @input="updateNode"
              />
            </div>

            <!-- Always Output Data -->
            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700">Always Output Data</label>
              <input
                v-model="selectedNode.data.alwaysOutputData"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                @change="updateNode"
              />
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="p-4">
          <h4 class="text-xs font-medium text-gray-700 mb-2">Notes</h4>
          <textarea
            v-model="selectedNode.data.notes"
            rows="3"
            placeholder="Add notes about this node..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            @input="updateNode"
          />
        </div>
      </div>

      <!-- Multiple Nodes Selected -->
      <div v-else-if="selectedNodes.length > 1" class="p-4">
        <div class="text-center text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p class="text-sm">Multiple nodes selected</p>
          <p class="text-xs text-gray-400 mt-1">
            Bulk operations will be supported in future updates
          </p>
        </div>

        <!-- Bulk Actions -->
        <div class="mt-6 space-y-2">
          <button
            @click="disableAllSelected"
            class="w-full px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Disable All Selected
          </button>
          
          <button
            @click="enableAllSelected"
            class="w-full px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Enable All Selected
          </button>
          
          <button
            @click="deleteAllSelected"
            class="w-full px-3 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
          >
            Delete All Selected
          </button>
        </div>
      </div>

      <!-- No Selection -->
      <div v-else class="p-4">
        <div class="text-center text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p class="text-sm">No node selected</p>
          <p class="text-xs text-gray-400 mt-1">
            Click on a node to view and edit its properties
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { NODE_DEFINITIONS } from '@/types/nodes'

interface Props {
  selectedNodes: string[]
}

interface Emits {
  (e: 'update', data: any): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Store
const workflowStore = useWorkflowStore()

// Local state for JSON parameters (to handle parsing)
const jsonParameters = ref<Record<string, string>>({})

// Computed
const selectedNode = computed(() => {
  if (props.selectedNodes.length !== 1 || !workflowStore.currentWorkflow) return null
  
  return workflowStore.currentWorkflow.nodes.find(
    node => node.id === props.selectedNodes[0]
  )
})

const nodeDefinition = computed(() => {
  if (!selectedNode.value) return null
  
  return Object.values(NODE_DEFINITIONS).find(def => 
    def.name === selectedNode.value?.data.label ||
    def.type === selectedNode.value?.type
  )
})

// Methods
const updateNode = () => {
  if (!selectedNode.value) return
  
  emit('update', selectedNode.value.data)
}

const updateJsonParameter = (paramName: string, event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value
  jsonParameters.value[paramName] = value
  
  try {
    const parsed = JSON.parse(value || '{}')
    if (selectedNode.value) {
      if (!selectedNode.value.data.parameters) {
        selectedNode.value.data.parameters = {}
      }
      selectedNode.value.data.parameters[paramName] = parsed
      updateNode()
    }
  } catch (error) {
    // Invalid JSON, don't update the parameter
    console.warn('Invalid JSON:', error)
  }
}

const disableAllSelected = () => {
  props.selectedNodes.forEach(nodeId => {
    workflowStore.updateNodeData(nodeId, { disabled: true })
  })
}

const enableAllSelected = () => {
  props.selectedNodes.forEach(nodeId => {
    workflowStore.updateNodeData(nodeId, { disabled: false })
  })
}

const deleteAllSelected = () => {
  workflowStore.deleteSelectedNodes()
}

// Initialize JSON parameters when selected node changes
watch(selectedNode, (newNode) => {
  if (!newNode || !nodeDefinition.value) return
  
  // Initialize JSON parameters with stringified values
  nodeDefinition.value.parameters?.forEach(param => {
    if (param.type === 'json' && newNode.data.parameters?.[param.name]) {
      jsonParameters.value[param.name] = JSON.stringify(
        newNode.data.parameters[param.name],
        null,
        2
      )
    }
  })
}, { immediate: true })

// Initialize parameters object if it doesn't exist
watch(selectedNode, (newNode) => {
  if (newNode && !newNode.data.parameters) {
    newNode.data.parameters = {}
    
    // Set default values for parameters
    if (nodeDefinition.value?.parameters) {
      nodeDefinition.value.parameters.forEach(param => {
        if (param.default !== undefined) {
          newNode.data.parameters![param.name] = param.default
        }
      })
    }
  }
}, { immediate: true })
</script>