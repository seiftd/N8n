<template>
  <div class="h-screen flex flex-col">
    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex-1 flex items-center justify-center bg-gray-50"
    >
      <div class="text-center">
        <svg class="animate-spin h-12 w-12 text-primary-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Loading Workflow</h3>
        <p class="text-gray-600">Please wait while we load your workflow...</p>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="flex-1 flex items-center justify-center bg-gray-50"
    >
      <div class="text-center max-w-md">
        <svg class="h-16 w-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Error Loading Workflow</h3>
        <p class="text-gray-600 mb-6">{{ error }}</p>
        <div class="space-x-3">
          <button
            @click="$router.push('/workflows')"
            class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Back to Workflows
          </button>
          <button
            @click="loadWorkflow"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>

    <!-- Workflow Editor -->
    <WorkflowEditor
      v-else-if="workflowStore.currentWorkflow"
      class="flex-1"
    />

    <!-- No Workflow State -->
    <div
      v-else
      class="flex-1 flex items-center justify-center bg-gray-50"
    >
      <div class="text-center max-w-md">
        <svg class="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No Workflow Selected</h3>
        <p class="text-gray-600 mb-6">Select a workflow to edit or create a new one.</p>
        <div class="space-x-3">
          <button
            @click="$router.push('/workflows')"
            class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Browse Workflows
          </button>
          <button
            @click="createNewWorkflow"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Create New Workflow
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowStore } from '@/stores/workflow'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'

const route = useRoute()
const router = useRouter()
const workflowStore = useWorkflowStore()

const isLoading = ref(false)
const error = ref<string | null>(null)

const loadWorkflow = async () => {
  const workflowId = route.params.id as string
  if (!workflowId) return

  isLoading.value = true
  error.value = null

  try {
    // Try to find workflow in store first
    let workflow = workflowStore.workflows.find(w => w.id === workflowId)
    
    if (!workflow) {
      // TODO: Load from API
      // For now, create a new workflow if not found
      if (workflowId === 'new') {
        workflow = workflowStore.createWorkflow('New Workflow', 'Describe your workflow here')
        router.replace(`/workflows/${workflow.id}/edit`)
        return
      } else {
        throw new Error(`Workflow with ID "${workflowId}" not found`)
      }
    }

    workflowStore.setCurrentWorkflow(workflow)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load workflow'
    console.error('Failed to load workflow:', err)
  } finally {
    isLoading.value = false
  }
}

const createNewWorkflow = () => {
  router.push('/workflows/new/edit')
}

// Watch for route changes
watch(() => route.params.id, loadWorkflow, { immediate: true })

onMounted(() => {
  // Set page title
  document.title = 'Workflow Editor - Sbaro'
})
</script>