<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Workflows</h1>
        <p class="mt-2 text-gray-600">Manage and monitor your automation workflows</p>
      </div>
      
      <div class="flex space-x-3">
        <button
          @click="showCreateModal = true"
          class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Workflow
        </button>
        
        <button
          @click="showTemplatesModal = true"
          class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Browse Templates
        </button>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 sm:space-x-4">
      <!-- Search -->
      <div class="flex-1 max-w-lg">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search workflows..."
            class="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      <!-- Filters -->
      <div class="flex space-x-3">
        <select
          v-model="statusFilter"
          class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <select
          v-model="sortBy"
          class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="updatedAt">Last Updated</option>
          <option value="createdAt">Created</option>
          <option value="name">Name</option>
          <option value="status">Status</option>
        </select>
      </div>
    </div>

    <!-- Workflows Grid -->
    <div v-if="filteredWorkflows.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="workflow in filteredWorkflows"
        :key="workflow.id"
        class="bg-white rounded-lg shadow border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer"
        @click="openWorkflow(workflow)"
      >
        <!-- Card Header -->
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-lg font-medium text-gray-900 truncate">
                {{ workflow.name }}
              </h3>
              <p v-if="workflow.description" class="mt-1 text-sm text-gray-600 line-clamp-2">
                {{ workflow.description }}
              </p>
            </div>
            
            <!-- Status Badge -->
            <span
              :class="[
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ml-3',
                workflow.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : workflow.status === 'inactive'
                  ? 'bg-yellow-100 text-yellow-800'
                  : workflow.status === 'draft'
                  ? 'bg-gray-100 text-gray-800'
                  : 'bg-red-100 text-red-800'
              ]"
            >
              {{ workflow.status }}
            </span>
          </div>
        </div>

        <!-- Card Body -->
        <div class="p-6">
          <!-- Stats -->
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="text-center">
              <div class="text-2xl font-semibold text-gray-900">
                {{ workflow.nodes?.length || 0 }}
              </div>
              <div class="text-xs text-gray-600">Nodes</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-semibold text-gray-900">
                {{ getExecutionCount(workflow.id!) }}
              </div>
              <div class="text-xs text-gray-600">Executions</div>
            </div>
          </div>

          <!-- Last Updated -->
          <div class="text-sm text-gray-500">
            Updated {{ formatDate(workflow.updatedAt) }}
          </div>

          <!-- Tags -->
          <div v-if="workflow.tags" class="mt-3 flex flex-wrap gap-1">
            <span
              v-for="tag in workflow.tags.split(',')"
              :key="tag"
              class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800"
            >
              {{ tag.trim() }}
            </span>
          </div>
        </div>

        <!-- Card Actions -->
        <div class="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div class="flex space-x-2">
            <button
              @click.stop="executeWorkflow(workflow)"
              :disabled="workflow.status !== 'active'"
              class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9 5l3-3m6 0l3 3M7 7l3-3m6 0l3 3" />
              </svg>
              Execute
            </button>
          </div>

          <!-- Dropdown Menu -->
          <div class="relative">
            <button
              @click.stop="toggleMenu(workflow.id!)"
              class="p-1 text-gray-400 hover:text-gray-600"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            <!-- Dropdown Menu -->
            <div
              v-if="openMenuId === workflow.id"
              class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10"
            >
              <div class="py-1">
                <button
                  @click="editWorkflow(workflow)"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Edit
                </button>
                <button
                  @click="duplicateWorkflow(workflow)"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Duplicate
                </button>
                <button
                  @click="toggleWorkflowStatus(workflow)"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {{ workflow.status === 'active' ? 'Deactivate' : 'Activate' }}
                </button>
                <hr class="my-1" />
                <button
                  @click="deleteWorkflow(workflow)"
                  class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 mb-2">No workflows found</h3>
      <p class="text-gray-600 mb-6">
        {{ searchQuery || statusFilter ? 'Try adjusting your filters' : 'Get started by creating your first workflow' }}
      </p>
      <button
        v-if="!searchQuery && !statusFilter"
        @click="showCreateModal = true"
        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Create Workflow
      </button>
    </div>

    <!-- Create Workflow Modal -->
    <CreateWorkflowModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @created="onWorkflowCreated"
    />

    <!-- Templates Modal -->
    <TemplatesModal
      v-if="showTemplatesModal"
      @close="showTemplatesModal = false"
      @selected="onTemplateSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflowStore } from '@/stores/workflow'
import type { Workflow } from '@/stores/workflow'

import CreateWorkflowModal from '@/components/workflow/CreateWorkflowModal.vue'
import TemplatesModal from '@/components/workflow/TemplatesModal.vue'

const router = useRouter()
const workflowStore = useWorkflowStore()

// Local state
const searchQuery = ref('')
const statusFilter = ref('')
const sortBy = ref('updatedAt')
const showCreateModal = ref(false)
const showTemplatesModal = ref(false)
const openMenuId = ref<string | null>(null)

// Computed
const filteredWorkflows = computed(() => {
  let filtered = [...workflowStore.workflows]

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(w => 
      w.name.toLowerCase().includes(query) ||
      w.description?.toLowerCase().includes(query) ||
      w.tags?.toLowerCase().includes(query)
    )
  }

  // Apply status filter
  if (statusFilter.value) {
    filtered = filtered.filter(w => w.status === statusFilter.value)
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'status':
        return a.status.localeCompare(b.status)
      case 'createdAt':
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      case 'updatedAt':
      default:
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    }
  })

  return filtered
})

// Methods
const openWorkflow = (workflow: Workflow) => {
  workflowStore.setCurrentWorkflow(workflow)
  router.push(`/workflows/${workflow.id}/edit`)
}

const editWorkflow = (workflow: Workflow) => {
  openWorkflow(workflow)
  closeMenu()
}

const executeWorkflow = (workflow: Workflow) => {
  if (workflow.id) {
    workflowStore.executeWorkflow(workflow.id)
  }
  closeMenu()
}

const duplicateWorkflow = (workflow: Workflow) => {
  const duplicated = workflowStore.duplicateWorkflow(workflow)
  openWorkflow(duplicated)
  closeMenu()
}

const toggleWorkflowStatus = (workflow: Workflow) => {
  const newStatus = workflow.status === 'active' ? 'inactive' : 'active'
  workflow.status = newStatus
  closeMenu()
}

const deleteWorkflow = (workflow: Workflow) => {
  if (confirm(`Are you sure you want to delete "${workflow.name}"?`)) {
    const index = workflowStore.workflows.findIndex(w => w.id === workflow.id)
    if (index > -1) {
      workflowStore.workflows.splice(index, 1)
    }
  }
  closeMenu()
}

const toggleMenu = (workflowId: string) => {
  openMenuId.value = openMenuId.value === workflowId ? null : workflowId
}

const closeMenu = () => {
  openMenuId.value = null
}

const onWorkflowCreated = (workflow: Workflow) => {
  showCreateModal.value = false
  openWorkflow(workflow)
}

const onTemplateSelected = (template: any) => {
  showTemplatesModal.value = false
  // TODO: Create workflow from template
  console.log('Template selected:', template)
}

const getExecutionCount = (workflowId: string): number => {
  return workflowStore.executions.filter(e => e.workflowId === workflowId).length
}

const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Never'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
  
  return date.toLocaleDateString()
}

// Click outside to close menu
const handleClickOutside = (event: MouseEvent) => {
  if (!event.target || !(event.target as Element).closest('.relative')) {
    closeMenu()
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  
  // Create some sample workflows if none exist
  if (workflowStore.workflows.length === 0) {
    const sampleWorkflows = [
      {
        id: '1',
        name: 'Data Sync Pipeline',
        description: 'Automatically sync data between systems',
        status: 'active' as const,
        nodes: [
          {
            id: 'trigger-1',
            type: 'schedule-trigger',
            position: { x: 100, y: 100 },
            data: { label: 'Schedule Trigger' }
          },
          {
            id: 'http-1',
            type: 'http-request',
            position: { x: 400, y: 100 },
            data: { label: 'HTTP Request' }
          }
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'http-1'
          }
        ],
        tags: 'sync, automation',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '2',
        name: 'Email Campaign Automation',
        description: 'Send personalized emails based on user actions',
        status: 'active' as const,
        nodes: [],
        edges: [],
        tags: 'email, marketing',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '3',
        name: 'Customer Onboarding',
        description: 'Streamline new customer onboarding process',
        status: 'draft' as const,
        nodes: [],
        edges: [],
        tags: 'onboarding, customers',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]
    
    workflowStore.workflows.push(...sampleWorkflows)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>