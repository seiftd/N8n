<template>
  <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">Workflow Templates</h3>
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

      <!-- Search and Filters -->
      <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 sm:space-x-4">
          <!-- Search -->
          <div class="flex-1 max-w-lg">
            <div class="relative">
              <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search templates..."
                class="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <!-- Category Filter -->
          <select
            v-model="selectedCategory"
            class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Categories</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </div>
      </div>

      <!-- Templates Grid -->
      <div class="flex-1 overflow-y-auto p-6">
        <div v-if="filteredTemplates.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="template in filteredTemplates"
            :key="template.id"
            class="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all duration-200 cursor-pointer"
            @click="selectTemplate(template)"
          >
            <!-- Template Image/Icon -->
            <div
              :style="{ backgroundColor: template.color || '#6B7280' }"
              class="h-32 rounded-t-lg flex items-center justify-center"
            >
              <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>

            <!-- Template Info -->
            <div class="p-4">
              <div class="flex items-start justify-between mb-2">
                <h4 class="text-sm font-medium text-gray-900 truncate">
                  {{ template.name }}
                </h4>
                <span
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ml-2"
                >
                  {{ template.category }}
                </span>
              </div>
              
              <p class="text-sm text-gray-600 mb-3 line-clamp-2">
                {{ template.description }}
              </p>

              <!-- Template Stats -->
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>{{ template.nodeCount || 0 }} nodes</span>
                <span>{{ template.difficulty }}</span>
              </div>

              <!-- Template Tags -->
              <div v-if="template.tags?.length" class="mt-3 flex flex-wrap gap-1">
                <span
                  v-for="tag in template.tags.slice(0, 3)"
                  :key="tag"
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                >
                  {{ tag }}
                </span>
                <span
                  v-if="template.tags.length > 3"
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600"
                >
                  +{{ template.tags.length - 3 }}
                </span>
              </div>
            </div>

            <!-- Use Template Button -->
            <div class="px-4 pb-4">
              <button
                @click.stop="useTemplate(template)"
                class="w-full px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                Use This Template
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-12">
          <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
          <p class="text-gray-600">Try adjusting your search or category filter.</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-600">
            {{ filteredTemplates.length }} template{{ filteredTemplates.length !== 1 ? 's' : '' }} available
          </p>
          <div class="flex space-x-3">
            <button
              @click="$emit('close')"
              class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              @click="createBlankWorkflow"
              class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-gray-600 hover:bg-gray-700"
            >
              Start from Blank
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Template {
  id: string
  name: string
  description: string
  category: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  nodeCount?: number
  color?: string
  tags?: string[]
  nodes?: any[]
  edges?: any[]
  featured?: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'selected', template: Template): void
}

const emit = defineEmits<Emits>()

// Local state
const searchQuery = ref('')
const selectedCategory = ref('')

// Sample templates
const templates = ref<Template[]>([
  {
    id: 'http-webhook-forwarder',
    name: 'HTTP to Webhook Forwarder',
    description: 'Receive HTTP requests and forward them to external webhooks with data transformation.',
    category: 'Integration',
    difficulty: 'Beginner',
    nodeCount: 3,
    color: '#3B82F6',
    tags: ['http', 'webhook', 'api', 'integration'],
    featured: true
  },
  {
    id: 'email-automation',
    name: 'Email Campaign Automation',
    description: 'Automated email campaigns with personalization, scheduling, and analytics tracking.',
    category: 'Marketing',
    difficulty: 'Intermediate',
    nodeCount: 8,
    color: '#EF4444',
    tags: ['email', 'marketing', 'automation', 'campaigns']
  },
  {
    id: 'data-sync-pipeline',
    name: 'Data Synchronization Pipeline',
    description: 'Sync data between databases, APIs, and file systems with error handling and retries.',
    category: 'Data',
    difficulty: 'Advanced',
    nodeCount: 12,
    color: '#10B981',
    tags: ['data', 'sync', 'database', 'etl']
  },
  {
    id: 'slack-notifications',
    name: 'Slack Notification System',
    description: 'Send automated notifications to Slack channels based on various triggers and conditions.',
    category: 'Notifications',
    difficulty: 'Beginner',
    nodeCount: 4,
    color: '#8B5CF6',
    tags: ['slack', 'notifications', 'alerts', 'team']
  },
  {
    id: 'ai-content-moderation',
    name: 'AI Content Moderation',
    description: 'Automatically moderate user-generated content using AI/ML models and custom rules.',
    category: 'AI/ML',
    difficulty: 'Advanced',
    nodeCount: 10,
    color: '#F59E0B',
    tags: ['ai', 'moderation', 'ml', 'content']
  },
  {
    id: 'customer-onboarding',
    name: 'Customer Onboarding Flow',
    description: 'Streamline new customer onboarding with automated emails, account setup, and follow-ups.',
    category: 'CRM',
    difficulty: 'Intermediate',
    nodeCount: 15,
    color: '#06B6D4',
    tags: ['crm', 'onboarding', 'customers', 'automation']
  },
  {
    id: 'file-processing',
    name: 'File Processing Pipeline',
    description: 'Process uploaded files, extract data, validate, and store in databases or cloud storage.',
    category: 'Data',
    difficulty: 'Intermediate',
    nodeCount: 7,
    color: '#84CC16',
    tags: ['files', 'processing', 'storage', 'validation']
  },
  {
    id: 'social-media-monitor',
    name: 'Social Media Monitoring',
    description: 'Monitor social media mentions, analyze sentiment, and trigger alerts for brand management.',
    category: 'Marketing',
    difficulty: 'Advanced',
    nodeCount: 11,
    color: '#EC4899',
    tags: ['social', 'monitoring', 'sentiment', 'brand']
  },
  {
    id: 'inventory-management',
    name: 'Inventory Management',
    description: 'Automate inventory tracking, reorder notifications, and stock level management.',
    category: 'E-commerce',
    difficulty: 'Intermediate',
    nodeCount: 9,
    color: '#F97316',
    tags: ['inventory', 'ecommerce', 'stock', 'management']
  }
])

// Computed
const categories = computed(() => {
  const cats = [...new Set(templates.value.map(t => t.category))]
  return cats.sort()
})

const filteredTemplates = computed(() => {
  let filtered = templates.value

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }

  // Apply category filter
  if (selectedCategory.value) {
    filtered = filtered.filter(t => t.category === selectedCategory.value)
  }

  // Sort by featured first, then alphabetically
  return filtered.sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return a.name.localeCompare(b.name)
  })
})

// Methods
const selectTemplate = (template: Template) => {
  console.log('Template selected:', template.name)
}

const useTemplate = (template: Template) => {
  emit('selected', template)
}

const createBlankWorkflow = () => {
  emit('selected', {
    id: 'blank',
    name: 'Blank Workflow',
    description: 'Start with an empty workflow',
    category: 'Custom',
    difficulty: 'Beginner'
  })
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>