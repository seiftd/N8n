import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
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
  style?: Record<string, any>
  class?: string
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  style?: Record<string, any>
  class?: string
}

export interface Workflow {
  id?: string
  name: string
  description?: string
  status: 'draft' | 'active' | 'inactive' | 'archived'
  isTemplate?: boolean
  settings?: Record<string, any>
  staticData?: Record<string, any>
  tags?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  version?: number
  createdAt?: string
  updatedAt?: string
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: 'new' | 'running' | 'success' | 'failed' | 'canceled' | 'waiting'
  mode: 'manual' | 'trigger' | 'webhook' | 'retry' | 'cli'
  startedAt?: string
  finishedAt?: string
  error?: string
  data?: Record<string, any>
}

export const useWorkflowStore = defineStore('workflow', () => {
  // State
  const workflows = ref<Workflow[]>([])
  const currentWorkflow = ref<Workflow | null>(null)
  const executions = ref<WorkflowExecution[]>([])
  const selectedNodes = ref<string[]>([])
  const clipboardNodes = ref<WorkflowNode[]>([])
  const clipboardEdges = ref<WorkflowEdge[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // History for undo/redo
  const history = ref<Workflow[]>([])
  const historyIndex = ref(-1)
  const maxHistorySize = ref(50)

  // Computed
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)
  const activeWorkflows = computed(() => workflows.value.filter(w => w.status === 'active'))
  const recentWorkflows = computed(() => 
    workflows.value
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 10)
  )

  // Actions
  const createWorkflow = (name: string, description?: string): Workflow => {
    const workflow: Workflow = {
      id: uuidv4(),
      name,
      description,
      status: 'draft',
      nodes: [],
      edges: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    workflows.value.push(workflow)
    setCurrentWorkflow(workflow)
    saveToHistory()
    
    return workflow
  }

  const setCurrentWorkflow = (workflow: Workflow | null) => {
    currentWorkflow.value = workflow
    selectedNodes.value = []
    if (workflow) {
      saveToHistory()
    }
  }

  const addNode = (nodeType: string, position: { x: number; y: number }, label?: string) => {
    if (!currentWorkflow.value) return

    const node: WorkflowNode = {
      id: uuidv4(),
      type: nodeType,
      position,
      data: {
        label: label || `${nodeType} Node`,
        parameters: {},
        disabled: false,
        continueOnFail: false,
        alwaysOutputData: false
      }
    }

    currentWorkflow.value.nodes.push(node)
    currentWorkflow.value.updatedAt = new Date().toISOString()
    saveToHistory()
  }

  const removeNode = (nodeId: string) => {
    if (!currentWorkflow.value) return

    // Remove node
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter(n => n.id !== nodeId)
    
    // Remove connected edges
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      e => e.source !== nodeId && e.target !== nodeId
    )

    // Remove from selection
    selectedNodes.value = selectedNodes.value.filter(id => id !== nodeId)
    
    currentWorkflow.value.updatedAt = new Date().toISOString()
    saveToHistory()
  }

  const addEdge = (source: string, target: string, sourceHandle?: string, targetHandle?: string) => {
    if (!currentWorkflow.value) return

    const edge: WorkflowEdge = {
      id: uuidv4(),
      source,
      target,
      sourceHandle,
      targetHandle
    }

    currentWorkflow.value.edges.push(edge)
    currentWorkflow.value.updatedAt = new Date().toISOString()
    saveToHistory()
  }

  const removeEdge = (edgeId: string) => {
    if (!currentWorkflow.value) return

    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(e => e.id !== edgeId)
    currentWorkflow.value.updatedAt = new Date().toISOString()
    saveToHistory()
  }

  const updateNodePosition = (nodeId: string, position: { x: number; y: number }) => {
    if (!currentWorkflow.value) return

    const node = currentWorkflow.value.nodes.find(n => n.id === nodeId)
    if (node) {
      node.position = position
      currentWorkflow.value.updatedAt = new Date().toISOString()
    }
  }

  const updateNodeData = (nodeId: string, data: Partial<WorkflowNode['data']>) => {
    if (!currentWorkflow.value) return

    const node = currentWorkflow.value.nodes.find(n => n.id === nodeId)
    if (node) {
      node.data = { ...node.data, ...data }
      currentWorkflow.value.updatedAt = new Date().toISOString()
      saveToHistory()
    }
  }

  const selectNode = (nodeId: string, multiSelect = false) => {
    if (multiSelect) {
      if (selectedNodes.value.includes(nodeId)) {
        selectedNodes.value = selectedNodes.value.filter(id => id !== nodeId)
      } else {
        selectedNodes.value.push(nodeId)
      }
    } else {
      selectedNodes.value = [nodeId]
    }
  }

  const selectAllNodes = () => {
    if (!currentWorkflow.value) return
    selectedNodes.value = currentWorkflow.value.nodes.map(n => n.id)
  }

  const clearSelection = () => {
    selectedNodes.value = []
  }

  const copySelectedNodes = () => {
    if (!currentWorkflow.value || selectedNodes.value.length === 0) return

    clipboardNodes.value = currentWorkflow.value.nodes
      .filter(n => selectedNodes.value.includes(n.id))
      .map(n => ({ ...n, id: uuidv4() })) // Generate new IDs for copies

    clipboardEdges.value = currentWorkflow.value.edges
      .filter(e => selectedNodes.value.includes(e.source) && selectedNodes.value.includes(e.target))
      .map(e => ({ ...e, id: uuidv4() }))
  }

  const pasteNodes = (offset = { x: 50, y: 50 }) => {
    if (!currentWorkflow.value || clipboardNodes.value.length === 0) return

    const oldToNewIdMap = new Map<string, string>()
    
    // Create new nodes with offset positions
    const newNodes = clipboardNodes.value.map(n => {
      const newId = uuidv4()
      oldToNewIdMap.set(n.id, newId)
      
      return {
        ...n,
        id: newId,
        position: {
          x: n.position.x + offset.x,
          y: n.position.y + offset.y
        }
      }
    })

    // Create new edges with updated node references
    const newEdges = clipboardEdges.value.map(e => ({
      ...e,
      id: uuidv4(),
      source: oldToNewIdMap.get(e.source) || e.source,
      target: oldToNewIdMap.get(e.target) || e.target
    }))

    currentWorkflow.value.nodes.push(...newNodes)
    currentWorkflow.value.edges.push(...newEdges)
    
    // Select the newly pasted nodes
    selectedNodes.value = newNodes.map(n => n.id)
    
    currentWorkflow.value.updatedAt = new Date().toISOString()
    saveToHistory()
  }

  const deleteSelectedNodes = () => {
    if (!currentWorkflow.value || selectedNodes.value.length === 0) return

    selectedNodes.value.forEach(nodeId => {
      removeNode(nodeId)
    })
  }

  const saveToHistory = () => {
    if (!currentWorkflow.value) return

    // Remove any history after current index (when we're not at the end)
    history.value = history.value.slice(0, historyIndex.value + 1)
    
    // Add current state to history
    history.value.push(JSON.parse(JSON.stringify(currentWorkflow.value)))
    
    // Limit history size
    if (history.value.length > maxHistorySize.value) {
      history.value = history.value.slice(-maxHistorySize.value)
    }
    
    historyIndex.value = history.value.length - 1
  }

  const undo = () => {
    if (!canUndo.value || !currentWorkflow.value) return

    historyIndex.value--
    const previousState = history.value[historyIndex.value]
    if (previousState) {
      currentWorkflow.value = JSON.parse(JSON.stringify(previousState))
      selectedNodes.value = []
    }
  }

  const redo = () => {
    if (!canRedo.value || !currentWorkflow.value) return

    historyIndex.value++
    const nextState = history.value[historyIndex.value]
    if (nextState) {
      currentWorkflow.value = JSON.parse(JSON.stringify(nextState))
      selectedNodes.value = []
    }
  }

  const duplicateWorkflow = (workflow: Workflow): Workflow => {
    const duplicated: Workflow = {
      ...workflow,
      id: uuidv4(),
      name: `${workflow.name} (Copy)`,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: workflow.nodes.map(n => ({ ...n, id: uuidv4() })),
      edges: workflow.edges.map(e => ({ ...e, id: uuidv4() }))
    }

    workflows.value.push(duplicated)
    return duplicated
  }

  const executeWorkflow = (workflowId: string, mode: WorkflowExecution['mode'] = 'manual') => {
    const execution: WorkflowExecution = {
      id: uuidv4(),
      workflowId,
      status: 'running',
      mode,
      startedAt: new Date().toISOString()
    }

    executions.value.push(execution)
    
    // Simulate execution (replace with actual API call)
    setTimeout(() => {
      execution.status = 'success'
      execution.finishedAt = new Date().toISOString()
    }, 2000)

    return execution
  }

  return {
    // State
    workflows,
    currentWorkflow,
    executions,
    selectedNodes,
    isLoading,
    error,
    
    // Computed
    canUndo,
    canRedo,
    activeWorkflows,
    recentWorkflows,
    
    // Actions
    createWorkflow,
    setCurrentWorkflow,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
    updateNodePosition,
    updateNodeData,
    selectNode,
    selectAllNodes,
    clearSelection,
    copySelectedNodes,
    pasteNodes,
    deleteSelectedNodes,
    undo,
    redo,
    duplicateWorkflow,
    executeWorkflow
  }
})