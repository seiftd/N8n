<script setup lang="ts">
import { ref } from 'vue'

const stats = ref([
  { name: 'Total Workflows', value: '12', change: '+2.1%', trend: 'up' },
  { name: 'Active Workflows', value: '8', change: '+1.4%', trend: 'up' },
  { name: 'Executions Today', value: '156', change: '+12.3%', trend: 'up' },
  { name: 'Success Rate', value: '98.2%', change: '+0.5%', trend: 'up' },
])

const recentWorkflows = ref([
  { id: '1', name: 'Data Sync Pipeline', status: 'active', lastRun: '2 hours ago' },
  { id: '2', name: 'Email Campaign Automation', status: 'active', lastRun: '5 hours ago' },
  { id: '3', name: 'Customer Onboarding', status: 'inactive', lastRun: '1 day ago' },
])
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Welcome Section -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Welcome to Sbaro</h1>
      <p class="mt-2 text-gray-600">Your powerful workflow automation platform</p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div
        v-for="stat in stats"
        :key="stat.name"
        class="bg-white rounded-lg shadow p-6"
      >
        <div class="flex items-center">
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-600">{{ stat.name }}</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stat.value }}</p>
          </div>
          <div class="flex items-center text-sm text-green-600">
            <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            {{ stat.change }}
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Recent Workflows -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-900">Recent Workflows</h2>
        </div>
        <div class="divide-y divide-gray-200">
          <div
            v-for="workflow in recentWorkflows"
            :key="workflow.id"
            class="p-6 hover:bg-gray-50"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <h3 class="text-sm font-medium text-gray-900">{{ workflow.name }}</h3>
                <p class="text-sm text-gray-500">Last run: {{ workflow.lastRun }}</p>
              </div>
              <div class="flex items-center">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    workflow.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  ]"
                >
                  {{ workflow.status }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="p-6 bg-gray-50">
          <router-link
            to="/workflows"
            class="text-primary-600 hover:text-primary-500 text-sm font-medium"
          >
            View all workflows →
          </router-link>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div class="p-6 space-y-4">
          <button class="w-full bg-primary-600 text-white px-4 py-3 rounded-md text-sm font-medium hover:bg-primary-700 flex items-center justify-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create New Workflow
          </button>
          
          <button class="w-full bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center justify-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Browse Templates
          </button>
          
          <button class="w-full bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center justify-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Import Workflow
          </button>
          
          <button class="w-full bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center justify-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            View Analytics
          </button>
        </div>
      </div>
    </div>

    <!-- Getting Started Section -->
    <div class="mt-12 bg-primary-50 rounded-lg p-6">
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-sm font-medium text-primary-800">
            🎉 Sbaro Foundation Complete!
          </h3>
          <div class="mt-2 text-sm text-primary-700">
            <p>Phase 1 is complete! We've successfully built:</p>
            <ul class="mt-2 space-y-1">
              <li>• Complete authentication system with JWT</li>
              <li>• Full database schema for workflows, nodes, and executions</li>
              <li>• RESTful API with comprehensive workflow management</li>
              <li>• Modern Vue 3 frontend with Tailwind CSS</li>
              <li>• Docker-based development environment</li>
            </ul>
            <p class="mt-2">Ready to move to Phase 2: Visual Builder & Core Nodes!</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
