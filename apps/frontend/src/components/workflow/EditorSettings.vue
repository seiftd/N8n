<template>
  <div class="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-medium text-gray-900">Editor Settings</h3>
      <button
        @click="$emit('close')"
        class="text-gray-400 hover:text-gray-600"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Settings Form -->
    <div class="space-y-4">
      <!-- Grid Settings -->
      <div>
        <h4 class="text-xs font-medium text-gray-700 mb-2">Grid & Snapping</h4>
        <div class="space-y-3">
          <!-- Snap to Grid -->
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Snap to Grid</label>
            <input
              v-model="localSettings.snapToGrid"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              @change="updateSettings"
            />
          </div>

          <!-- Grid Size -->
          <div v-if="localSettings.snapToGrid">
            <label class="block text-xs font-medium text-gray-700 mb-1">
              Grid Size (px)
            </label>
            <input
              v-model.number="localSettings.gridSize"
              type="number"
              min="5"
              max="50"
              step="5"
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              @input="updateSettings"
            />
          </div>
        </div>
      </div>

      <!-- UI Elements -->
      <div>
        <h4 class="text-xs font-medium text-gray-700 mb-2">UI Elements</h4>
        <div class="space-y-3">
          <!-- Show Minimap -->
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Show Minimap</label>
            <input
              v-model="localSettings.showMinimap"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              @change="updateSettings"
            />
          </div>

          <!-- Show Controls -->
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Show Controls</label>
            <input
              v-model="localSettings.showControls"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              @change="updateSettings"
            />
          </div>
        </div>
      </div>

      <!-- Interaction -->
      <div>
        <h4 class="text-xs font-medium text-gray-700 mb-2">Interaction</h4>
        <div class="space-y-3">
          <!-- Enable Panning -->
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Enable Panning</label>
            <input
              v-model="localSettings.enablePanning"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              @change="updateSettings"
            />
          </div>

          <!-- Enable Zooming -->
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Enable Zooming</label>
            <input
              v-model="localSettings.enableZooming"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              @change="updateSettings"
            />
          </div>

          <!-- Multi Selection -->
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Multi Selection</label>
            <input
              v-model="localSettings.multiSelection"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              @change="updateSettings"
            />
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="pt-3 border-t border-gray-200">
        <div class="space-y-2">
          <button
            @click="resetToDefaults"
            class="w-full px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Reset to Defaults
          </button>
          
          <button
            @click="saveAsDefault"
            class="w-full px-3 py-2 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
          >
            Save as Default
          </button>
        </div>
      </div>
    </div>

    <!-- Keyboard Shortcuts Info -->
    <div class="mt-6 pt-4 border-t border-gray-200">
      <h4 class="text-xs font-medium text-gray-700 mb-2">Keyboard Shortcuts</h4>
      <div class="text-xs text-gray-600 space-y-1">
        <div class="flex justify-between">
          <span>Copy</span>
          <span class="font-mono">Ctrl+C</span>
        </div>
        <div class="flex justify-between">
          <span>Paste</span>
          <span class="font-mono">Ctrl+V</span>
        </div>
        <div class="flex justify-between">
          <span>Cut</span>
          <span class="font-mono">Ctrl+X</span>
        </div>
        <div class="flex justify-between">
          <span>Delete</span>
          <span class="font-mono">Del</span>
        </div>
        <div class="flex justify-between">
          <span>Select All</span>
          <span class="font-mono">Ctrl+A</span>
        </div>
        <div class="flex justify-between">
          <span>Undo</span>
          <span class="font-mono">Ctrl+Z</span>
        </div>
        <div class="flex justify-between">
          <span>Redo</span>
          <span class="font-mono">Ctrl+Y</span>
        </div>
        <div class="flex justify-between">
          <span>Duplicate</span>
          <span class="font-mono">Ctrl+D</span>
        </div>
        <div class="flex justify-between">
          <span>Save</span>
          <span class="font-mono">Ctrl+S</span>
        </div>
        <div class="flex justify-between">
          <span>Execute</span>
          <span class="font-mono">Ctrl+Enter</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { EditorSettings } from '@/composables/useWorkflowEditor'

interface Props {
  modelValue: EditorSettings
}

interface Emits {
  (e: 'update:modelValue', value: EditorSettings): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Local copy of settings
const localSettings = ref<EditorSettings>({ ...props.modelValue })

// Default settings
const defaultSettings: EditorSettings = {
  snapToGrid: true,
  gridSize: 15,
  showMinimap: true,
  showControls: true,
  enablePanning: true,
  enableZooming: true,
  multiSelection: true
}

// Methods
const updateSettings = () => {
  emit('update:modelValue', { ...localSettings.value })
}

const resetToDefaults = () => {
  localSettings.value = { ...defaultSettings }
  updateSettings()
}

const saveAsDefault = () => {
  // Save current settings to localStorage
  localStorage.setItem('sbaro-editor-settings', JSON.stringify(localSettings.value))
  
  // Show confirmation (you could add a toast notification here)
  console.log('Settings saved as default')
}

// Load settings from localStorage on mount
const loadSavedSettings = () => {
  try {
    const saved = localStorage.getItem('sbaro-editor-settings')
    if (saved) {
      const parsedSettings = JSON.parse(saved)
      localSettings.value = { ...defaultSettings, ...parsedSettings }
      updateSettings()
    }
  } catch (error) {
    console.warn('Failed to load saved settings:', error)
  }
}

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  localSettings.value = { ...newValue }
}, { deep: true })

// Load saved settings on component mount
loadSavedSettings()
</script>