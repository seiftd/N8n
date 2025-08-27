<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <h1 class="text-2xl font-bold text-primary-600">Sbaro</h1>
            </div>
          </div>

          <!-- Navigation -->
          <nav class="hidden md:block">
            <div class="ml-10 flex items-baseline space-x-4">
              <router-link to="/" class="text-gray-900 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                Dashboard
              </router-link>
              <router-link to="/workflows" class="text-gray-500 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                Workflows
              </router-link>
              <router-link to="/executions" class="text-gray-500 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                Executions
              </router-link>
              <router-link to="/credentials" class="text-gray-500 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                Credentials
              </router-link>
            </div>
          </nav>

          <!-- User menu -->
          <div class="flex items-center">
            <button class="bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700">
              Sign In
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.router-link-active {
  @apply text-primary-600;
}
</style>
