<template>
  <div class="tag-manager">
    <div class="add-tag-form" v-if="selectedRange">
      <h3>Add New Tag</h3>
      <p class="selected-range">
        Selected: {{ formatTime(selectedRange.start) }} - {{ formatTime(selectedRange.end) }}
      </p>
      
      <div class="form-row">
        <div class="form-group">
          <label>Start Time:</label>
          <input 
            v-model="newTag.startTime" 
            type="time" 
            step="60"
          />
        </div>
        
        <div class="form-group">
          <label>End Time:</label>
          <input 
            v-model="newTag.endTime" 
            type="time" 
            step="60"
          />
        </div>
      </div>
      
      <div class="form-group">
        <label>Label:</label>
        <input 
          v-model="newTag.label" 
          type="text" 
          list="label-suggestions"
          placeholder="e.g., Fridge, Water Heater, Standby"
          @keyup.enter="submitTag"
        />
        <datalist id="label-suggestions">
          <option v-for="label in existingLabels" :key="label" :value="label" />
        </datalist>
      </div>
      
      <div class="form-actions">
        <button @click="submitTag" :disabled="!newTag.label">
          Add Tag
        </button>
        <button @click="cancel" class="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
    
    <!-- Sensor Subtraction Section -->
    <div class="sensor-subtraction" v-if="availableSensors.length > 0">
      <h3>Subtract Sensors</h3>
      <div class="form-group">
        <label>Add sensor to subtract:</label>
        <select v-model="selectedSensorToAdd" @change="addSensorToSubtract">
          <option value="">-- Select a sensor --</option>
          <option 
            v-for="sensor in availableSensors" 
            :key="sensor.entity_id"
            :value="sensor.entity_id"
            :disabled="subtractedSensors.some(s => s.entity_id === sensor.entity_id)"
          >
            {{ sensor.friendly_name || sensor.entity_id }}
          </option>
        </select>
      </div>
      
      <div v-if="subtractedSensors.length > 0" class="subtracted-sensors-list">
        <h4>Active Subtractions ({{ subtractedSensors.length }})</h4>
        <div 
          v-for="sensor in subtractedSensors" 
          :key="sensor.entity_id"
          class="sensor-item"
        >
          <span class="sensor-name">{{ sensor.friendly_name || sensor.entity_id }}</span>
          <button 
            @click="removeSensorSubtraction(sensor.entity_id)"
            class="btn-remove"
            title="Remove subtraction"
          >
            ✕
          </button>
        </div>
      </div>
    </div>


    
    <div class="sticky-header">
      <div class="header-row">
        <h2 @click="toggleAccordion" class="accordion-header">
          <span class="accordion-icon">{{ isExpanded ? '▼' : '▶' }}</span>
          Power Tags
        </h2>
        <button @click="showSettings = true" class="btn-settings" title="Sensor Settings">
          ⚙️
        </button>
      </div>
    </div>
    
    <div class="scrollable-content" v-show="isExpanded">
    <!-- Tags List -->
    <div class="tags-list">
      <div class="tags-header">
        <h3>Tagged Periods ({{ filteredTags.length }})</h3>
        <div v-if="predictionCount > 0" class="prediction-actions">
          <button @click="acceptAllPredictions" class="btn-accept-predictions" title="Accept all predictions">
            ✓ Accept {{ predictionCount }} predictions
          </button>
          <button @click="clearAllPredictions" class="btn-clear-predictions" title="Remove all predictions">
            ✕ Clear predictions
          </button>
        </div>
      </div>
      
      <div v-if="filteredTags.length === 0" class="empty-state">
        No tags for this day. Select a time range on the chart to add a tag.
      </div>
      
      <div v-else class="tags-container">
        <div 
          v-for="tag in filteredTags" 
          :key="tag.id" 
          class="tag-item"
          :class="{ 'tag-prediction': tag.isPrediction }"
        >
          <div class="tag-info">
            <span class="tag-time">
              {{ tag.startTime }} - {{ tag.endTime }}
            </span>
            <span class="tag-label">
              {{ tag.label }}
              <span v-if="tag.isPrediction && tag.confidence" class="confidence-badge">
                {{ (tag.confidence * 100).toFixed(0) }}%
              </span>
            </span>
          </div>
          <button 
            @click="deleteTagHandler(tag.id)" 
            :class="['btn-delete', { 'confirm-delete': tagToDelete === tag.id }]"
            :title="tagToDelete === tag.id ? 'Click again to confirm' : 'Delete tag'"
          >
            {{ tagToDelete === tag.id ? '⚠' : '✕' }}
          </button>
        </div>
      </div>
    </div>
    </div>
    
    <!-- Settings Dialog -->
    <div v-if="showSettings" class="dialog-overlay" @click.self="showSettings = false">
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>Settings</h3>
          <button @click="showSettings = false" class="btn-close">✕</button>
        </div>
        
        <!-- Tab Navigation -->
        <div class="dialog-tabs">
          <button 
            :class="['tab-button', { active: activeSettingsTab === 'sensors' }]"
            @click="activeSettingsTab = 'sensors'"
          >
            Subtract Sensors
          </button>
          <button 
            :class="['tab-button', { active: activeSettingsTab === 'models' }]"
            @click="activeSettingsTab = 'models'"
          >
            Subtract Models
          </button>
        </div>
        
        <div class="dialog-body">
          <!-- Sensors Tab -->
          <div v-show="activeSettingsTab === 'sensors'" class="tab-content">
            <p class="info-text">
              Select power sensors from your Home Assistant to subtract their consumption 
              from the main chart. This helps identify remaining/unaccounted power usage.
            </p>
            
            <div v-if="loadingSensors" class="loading-state">
              Loading sensors...
            </div>
            
            <div v-else-if="sensorError" class="error-state">
              {{ sensorError }}
            </div>
            
            <div v-else-if="powerSensors.length === 0" class="empty-state">
              No power sensors found in Home Assistant.
            </div>
            
            <div v-else class="sensors-list">
              <h4>Available Power Sensors ({{ powerSensors.length }})</h4>
              <div class="sensor-grid">
                <div 
                  v-for="sensor in powerSensors" 
                  :key="sensor.entity_id"
                  class="sensor-card"
                  :class="{ 'sensor-selected': selectedSensors.has(sensor.entity_id) }"
                  @click="toggleSensorSelection(sensor.entity_id)"
                >
                  <div class="sensor-checkbox">
                    <input 
                      type="checkbox" 
                      :checked="selectedSensors.has(sensor.entity_id)"
                      @change="toggleSensorSelection(sensor.entity_id)"
                      @click.stop
                    />
                  </div>
                  <div class="sensor-details">
                    <div class="sensor-friendly-name">
                      {{ sensor.friendly_name || sensor.entity_id }}
                    </div>
                    <div class="sensor-entity-id">{{ sensor.entity_id }}</div>
                    <div class="sensor-state" v-if="sensor.state">
                      Current: {{ parseFloat(sensor.state).toFixed(1) }} W
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Models Tab -->
          <div v-show="activeSettingsTab === 'models'" class="tab-content">
            <p class="info-text">
              Subtract predictions from seq2point trained models (like virtual sensors).
              This removes the predicted consumption from trained models to see remaining power.
            </p>
            
            <div v-if="loadingModels" class="loading-state">
              Loading models...
            </div>
            
            <div v-else-if="availableModels.length === 0" class="empty-state">
              No trained models found. Train models using: <code>node server/ml/seq2point-train.js "appliance_name"</code>
            </div>
            
            <div v-else class="models-list">
              <h4>Available Trained Models ({{ availableModels.length }})</h4>
              <div class="model-grid">
                <div 
                  v-for="model in availableModels" 
                  :key="model"
                  class="model-card"
                  :class="{ 'model-selected': selectedModels.has(model) }"
                  @click="toggleModelSelection(model)"
                >
                  <div class="model-checkbox">
                    <input 
                      type="checkbox" 
                      :checked="selectedModels.has(model)"
                      @change="toggleModelSelection(model)"
                      @click.stop
                    />
                  </div>
                  <div class="model-details">
                    <div class="model-name">{{ model }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button @click="applySettings" class="btn-primary">
            Apply Settings
          </button>
          <button @click="showSettings = false" class="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
    
    <!-- Toast Notification -->
    <div v-if="toast.show" class="toast" :class="`toast-${toast.type}`">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { format } from 'date-fns'
import { getEntities, fetchHistory } from '../services/homeassistant'

const props = defineProps({
  tags: {
    type: Array,
    default: () => []
  },
  selectedRange: {
    type: Object,
    default: null
  },
  currentDate: {
    type: String,
    required: true
  },
  showToast: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['add-tag', 'delete-tag', 'clear-selection', 'sensors-changed', 'models-changed'])

// Toast notifications
const toast = ref({
  show: false,
  message: '',
  type: 'success' // 'success', 'error', 'info'
})

const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// Accordion state - collapsed by default
const isExpanded = ref(false)

// Settings dialog
const showSettings = ref(false)
const activeSettingsTab = ref('sensors')
const loadingSensors = ref(false)
const sensorError = ref('')
const powerSensors = ref([])
const selectedSensors = ref(new Set())
const availableSensors = ref([])
const subtractedSensors = ref([])
const selectedSensorToAdd = ref('')

// Model subtraction state
const availableModels = ref([])
const subtractedModels = ref([])
const selectedModels = ref(new Set())
const selectedModelToAdd = ref('')
const loadingModels = ref(false)

// Delete confirmation
const tagToDelete = ref(null)

const toggleAccordion = () => {
  isExpanded.value = !isExpanded.value
}

// Computed for selected sensors count
const selectedSensorsCount = computed(() => selectedSensors.value.size)

const newTag = ref({
  startTime: '',
  endTime: '',
  label: ''
})

// Filtered tags for current date
const filteredTags = computed(() => {
  return props.tags
    .filter(tag => tag.date === props.currentDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
})

// Count predictions
const predictionCount = computed(() => {
  return filteredTags.value.filter(tag => tag.isPrediction).length
})

// Get unique labels from all tags for autocomplete
const existingLabels = computed(() => {
  const labels = new Set(props.tags.map(tag => tag.label))
  return Array.from(labels).sort()
})

// Statistics
const uniqueLabels = computed(() => {
  return new Set(filteredTags.value.map(t => t.label))
})

const labelCounts = computed(() => {
  const counts = new Map()
  filteredTags.value.forEach(tag => {
    counts.set(tag.label, (counts.get(tag.label) || 0) + 1)
  })
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
})

// Format time for display
const formatTime = (date) => {
  return format(new Date(date), 'HH:mm')
}

// Watch for range selection
watch(() => props.selectedRange, (range) => {
  if (range) {
    newTag.value.startTime = format(new Date(range.start), 'HH:mm')
    newTag.value.endTime = format(new Date(range.end), 'HH:mm')
    newTag.value.label = ''
  }
})

// Submit new tag
const submitTag = () => {
  if (!newTag.value.label.trim()) return
  
  emit('add-tag', {
    startTime: newTag.value.startTime,
    endTime: newTag.value.endTime,
    label: newTag.value.label.trim()
  })
  
  // Reset form
  newTag.value = {
    startTime: '',
    endTime: '',
    label: ''
  }
}

// Cancel tag creation
const cancel = () => {
  newTag.value = {
    startTime: '',
    endTime: '',
    label: ''
  }
  emit('clear-selection')
}

// Delete tag
const deleteTagHandler = (tagId) => {
  if (tagToDelete.value === tagId) {
    // Second click confirms deletion
    emit('delete-tag', tagId)
    tagToDelete.value = null
    if (props.showToast) {
      props.showToast('Tag deleted successfully', 'success')
    }
  } else {
    // First click - mark for deletion
    tagToDelete.value = tagId
    if (props.showToast) {
      props.showToast('Click again to confirm deletion', 'info')
    }
    // Reset after 3 seconds
    setTimeout(() => {
      if (tagToDelete.value === tagId) {
        tagToDelete.value = null
      }
    }, 3000)
  }
}

// Accept all predictions - convert them to regular tags
const acceptAllPredictions = () => {
  const predictions = filteredTags.value.filter(tag => tag.isPrediction)
  const count = predictions.length
  
  predictions.forEach(pred => {
    // Delete the prediction
    emit('delete-tag', pred.id)
    // Re-add as confirmed tag
    emit('add-tag', {
      startTime: pred.startTime,
      endTime: pred.endTime,
      label: pred.label,
      isPrediction: false
    })
  })
  
  showToast(`${count} predictions accepted`, 'success')
}

// Clear all predictions
const clearAllPredictions = () => {
  const predictions = filteredTags.value.filter(tag => tag.isPrediction)
  const count = predictions.length
  
  predictions.forEach(pred => {
    emit('delete-tag', pred.id)
  })
  
  showToast(`${count} predictions cleared`, 'info')
}

// Load sensors from Home Assistant
const loadPowerSensors = async () => {
  loadingSensors.value = true
  sensorError.value = ''
  
  try {
    const entities = await getEntities('', '')
    
    // Filter for power sensors (in watts)
    powerSensors.value = entities.filter(entity => {
      const entityId = entity.entity_id
      const entityIdLower = entityId.toLowerCase()
      const unitOfMeasurement = entity.attributes?.unit_of_measurement?.toLowerCase()
      
      // Skip sensors that start with "number." domain
      if (entityId.startsWith('number.')) {
        return false
      }
      
      // Check if it's a power sensor
      return (
        (entityIdLower.includes('power') || entityIdLower.includes('watt') || entityIdLower.includes('consumption')) &&
        (unitOfMeasurement === 'w' || unitOfMeasurement === 'watt' || unitOfMeasurement === 'watts') &&
        entity.state !== 'unavailable' &&
        entity.state !== 'unknown'
      )
    }).map(entity => ({
      entity_id: entity.entity_id,
      friendly_name: entity.attributes?.friendly_name || entity.entity_id,
      state: entity.state,
      unit: entity.attributes?.unit_of_measurement
    }))
    
  } catch (error) {
    console.error('Failed to load sensors:', error)
    sensorError.value = error.message || 'Failed to load sensors from Home Assistant'
  } finally {
    loadingSensors.value = false
  }
}

// Toggle sensor selection
const toggleSensorSelection = (entityId) => {
  const newSet = new Set(selectedSensors.value)
  if (newSet.has(entityId)) {
    newSet.delete(entityId)
  } else {
    newSet.add(entityId)
  }
  selectedSensors.value = newSet
}

// Toggle model selection
const toggleModelSelection = (modelName) => {
  const newSet = new Set(selectedModels.value)
  if (newSet.has(modelName)) {
    newSet.delete(modelName)
  } else {
    newSet.add(modelName)
  }
  selectedModels.value = newSet
}

// Apply settings (both sensors and models)
const applySettings = () => {
  // Apply sensor selections
  availableSensors.value = powerSensors.value.filter(sensor => 
    selectedSensors.value.has(sensor.entity_id)
  )
  
  console.log('Applied sensors:', availableSensors.value.map(s => s.entity_id))
  localStorage.setItem('availableSensors', JSON.stringify(availableSensors.value))
  
  // Update subtracted sensors list
  subtractedSensors.value = availableSensors.value
  localStorage.setItem('subtractedSensors', JSON.stringify(subtractedSensors.value))
  
  // Apply model selections
  subtractedModels.value = Array.from(selectedModels.value)
  console.log('Applied models:', subtractedModels.value)
  localStorage.setItem('subtractedModels', JSON.stringify(subtractedModels.value))
  
  showSettings.value = false
  
  // Emit changes
  emit('sensors-changed', subtractedSensors.value.map(s => s.entity_id))
  emit('models-changed', subtractedModels.value)
}

// Add sensor to subtract
const addSensorToSubtract = async () => {
  console.log('🔵 addSensorToSubtract called')
  console.log('selectedSensorToAdd.value:', selectedSensorToAdd.value)
  console.log('availableSensors:', availableSensors.value)
  
  if (!selectedSensorToAdd.value) {
    console.log('❌ No sensor selected')
    return
  }
  
  const sensor = availableSensors.value.find(s => s.entity_id === selectedSensorToAdd.value)
  if (!sensor) {
    console.log('❌ Sensor not found in availableSensors:', selectedSensorToAdd.value)
    showToast('Sensor not found', 'error')
    return
  }
  
  console.log('✅ Found sensor:', sensor)
  
  // Check if already added
  if (subtractedSensors.value.some(s => s.entity_id === sensor.entity_id)) {
    console.log('⚠️ Sensor already in list')
    showToast('Sensor already added', 'info')
    selectedSensorToAdd.value = ''
    return
  }
  
  // Add to subtracted list
  subtractedSensors.value.push(sensor)
  console.log('📝 Subtracted sensors list:', subtractedSensors.value.map(s => s.entity_id))
  
  // Save to localStorage
  localStorage.setItem('subtractedSensors', JSON.stringify(subtractedSensors.value))
  
  // Show feedback
  showToast(`Added ${sensor.friendly_name || sensor.entity_id} for subtraction`, 'success')
  
  // Fetch history and emit event
  await fetchAndSubtractSensorData(sensor.entity_id)
  
  selectedSensorToAdd.value = ''
}

// Remove sensor subtraction
const removeSensorSubtraction = (entityId) => {
  const sensor = subtractedSensors.value.find(s => s.entity_id === entityId)
  const sensorName = sensor?.friendly_name || entityId
  
  subtractedSensors.value = subtractedSensors.value.filter(s => s.entity_id !== entityId)
  
  // Save to localStorage
  localStorage.setItem('subtractedSensors', JSON.stringify(subtractedSensors.value))
  
  // Show feedback
  showToast(`Removed ${sensorName} from subtraction`, 'success')
  
  // Emit event to recalculate chart data
  emit('sensors-changed', subtractedSensors.value.map(s => s.entity_id))
}

// Fetch sensor history and emit
const fetchAndSubtractSensorData = async (entityId) => {
  try {
    const startDate = new Date(props.currentDate)
    startDate.setHours(0, 0, 0, 0)
    
    const endDate = new Date(props.currentDate)
    endDate.setHours(23, 59, 59, 999)
    
    const sensorIds = subtractedSensors.value.map(s => s.entity_id)
    console.log('🚀 Emitting sensors-changed with:', sensorIds)
    console.log('🚀 Type:', typeof sensorIds, 'Is Array:', Array.isArray(sensorIds), 'Length:', sensorIds.length)
    
    // Emit event with all current subtracted sensors
    emit('sensors-changed', sensorIds)
    
  } catch (error) {
    console.error('Failed to fetch sensor history:', error)
    if (props.showToast) {
      props.showToast('Failed to fetch sensor history: ' + error.message, 'error')
    }
  }
}

// Watch for settings dialog opening
watch(showSettings, async (newValue) => {
  if (newValue) {
    await loadPowerSensors()
    await loadAvailableModels()
    
    // Load previously selected sensors from localStorage
    const stored = localStorage.getItem('availableSensors')
    if (stored) {
      const savedSensors = JSON.parse(stored)
      selectedSensors.value = new Set(savedSensors.map(s => s.entity_id))
    }
    
    // Load previously selected models from localStorage
    const storedModels = localStorage.getItem('subtractedModels')
    if (storedModels) {
      const savedModels = JSON.parse(storedModels)
      selectedModels.value = new Set(savedModels)
    }
  }
})

// Load available and subtracted sensors from localStorage on mount
const loadStoredSensors = () => {
  const stored = localStorage.getItem('availableSensors')
  if (stored) {
    availableSensors.value = JSON.parse(stored)
    console.log('Loaded available sensors from storage:', availableSensors.value.map(s => s.entity_id))
  }
  
  const storedSubtracted = localStorage.getItem('subtractedSensors')
  if (storedSubtracted) {
    subtractedSensors.value = JSON.parse(storedSubtracted)
    console.log('Loaded subtracted sensors from storage:', subtractedSensors.value.map(s => s.entity_id))
    console.log('Emitting sensors-changed on mount with:', subtractedSensors.value.map(s => s.entity_id))
    // Emit to parent on load
    emit('sensors-changed', subtractedSensors.value.map(s => s.entity_id))
  } else {
    console.log('No subtracted sensors found in storage')
  }
}

// Load on mount
loadStoredSensors()

// Watch for date changes to refresh sensor subtractions
watch(() => props.currentDate, () => {
  if (subtractedSensors.value.length > 0) {
    emit('sensors-changed', subtractedSensors.value.map(s => s.entity_id))
  }
  if (subtractedModels.value.length > 0) {
    emit('models-changed', subtractedModels.value)
  }
})

// Load available seq2point models
const loadAvailableModels = async () => {
  loadingModels.value = true
  try {
    const response = await fetch('/api/seq2point/models')
    if (response.ok) {
      const data = await response.json()
      availableModels.value = (data.models || []).map(m => m.appliance)
      console.log('Loaded available models:', availableModels.value)
    } else {
      console.warn('Failed to load models - server may not be running')
      availableModels.value = []
    }
  } catch (err) {
    // Server not running or connection error - this is expected in some cases
    console.warn('Model server not available:', err.message)
    availableModels.value = []
  } finally {
    loadingModels.value = false
  }
}

// Add model to subtract list
const addModelToSubtract = () => {
  console.log('🔵 addModelToSubtract called')
  console.log('selectedModelToAdd.value:', selectedModelToAdd.value)
  
  if (!selectedModelToAdd.value) {
    console.log('❌ No model selected')
    return
  }
  
  // Check if already added
  if (subtractedModels.value.includes(selectedModelToAdd.value)) {
    console.log('⚠️ Model already in list')
    selectedModelToAdd.value = ''
    return
  }
  
  // Add to subtracted list
  subtractedModels.value.push(selectedModelToAdd.value)
  console.log('📝 Subtracted models list:', subtractedModels.value)
  
  // Save to localStorage
  localStorage.setItem('subtractedModels', JSON.stringify(subtractedModels.value))
  
  // Emit event to trigger model prediction and subtraction
  emit('models-changed', subtractedModels.value)
  
  selectedModelToAdd.value = ''
}

// Remove model subtraction
const removeModelSubtraction = (modelName) => {
  subtractedModels.value = subtractedModels.value.filter(m => m !== modelName)
  
  // Save to localStorage
  localStorage.setItem('subtractedModels', JSON.stringify(subtractedModels.value))
  
  // Emit event to recalculate chart data
  emit('models-changed', subtractedModels.value)
}

// Load stored models on mount
const loadStoredModels = () => {
  const storedModels = localStorage.getItem('subtractedModels')
  if (storedModels) {
    subtractedModels.value = JSON.parse(storedModels)
    console.log('Loaded subtracted models from storage:', subtractedModels.value)
    // Emit to parent on load
    if (subtractedModels.value.length > 0) {
      emit('models-changed', subtractedModels.value)
    }
  }
}

// Load available models and stored selections on mount
onMounted(() => {
  loadAvailableModels()
  loadStoredModels()
})
</script>

<style scoped>
.tag-manager {
  background: white;
  border-radius: 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sticky-header {
  position: sticky;
  top: 0;
  background: white;
  padding: 1rem;
  border-bottom: 2px solid #f0f0f0;
  z-index: 10;
  border-radius: 8px 8px 0 0;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-settings {
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 1.2rem;
  transition: all 0.2s;
}

.btn-settings:hover {
  background: #e9ecef;
  border-color: #42b983;
}

.sticky-header h2 {
  margin: 0;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.accordion-header {
  transition: color 0.2s;
}

.accordion-header:hover {
  color: #42b983;
}

.accordion-icon {
  font-size: 0.8em;
  transition: transform 0.2s;
}

.scrollable-content {
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

.tag-manager h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.25rem;
}

.tag-manager h3 {
  margin-bottom: 0.75rem;
  color: #2c3e50;
  font-size: 1.1rem;
}

.tag-manager h4 {
  margin-bottom: 0.75rem;
  color: #555;
  font-size: 1rem;
}

.add-tag-form {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 2px solid #42b983;
}

.selected-range {
  background: #fff;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-weight: 500;
  color: #42b983;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 0.75rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.form-group input:focus {
  outline: none;
  border-color: #42b983;
}

.form-actions {
  display: flex;
  gap: 1rem;
}

.form-actions button {
  flex: 1;
}

.btn-secondary {
  background: #6c757d !important;
}

.btn-secondary:hover {
  background: #5a6268 !important;
}

.tags-list {
  margin-bottom: 1.5rem;
}

.tags-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tags-header h3 {
  margin: 0;
}

.prediction-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-accept-predictions,
.btn-clear-predictions {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-accept-predictions {
  background: #42b983;
  color: white;
}

.btn-accept-predictions:hover {
  background: #369970;
}

.btn-clear-predictions {
  background: #ff9800;
  color: white;
}

.btn-clear-predictions:hover {
  background: #f57c00;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #999;
  font-style: italic;
}

.tags-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #42b983;
  transition: transform 0.2s, box-shadow 0.2s;
}

.tag-item.tag-prediction {
  background: #fff8e1;
  border-left: 4px dashed #ffa726;
  border-style: dashed;
}

.tag-item:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.tag-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tag-time {
  font-size: 0.9rem;
  color: #666;
  font-family: 'Courier New', monospace;
}

.tag-label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.confidence-badge {
  background: #ffa726;
  color: white;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.btn-delete {
  width: auto;
  padding: 0.5rem 0.75rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  transition: all 0.3s;
}

.btn-delete:hover {
  background: #c82333;
}


.btn-delete.confirm-delete {
  background: #ff9800;
  animation: pulse 0.5s ease-in-out infinite alternate;
}

.btn-delete.confirm-delete:hover {
  background: #f57c00;
}

@keyframes pulse {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.1);
  }
}

.statistics {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

/* Sensor Subtraction Styles */
.sensor-subtraction {
  background: #f0f8ff;
  padding: 1rem;
  border-radius: 8px;
  margin: 0 1rem 1rem 1rem;
  border: 1px solid #b8daff;
}

.subtracted-sensors-list {
  margin-top: 1rem;
}

.subtracted-sensors-list h4 {
  color: #2c3e50;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.sensor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: white;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  border: 1px solid #ddd;
}

.sensor-name {
  font-weight: 500;
  color: #2c3e50;
}

.btn-remove {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.btn-remove:hover {
  background: #c82333;
}

/* Dialog Styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #ddd;
}

.dialog-header h3 {
  margin: 0;
  color: #2c3e50;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
  padding: 0.25rem;
  line-height: 1;
  transition: color 0.2s;
}

.btn-close:hover {
  color: #333;
}

/* Dialog Tabs */
.dialog-tabs {
  display: flex;
  border-bottom: 1px solid #ddd;
  background: #f8f9fa;
}

.tab-button {
  flex: 1;
  padding: 1rem;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  color: #666;
  transition: all 0.3s;
}

.tab-button:hover {
  background: rgba(66, 185, 131, 0.1);
  color: #42b983;
}

.tab-button.active {
  color: #42b983;
  border-bottom-color: #42b983;
  background: white;
}

.tab-content {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.info-text {
  color: #666;
  margin-bottom: 1.5rem;
  line-height: 1.6;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.error-state {
  color: #dc3545;
}

.empty-state code {
  background: #f5f5f5;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-size: 0.85rem;
  color: #c7254e;
  font-family: monospace;
}

.sensors-list h4 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.models-list h4 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.sensor-grid,
.model-grid {
  display: grid;
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.sensor-card,
.model-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.sensor-card:hover,
.model-card:hover {
  border-color: #42b983;
  background: #f8f9fa;
}

.sensor-card.sensor-selected,
.model-card.model-selected {
  border-color: #42b983;
  background: #e8f5e9;
}

.sensor-checkbox input[type="checkbox"],
.model-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.sensor-details,
.model-details {
  flex: 1;
}

.sensor-friendly-name {
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.25rem;
}

.model-name {
  font-weight: 600;
  color: #2c3e50;
  text-transform: capitalize;
  font-size: 1rem;
}

.sensor-entity-id {
  font-size: 0.85rem;
  color: #666;
  font-family: 'Courier New', monospace;
  margin-bottom: 0.25rem;
}

.sensor-state {
  font-size: 0.9rem;
  color: #42b983;
  font-weight: 500;
}

.dialog-footer {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #ddd;
}

.dialog-footer button {
  flex: 1;
}

.btn-primary {
  background: #42b983;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: background 0.3s;
}

.btn-primary:hover {
  background: #369970;
}

/* Toast Notification */
.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-success {
  background: #42b983;
}

.toast-error {
  background: #dc3545;
}

.toast-info {
  background: #17a2b8;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .form-actions {
    flex-direction: column;
  }
}
</style>
