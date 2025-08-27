<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Toolbar -->
    <div class="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <!-- Workflow Name -->
        <input
          v-if="currentWorkflow"
          v-model="currentWorkflow.name"
          class="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0"
          @blur="saveWorkflow"
        />
        
        <!-- Status Badge -->
        <span
          v-if="currentWorkflow"
          :class="[
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            currentWorkflow.status === 'active'
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          ]"
        >
          {{ currentWorkflow.status }}
        </span>
      </div>

      <!-- Actions -->
      <div class="flex items-center space-x-2">
        <!-- Save Button -->
        <button
          @click="saveWorkflow"
          class="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Save
        </button>

        <!-- Execute Button -->
        <button
          @click="executeWorkflow"
          :disabled="!isWorkflowValid"
          class="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9 5l3-3m6 0l3 3M7 7l3-3m6 0l3 3" />
          </svg>
          Execute
        </button>

        <!-- Settings -->
        <button
          @click="showSettings = !showSettings"
          class="p-1.5 text-gray-400 hover:text-gray-600"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Main Editor Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Node Palette -->
      <div class="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div class="p-4 border-b border-gray-200">
          <h3 class="text-sm font-medium text-gray-900">Node Library</h3>
        </div>
        
        <!-- Node Categories -->
        <div class="flex-1 overflow-y-auto">
          <div
            v-for="category in nodeCategories"
            :key="category.id"
            class="border-b border-gray-200"
          >
            <button
              @click="toggleCategory(category.id)"
              class="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
            >
              {{ category.name }}
              <svg
                :class="[
                  'w-4 h-4 transition-transform',
                  expandedCategories.includes(category.id) ? 'rotate-90' : ''
                ]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            <!-- Nodes in Category -->
            <div
              v-if="expandedCategories.includes(category.id)"
              class="bg-gray-50"
            >
              <div
                v-for="nodeType in getNodesInCategory(category.id)"
                :key="nodeType"
                :draggable="true"
                @dragstart="startNodeDrag($event, nodeType)"
                class="px-6 py-2 text-sm text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing border-l-2 border-transparent hover:border-primary-300"
              >
                <div class="flex items-center">
                  <div
                    :style="{ backgroundColor: nodeDefinitions[nodeType]?.color }"
                    class="w-3 h-3 rounded-full mr-2"
                  ></div>
                  {{ nodeDefinitions[nodeType]?.name }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Canvas Area -->
      <div class="flex-1 relative">
        <!-- Vue Flow Editor -->
        <VueFlow
          ref="vueFlowRef"
          v-model="elements"
          :class="{ 'vue-flow-focused': isEditorFocused }"
          :default-viewport="{ zoom: 1, x: 0, y: 0 }"
          :default-edge-options="{ type: 'smoothstep' }"
          :snap-to-grid="editorSettings.snapToGrid"
          :snap-grid="[editorSettings.gridSize, editorSettings.gridSize]"
          :multi-selection-key-code="'Meta'"
          :delete-key-code="null"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @connect="onConnect"
          @pane-click="clearSelection"
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
          @drop="onDrop"
          @dragover="onDragOver"
          @focus="focusEditor"
          @blur="blurEditor"
          tabindex="0"
        >
          <!-- Background -->
          <Background
            v-if="editorSettings.snapToGrid"
            :gap="editorSettings.gridSize"
            pattern="dots"
          />

          <!-- Controls -->
          <Controls
            v-if="editorSettings.showControls"
            position="bottom-left"
          />

          <!-- Minimap -->
          <MiniMap
            v-if="editorSettings.showMinimap"
            position="top-right"
            :node-color="getNodeColor"
            :node-stroke-color="getNodeStrokeColor"
          />

          <!-- Custom Node Types -->
          <template #node-default="{ data, id }">
            <WorkflowNode
              :id="id"
              :data="data"
              :selected="selectedNodes.includes(id)"
              @update="updateNodeData(id, $event)"
            />
          </template>
        </VueFlow>

        <!-- Validation Errors -->
        <div
          v-if="validationErrors.length > 0"
          class="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-md p-3 max-w-sm"
        >
          <div class="flex">
            <svg class="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div class="ml-2">
              <h4 class="text-sm font-medium text-red-800">Validation Errors</h4>
              <ul class="mt-1 text-sm text-red-700">
                <li v-for="error in validationErrors" :key="error">• {{ error }}</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Loading Overlay -->
        <div
          v-if="isLoading"
          class="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center"
        >
          <div class="text-center">
            <svg class="animate-spin h-8 w-8 text-primary-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="mt-2 text-sm text-gray-600">Loading workflow...</p>
          </div>
        </div>
      </div>

      <!-- Properties Panel -->
      <div
        v-if="selectedNodes.length > 0"
        class="w-80 bg-white border-l border-gray-200 flex flex-col"
      >
        <PropertiesPanel
          :selected-nodes="selectedNodes"
          @update="updateSelectedNodeData"
        />
      </div>
    </div>

    <!-- Settings Panel -->
    <div
      v-if="showSettings"
      class="absolute top-16 right-4 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
    >
      <EditorSettings
        v-model="editorSettings"
        @close="showSettings = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { VueFlow, Background, Controls, MiniMap, useVueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import { useWorkflowStore } from '@/stores/workflow'
import { useWorkflowEditor } from '@/composables/useWorkflowEditor'
import { NODE_DEFINITIONS, NODE_CATEGORIES, NodeCategory } from '@/types/nodes'

import WorkflowNode from './WorkflowNode.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import EditorSettings from './EditorSettings.vue'

// Store
const workflowStore = useWorkflowStore()
const {
  currentWorkflow,
  selectedNodes,
  isLoading,
  selectNode,
  clearSelection,
  updateNodeData,
  addEdge,
  removeEdge
} = workflowStore

// Editor composable
const {
  editorSettings,
  isEditorFocused,
  createNodeAtPosition,
  saveWorkflow,
  executeWorkflow,
  validateWorkflow,
  focusEditor,
  blurEditor
} = useWorkflowEditor()

// Vue Flow
const vueFlowRef = ref()
const { onConnect, addEdges, updateNode, removeNodes } = useVueFlow()

// Local state
const showSettings = ref(false)
const expandedCategories = ref<NodeCategory[]>([NodeCategory.TRIGGER, NodeCategory.ACTION])
const draggedNodeType = ref<string | null>(null)

// Computed
const nodeDefinitions = NODE_DEFINITIONS
const nodeCategories = NODE_CATEGORIES

const elements = computed(() => {
  if (!currentWorkflow.value) return []
  
  return [
    ...currentWorkflow.value.nodes.map(node => ({
      id: node.id,
      type: 'default',
      position: node.position,
      data: node.data,
      style: {
        backgroundColor: nodeDefinitions[node.type]?.color || '#94A3B8',
        ...node.style
      }
    })),
    ...currentWorkflow.value.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: 'smoothstep',
      style: edge.style
    }))
  ]
})

const validationResult = computed(() => validateWorkflow())
const isWorkflowValid = computed(() => validationResult.value.isValid)
const validationErrors = computed(() => validationResult.value.errors)

// Methods
const toggleCategory = (categoryId: NodeCategory) => {
  const index = expandedCategories.value.indexOf(categoryId)
  if (index > -1) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(categoryId)
  }
}

const getNodesInCategory = (categoryId: NodeCategory) => {
  return Object.keys(nodeDefinitions).filter(
    nodeType => nodeDefinitions[nodeType].category === categoryId
  )
}

const startNodeDrag = (event: DragEvent, nodeType: string) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/nodeType', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }
  draggedNodeType.value = nodeType
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const onDrop = (event: DragEvent) => {
  const nodeType = event.dataTransfer?.getData('application/nodeType')
  if (!nodeType || !vueFlowRef.value) return

  const { x, y } = vueFlowRef.value.project({
    x: event.clientX - event.currentTarget.getBoundingClientRect().left,
    y: event.clientY - event.currentTarget.getBoundingClientRect().top
  })

  createNodeAtPosition(nodeType, { x, y })
  draggedNodeType.value = null
}

const onNodesChange = (changes: any[]) => {
  // Handle node position updates
  changes.forEach(change => {
    if (change.type === 'position' && change.position) {
      workflowStore.updateNodePosition(change.id, change.position)
    } else if (change.type === 'remove') {
      workflowStore.removeNode(change.id)
    }
  })
}

const onEdgesChange = (changes: any[]) => {
  changes.forEach(change => {
    if (change.type === 'remove') {
      workflowStore.removeEdge(change.id)
    }
  })
}

const onNodeClick = (event: MouseEvent, node: any) => {
  selectNode(node.id, event.ctrlKey || event.metaKey)
}

const onEdgeClick = (event: MouseEvent, edge: any) => {
  // Handle edge selection if needed
}

const updateSelectedNodeData = (data: any) => {
  selectedNodes.value.forEach(nodeId => {
    updateNodeData(nodeId, data)
  })
}

const getNodeColor = (node: any) => {
  return node.style?.backgroundColor || '#94A3B8'
}

const getNodeStrokeColor = (node: any) => {
  return selectedNodes.value.includes(node.id) ? '#3B82F6' : '#6B7280'
}

// Lifecycle
onMounted(() => {
  // Focus the editor by default
  setTimeout(() => {
    vueFlowRef.value?.$el?.focus()
  }, 100)
})

// Watch for workflow changes
watch(currentWorkflow, (newWorkflow) => {
  if (newWorkflow && vueFlowRef.value) {
    // Fit view to show all nodes
    setTimeout(() => {
      vueFlowRef.value.fitView({ padding: 0.1 })
    }, 100)
  }
}, { immediate: true })
</script>

<style scoped>
.vue-flow-focused {
  outline: none;
}

.vue-flow__minimap {
  background: white;
  border: 1px solid #e5e7eb;
}

.vue-flow__controls {
  box-shadow: none;
  border: 1px solid #e5e7eb;
}

.vue-flow__edge-path {
  stroke: #6b7280;
  stroke-width: 2;
}

.vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #3b82f6;
  stroke-width: 3;
}
</style>