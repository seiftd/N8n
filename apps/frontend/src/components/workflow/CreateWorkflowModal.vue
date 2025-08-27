<template>
  <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">Create New Workflow</h3>
          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Form -->
      <form @submit.prevent="createWorkflow">
        <div class="px-6 py-4 space-y-4">
          <!-- Workflow Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Workflow Name <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="Enter workflow name..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              @input="validateForm"
            />
            <p v-if="errors.name" class="mt-1 text-sm text-red-600">{{ errors.name }}</p>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              v-model="form.description"
              rows="3"
              placeholder="Describe what this workflow does..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <!-- Tags -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            <input
              v-model="form.tags"
              type="text"
              placeholder="automation, sync, email (comma-separated)"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-sm text-gray-500">
              Separate tags with commas to help organize your workflows
            </p>
          </div>

          <!-- Template Selection -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Start From
            </label>
            <div class="space-y-2">
              <label class="flex items-center">
                <input
                  v-model="form.startFrom"
                  type="radio"
                  value="blank"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                />
                <span class="ml-2 text-sm text-gray-700">Blank workflow</span>
              </label>
              <label class="flex items-center">
                <input
                  v-model="form.startFrom"
                  type="radio"
                  value="template"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                />
                <span class="ml-2 text-sm text-gray-700">Choose from template</span>
              </label>
            </div>
          </div>

          <!-- Template Selection -->
          <div v-if="form.startFrom === 'template'">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Template
            </label>
            <select
              v-model="form.templateId"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select a template...</option>
              <option
                v-for="template in templates"
                :key="template.id"
                :value="template.id"
              >
                {{ template.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
          <button
            type="button"
            @click="$emit('close')"
            class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="!isFormValid || isCreating"
            class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <span v-if="isCreating">Creating...</span>
            <span v-else>Create Workflow</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import type { Workflow } from '@/stores/workflow'

interface Template {
  id: string
  name: string
  description: string
  category: string
  nodes: any[]
  edges: any[]
}

interface Emits {
  (e: 'close'): void
  (e: 'created', workflow: Workflow): void
}

const emit = defineEmits<Emits>()
const workflowStore = useWorkflowStore()

// Form data
const form = ref({
  name: '',
  description: '',
  tags: '',
  startFrom: 'blank',
  templateId: ''
})

const errors = ref({
  name: ''
})

const isCreating = ref(false)

// Sample templates
const templates = ref<Template[]>([
  {
    id: 'http-to-webhook',
    name: 'HTTP to Webhook',
    description: 'Receive HTTP request and forward to webhook',
    category: 'Integration',
    nodes: [],
    edges: []
  },
  {
    id: 'data-sync',
    name: 'Data Synchronization',
    description: 'Sync data between two systems',
    category: 'Data',
    nodes: [],
    edges: []
  },
  {
    id: 'email-automation',
    name: 'Email Automation',
    description: 'Automated email campaigns',
    category: 'Marketing',
    nodes: [],
    edges: []
  }
])

// Computed
const isFormValid = computed(() => {
  return form.value.name.trim().length > 0 && !errors.value.name
})

// Methods
const validateForm = () => {
  errors.value.name = ''
  
  if (!form.value.name.trim()) {
    errors.value.name = 'Workflow name is required'
  } else if (form.value.name.trim().length < 3) {
    errors.value.name = 'Workflow name must be at least 3 characters'
  } else if (form.value.name.trim().length > 100) {
    errors.value.name = 'Workflow name must be less than 100 characters'
  }
  
  // Check for duplicate names
  const exists = workflowStore.workflows.some(w => 
    w.name.toLowerCase() === form.value.name.trim().toLowerCase()
  )
  if (exists) {
    errors.value.name = 'A workflow with this name already exists'
  }
}

const createWorkflow = async () => {
  if (!isFormValid.value) return

  isCreating.value = true

  try {
    let workflow: Workflow

    if (form.value.startFrom === 'template' && form.value.templateId) {
      // Create from template
      const template = templates.value.find(t => t.id === form.value.templateId)
      if (template) {
        workflow = workflowStore.createWorkflow(
          form.value.name.trim(),
          form.value.description.trim() || template.description
        )
        
        // Add template nodes and edges
        workflow.nodes = [...template.nodes]
        workflow.edges = [...template.edges]
        workflow.tags = form.value.tags.trim() || template.category.toLowerCase()
      } else {
        workflow = workflowStore.createWorkflow(
          form.value.name.trim(),
          form.value.description.trim()
        )
      }
    } else {
      // Create blank workflow
      workflow = workflowStore.createWorkflow(
        form.value.name.trim(),
        form.value.description.trim()
      )
    }

    if (form.value.tags.trim()) {
      workflow.tags = form.value.tags.trim()
    }

    emit('created', workflow)
  } catch (error) {
    console.error('Failed to create workflow:', error)
    // TODO: Show error message
  } finally {
    isCreating.value = false
  }
}
</script>