import { ref, onMounted, onUnmounted } from 'vue'
import hotkeys from 'hotkeys-js'
import { useWorkflowStore } from '@/stores/workflow'

export interface EditorSettings {
  snapToGrid: boolean
  gridSize: number
  showMinimap: boolean
  showControls: boolean
  enablePanning: boolean
  enableZooming: boolean
  multiSelection: boolean
}

export function useWorkflowEditor() {
  const workflowStore = useWorkflowStore()
  
  const editorSettings = ref<EditorSettings>({
    snapToGrid: true,
    gridSize: 15,
    showMinimap: true,
    showControls: true,
    enablePanning: true,
    enableZooming: true,
    multiSelection: true
  })

  const editorRef = ref<HTMLElement>()
  const isEditorFocused = ref(false)

  // Keyboard shortcuts
  const setupKeyboardShortcuts = () => {
    // Copy
    hotkeys('ctrl+c,cmd+c', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.copySelectedNodes()
      }
    })

    // Paste
    hotkeys('ctrl+v,cmd+v', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.pasteNodes()
      }
    })

    // Cut
    hotkeys('ctrl+x,cmd+x', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.copySelectedNodes()
        workflowStore.deleteSelectedNodes()
      }
    })

    // Delete
    hotkeys('delete,backspace', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.deleteSelectedNodes()
      }
    })

    // Select All
    hotkeys('ctrl+a,cmd+a', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.selectAllNodes()
      }
    })

    // Undo
    hotkeys('ctrl+z,cmd+z', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.undo()
      }
    })

    // Redo
    hotkeys('ctrl+y,cmd+y,ctrl+shift+z,cmd+shift+z', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.redo()
      }
    })

    // Duplicate
    hotkeys('ctrl+d,cmd+d', (event) => {
      event.preventDefault()
      if (isEditorFocused.value && workflowStore.selectedNodes.length > 0) {
        workflowStore.copySelectedNodes()
        workflowStore.pasteNodes({ x: 50, y: 50 })
      }
    })

    // Escape - clear selection
    hotkeys('escape', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        workflowStore.clearSelection()
      }
    })

    // Save workflow
    hotkeys('ctrl+s,cmd+s', (event) => {
      event.preventDefault()
      if (isEditorFocused.value) {
        saveWorkflow()
      }
    })

    // Execute workflow
    hotkeys('ctrl+enter,cmd+enter', (event) => {
      event.preventDefault()
      if (isEditorFocused.value && workflowStore.currentWorkflow) {
        executeWorkflow()
      }
    })
  }

  const removeKeyboardShortcuts = () => {
    hotkeys.unbind('ctrl+c,cmd+c')
    hotkeys.unbind('ctrl+v,cmd+v')
    hotkeys.unbind('ctrl+x,cmd+x')
    hotkeys.unbind('delete,backspace')
    hotkeys.unbind('ctrl+a,cmd+a')
    hotkeys.unbind('ctrl+z,cmd+z')
    hotkeys.unbind('ctrl+y,cmd+y,ctrl+shift+z,cmd+shift+z')
    hotkeys.unbind('ctrl+d,cmd+d')
    hotkeys.unbind('escape')
    hotkeys.unbind('ctrl+s,cmd+s')
    hotkeys.unbind('ctrl+enter,cmd+enter')
  }

  // Node creation helpers
  const createNodeAtPosition = (nodeType: string, position: { x: number; y: number }) => {
    if (editorSettings.value.snapToGrid) {
      position.x = Math.round(position.x / editorSettings.value.gridSize) * editorSettings.value.gridSize
      position.y = Math.round(position.y / editorSettings.value.gridSize) * editorSettings.value.gridSize
    }
    
    workflowStore.addNode(nodeType, position)
  }

  // Node positioning helpers
  const snapToGrid = (position: { x: number; y: number }) => {
    if (!editorSettings.value.snapToGrid) return position
    
    return {
      x: Math.round(position.x / editorSettings.value.gridSize) * editorSettings.value.gridSize,
      y: Math.round(position.y / editorSettings.value.gridSize) * editorSettings.value.gridSize
    }
  }

  // Auto-layout utilities
  const autoLayout = () => {
    if (!workflowStore.currentWorkflow) return

    const nodes = workflowStore.currentWorkflow.nodes
    const edges = workflowStore.currentWorkflow.edges

    // Simple hierarchical layout
    const rootNodes = nodes.filter(node => 
      !edges.some(edge => edge.target === node.id)
    )

    let currentY = 100
    const layerHeight = 150
    const nodeWidth = 200

    const layoutNode = (nodeId: string, x: number, y: number, visited: Set<string>) => {
      if (visited.has(nodeId)) return

      visited.add(nodeId)
      const node = nodes.find(n => n.id === nodeId)
      if (!node) return

      workflowStore.updateNodePosition(nodeId, snapToGrid({ x, y }))

      // Layout children
      const children = edges
        .filter(edge => edge.source === nodeId)
        .map(edge => edge.target)

      children.forEach((childId, index) => {
        const childX = x + nodeWidth + 100
        const childY = y + (index - children.length / 2 + 0.5) * layerHeight
        layoutNode(childId, childX, childY, visited)
      })
    }

    const visited = new Set<string>()
    rootNodes.forEach((node, index) => {
      layoutNode(node.id, 100, currentY + index * layerHeight, visited)
    })
  }

  // Workflow operations
  const saveWorkflow = async () => {
    if (!workflowStore.currentWorkflow) return
    
    try {
      // TODO: Implement API call to save workflow
      console.log('Saving workflow:', workflowStore.currentWorkflow.name)
    } catch (error) {
      console.error('Failed to save workflow:', error)
    }
  }

  const executeWorkflow = async () => {
    if (!workflowStore.currentWorkflow) return
    
    try {
      const execution = workflowStore.executeWorkflow(workflowStore.currentWorkflow.id!)
      console.log('Executing workflow:', execution.id)
    } catch (error) {
      console.error('Failed to execute workflow:', error)
    }
  }

  // Editor focus management
  const focusEditor = () => {
    isEditorFocused.value = true
  }

  const blurEditor = () => {
    isEditorFocused.value = false
  }

  // Validation helpers
  const validateWorkflow = () => {
    if (!workflowStore.currentWorkflow) return { isValid: false, errors: ['No workflow loaded'] }

    const errors: string[] = []
    const nodes = workflowStore.currentWorkflow.nodes
    const edges = workflowStore.currentWorkflow.edges

    // Check for trigger nodes
    const triggerNodes = nodes.filter(node => node.type.includes('trigger'))
    if (triggerNodes.length === 0) {
      errors.push('Workflow must have at least one trigger node')
    }

    // Check for orphaned nodes
    const connectedNodeIds = new Set([
      ...edges.map(e => e.source),
      ...edges.map(e => e.target)
    ])

    const orphanedNodes = nodes.filter(node => 
      !node.type.includes('trigger') && !connectedNodeIds.has(node.id)
    )

    if (orphanedNodes.length > 0) {
      errors.push(`${orphanedNodes.length} node(s) are not connected`)
    }

    // Check for circular dependencies
    const hasCircularDependency = () => {
      const visited = new Set<string>()
      const recursionStack = new Set<string>()

      const dfs = (nodeId: string): boolean => {
        if (recursionStack.has(nodeId)) return true
        if (visited.has(nodeId)) return false

        visited.add(nodeId)
        recursionStack.add(nodeId)

        const children = edges
          .filter(edge => edge.source === nodeId)
          .map(edge => edge.target)

        for (const child of children) {
          if (dfs(child)) return true
        }

        recursionStack.delete(nodeId)
        return false
      }

      return triggerNodes.some(node => dfs(node.id))
    }

    if (hasCircularDependency()) {
      errors.push('Workflow contains circular dependencies')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // Lifecycle
  onMounted(() => {
    setupKeyboardShortcuts()
  })

  onUnmounted(() => {
    removeKeyboardShortcuts()
  })

  return {
    // Settings
    editorSettings,
    
    // State
    editorRef,
    isEditorFocused,
    
    // Node operations
    createNodeAtPosition,
    snapToGrid,
    autoLayout,
    
    // Workflow operations
    saveWorkflow,
    executeWorkflow,
    validateWorkflow,
    
    // Focus management
    focusEditor,
    blurEditor
  }
}