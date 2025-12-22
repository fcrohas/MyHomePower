<template>
  <div class="power-viewer">
    <!-- Configuration Panel -->
    <div class="config-panel" v-if="!connected">
      <h2>Home Assistant Connection</h2>
      <div class="form-group">
        <label>Home Assistant URL:</label>
        <input 
          v-model="haUrl" 
          type="text" 
          placeholder="http://homeassistant.local:8123"
        />
      </div>
      <div class="form-group">
        <label>Access Token:</label>
        <input 
          v-model="haToken" 
          type="password" 
          placeholder="Your long-lived access token"
        />
      </div>
      <div class="form-group">
        <label>Power Entity ID:</label>
        <input 
          v-model="entityId" 
          type="text" 
          placeholder="sensor.power_consumption"
        />
      </div>
      <button @click="connect" :disabled="!haUrl || !haToken || !entityId">
        Connect
      </button>
      <p class="error" v-if="error">{{ error }}</p>
    </div>

    <!-- Main Viewer -->
    <div v-else class="viewer-container">
      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button 
          :class="['tab-btn', { active: activeTab === 'tagging' }]"
          @click="activeTab = 'tagging'"
        >
          📊 Power Tagging
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'ml' }]"
          @click="activeTab = 'ml'"
        >
          🧠 ML Trainer
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'detector' }]"
          @click="activeTab = 'detector'"
        >
          🔍 Power Detector
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'anomaly' }]"
          @click="activeTab = 'anomaly'"
        >
          🔬 Anomaly Detector
        </button>
      </div>

      <!-- Tagging Tab -->
      <div v-show="activeTab === 'tagging'" class="tab-content">
        <!-- Date Navigation -->
        <div class="date-navigation">
        <button @click="previousDay" class="nav-btn">← Previous Day</button>
        <div class="current-date">
          <input 
            type="date" 
            v-model="selectedDate" 
            @change="loadData"
          />
          <span>{{ formatDate(selectedDate) }}</span>
        </div>
        <button @click="nextDay" class="nav-btn">Next Day →</button>
        <button @click="exportCurrentDay" class="btn-export" :disabled="filteredTags.length === 0" title="Export current day to JSON">
          💾 Save Day
        </button>
      </div>

      <!-- Main Content: Chart Left, Tags Right -->
      <div class="main-content">
        <!-- Chart -->
        <div class="chart-section">
          <PowerChart 
            :data="chartData"
            :tags="tags"
            :selectedRange="selectedRange"
            :currentDate="selectedDate"
            @range-selected="onRangeSelected"
            @add-tag="addTag"
            @update-tag="updateTag"
          />
        </div>

        <!-- Tag Manager -->
        <div class="tags-section">
          <TagManager 
            :tags="tags"
            :selectedRange="selectedRange"
            :currentDate="selectedDate"
            @add-tag="addTag"
            @delete-tag="deleteTag"
            @clear-selection="clearSelection"
            @sensors-changed="onSensorsChanged"
            @models-changed="onModelsChanged"
          />
        </div>
      </div>

      <!-- Statistics Section Below -->
      <div class="statistics-section" v-if="filteredTags.length > 0">
        <h2>Statistics</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Total Tagged Periods:</span>
            <span class="stat-value">{{ filteredTags.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Unique Labels:</span>
            <span class="stat-value">{{ uniqueLabels.size }}</span>
          </div>
        </div>
        
        <div class="label-breakdown">
          <h3>Breakdown by Label:</h3>
          <div class="label-stats-grid">
            <div v-for="[label, count] in labelCounts" :key="label" class="label-stat">
              <span class="label-name">{{ label }}</span>
              <span class="count-badge">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- ML Trainer Tab -->
      <div v-show="activeTab === 'ml'" class="tab-content">
        <MLTrainer :powerData="powerData" />
      </div>

      <!-- Power Detector Tab -->
      <div v-show="activeTab === 'detector'" class="tab-content">
        <PowerDetector :sessionId="sessionId" />
      </div>

      <!-- Anomaly Detector Tab -->
      <div v-show="activeTab === 'anomaly'" class="tab-content">
        <AnomalyDetector :sessionId="sessionId" />
      </div>

      <!-- Loading/Status -->
      <div v-if="loading" class="loading">Loading data...</div>
    </div>

    <!-- Toast Notification -->
    <transition name="toast">
      <div v-if="toast.show" :class="['toast', toast.type]">
        <span class="toast-icon">{{ toast.icon }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, parseISO, addDays, subDays } from 'date-fns'
import PowerChart from './PowerChart.vue'
import TagManager from './TagManager.vue'
import MLTrainer from './MLTrainer.vue'
import PowerDetector from './PowerDetector.vue'
import AnomalyDetector from './AnomalyDetector.vue'
import { connectToHA, fetchHistory, exportDay } from '../services/homeassistant'

// Connection state
const connected = ref(false)
const sessionId = ref(localStorage.getItem('haSessionId') || '')
const haUrl = ref(localStorage.getItem('haUrl') || '')
const haToken = ref(localStorage.getItem('haToken') || '')
const entityId = ref(localStorage.getItem('entityId') || 'sensor.power_consumption')
const error = ref('')
const loading = ref(false)

// Tab management
const activeTab = ref('tagging')

// Toast notification state
const toast = ref({
  show: false,
  message: '',
  type: 'success', // 'success' or 'error'
  icon: ''
})

// Date management
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))

// Data
const powerData = ref([])
const rawPowerData = ref([]) // Store original data before subtraction
const subtractedSensorIds = ref([])
const subtractedModelNames = ref([])
const tags = ref([])
const selectedRange = ref(null)

// Chart data
const chartData = computed(() => {
  return powerData.value.map(item => ({
    x: new Date(item.timestamp),
    y: item.value
  }))
})

// Filtered tags for current date
const filteredTags = computed(() => {
  return tags.value
    .filter(tag => tag.date === selectedDate.value)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
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

// Load tags from localStorage
const loadTags = () => {
  const stored = localStorage.getItem('powerTags')
  if (stored) {
    tags.value = JSON.parse(stored)
  }
}

// Save tags to localStorage
const saveTags = () => {
  localStorage.setItem('powerTags', JSON.stringify(tags.value))
}

// Connect to Home Assistant
const connect = async () => {
  error.value = ''
  loading.value = true
  
  try {
    await connectToHA(haUrl.value, haToken.value, entityId.value)
    connected.value = true
    
    // Get sessionId from localStorage (set by connectToHA)
    sessionId.value = localStorage.getItem('haSessionId')
    
    // Save credentials
    localStorage.setItem('haUrl', haUrl.value)
    localStorage.setItem('haToken', haToken.value)
    localStorage.setItem('entityId', entityId.value)
    
    // Load data
    await loadData()
    loadTags()
  } catch (err) {
    error.value = err.message || 'Failed to connect to Home Assistant'
    console.error('Connection error:', err)
  } finally {
    loading.value = false
  }
}

// Load power data for selected date
const loadData = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const startDate = new Date(selectedDate.value)
    startDate.setHours(0, 0, 0, 0)
    
    const endDate = new Date(selectedDate.value)
    endDate.setHours(23, 59, 59, 999)
    
    const history = await fetchHistory(haUrl.value, haToken.value, entityId.value, startDate, endDate)
    
    rawPowerData.value = history.map(item => ({
      timestamp: item.last_changed,
      value: parseFloat(item.state)
    })).filter(item => !isNaN(item.value))
    
    // Apply all subtractions (sensors and models) if any
    await applyAllSubtractions()
    
  } catch (err) {
    error.value = 'Failed to load data: ' + err.message
    console.error('Load error:', err)
  } finally {
    loading.value = false
  }
}

// Date navigation
const previousDay = () => {
  const date = parseISO(selectedDate.value)
  selectedDate.value = format(subDays(date, 1), 'yyyy-MM-dd')
  loadData()
}

const nextDay = () => {
  const date = parseISO(selectedDate.value)
  selectedDate.value = format(addDays(date, 1), 'yyyy-MM-dd')
  loadData()
}

const formatDate = (dateStr) => {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
}

// Tag management
const onRangeSelected = (range) => {
  selectedRange.value = range
}

const addTag = (tag) => {
  tags.value.push({
    id: Date.now() + Math.random(), // Ensure unique ID for predictions
    date: selectedDate.value,
    startTime: tag.startTime,
    endTime: tag.endTime,
    label: tag.label,
    isPrediction: tag.isPrediction || false,
    confidence: tag.confidence || null
  })
  saveTags()
  if (!tag.isPrediction) {
    selectedRange.value = null
  }
}

const updateTag = (updatedTag) => {
  const index = tags.value.findIndex(t => t.id === updatedTag.id)
  if (index !== -1) {
    tags.value[index] = updatedTag
    saveTags()
  }
}

const deleteTag = (tagId) => {
  tags.value = tags.value.filter(t => t.id !== tagId)
  saveTags()
}

const clearSelection = () => {
  selectedRange.value = null
}

// Handle sensors changed event
const onSensorsChanged = async (sensorIds) => {
  console.log('🔥 onSensorsChanged called with:', sensorIds)
  console.log('Type:', typeof sensorIds, 'Is Array:', Array.isArray(sensorIds))
  console.log('Length:', sensorIds?.length)
  console.log('Contents:', JSON.stringify(sensorIds))
  subtractedSensorIds.value = sensorIds
  console.log('subtractedSensorIds.value set to:', subtractedSensorIds.value)
  await applyAllSubtractions()
}

// Handle models changed event
const onModelsChanged = async (modelNames) => {
  console.log('🔥 onModelsChanged called with:', modelNames)
  console.log('Type:', typeof modelNames, 'Is Array:', Array.isArray(modelNames))
  console.log('Length:', modelNames?.length)
  console.log('Contents:', JSON.stringify(modelNames))
  subtractedModelNames.value = modelNames
  console.log('subtractedModelNames.value set to:', subtractedModelNames.value)
  await applyAllSubtractions()
}

// Apply all subtractions (sensors and models)
const applyAllSubtractions = async () => {
  console.log('applyAllSubtractions called', {
    hasRawData: rawPowerData.value?.length > 0,
    sensorIds: subtractedSensorIds.value,
    modelNames: subtractedModelNames.value
  })
  
  if (!rawPowerData.value || rawPowerData.value.length === 0) {
    powerData.value = []
    return
  }
  
  // Start with raw data
  powerData.value = [...rawPowerData.value]
  
  // Apply sensor subtractions first
  await applySensorSubtractions()
  
  // Then apply model subtractions
  await applyModelSubtractions()
}

// Apply sensor subtractions
const applySensorSubtractions = async () => {
  console.log('applySensorSubtractions called', {
    hasData: powerData.value?.length > 0,
    sensorIds: subtractedSensorIds.value
  })
  
  // If no sensors to subtract, we're done
  if (!subtractedSensorIds.value || subtractedSensorIds.value.length === 0) {
    console.log('No sensors to subtract')
    return
  }
  
  try {
    const startDate = new Date(selectedDate.value)
    startDate.setHours(0, 0, 0, 0)
    
    const endDate = new Date(selectedDate.value)
    endDate.setHours(23, 59, 59, 999)
    
    console.log('Fetching history for sensors:', subtractedSensorIds.value)
    
    // Fetch history for each sensor
    for (const sensorId of subtractedSensorIds.value) {
      try {
        console.log(`Fetching history for ${sensorId}...`)
        const sensorHistory = await fetchHistory(haUrl.value, haToken.value, sensorId, startDate, endDate)
        
        console.log(`Got ${sensorHistory.length} data points for ${sensorId}`)
        
        const sensorData = sensorHistory.map(item => ({
          timestamp: item.last_changed,
          value: parseFloat(item.state)
        })).filter(item => !isNaN(item.value))
        
        console.log(`Processed ${sensorData.length} valid data points for ${sensorId}`)
        
        // Subtract sensor data from power data
        powerData.value = subtractSensorData(powerData.value, sensorData)
        console.log(`Subtraction complete for ${sensorId}`)
        
      } catch (err) {
        console.error(`Failed to fetch history for ${sensorId}:`, err)
        error.value = `Warning: Failed to subtract ${sensorId}: ${err.message}`
      }
    }
    
  } catch (err) {
    console.error('Error applying sensor subtractions:', err)
    error.value = 'Failed to apply sensor subtractions: ' + err.message
  }
}

// Apply model subtractions
const applyModelSubtractions = async () => {
  console.log('applyModelSubtractions called', {
    hasData: powerData.value?.length > 0,
    modelNames: subtractedModelNames.value
  })
  
  // If no models to subtract, we're done
  if (!subtractedModelNames.value || subtractedModelNames.value.length === 0) {
    console.log('No models to subtract')
    return
  }
  
  try {
    // Calculate standby power for the day (5th percentile to ignore noise)
    const sortedPower = [...powerData.value].map(d => d.value).sort((a, b) => a - b)
    const standbyIndex = Math.floor(sortedPower.length * 0.05)
    const standbyPower = sortedPower[standbyIndex] || 0
    console.log(`Calculated standby power: ${standbyPower.toFixed(2)}W (5th percentile)`)
    
    // Fetch predictions for each model
    for (const modelName of subtractedModelNames.value) {
      try {
        console.log(`Fetching predictions for model ${modelName}...`)
        
        // Call predict-day endpoint
        const response = await fetch('http://localhost:3001/api/seq2point/predict-day', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            appliance: modelName,
            date: selectedDate.value,
            powerData: rawPowerData.value.map(d => ({
              timestamp: d.timestamp,
              power: d.value
            }))
          })
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }))
          throw new Error(`Failed to get predictions: ${errorData.error || response.statusText}`)
        }
        
        const data = await response.json()
        console.log(`Got ${data.predictions.length} predictions for ${modelName}`)
        console.log('First 5 predictions:', data.predictions.slice(0, 5))
        
        // Create a map of current power data by timestamp for easy lookup
        const powerMap = new Map()
        powerData.value.forEach(d => {
          powerMap.set(new Date(d.timestamp).getTime(), d.value)
        })
        
        // Process predictions: subtract standby, cap at actual power in ON zones
        const modelData = data.predictions.map(p => {
          if (!p.isOn) {
            return { timestamp: p.timestamp, value: 0 }
          }
          
          // Subtract standby from prediction
          let adjustedPower = Math.max(0, p.predictedPower - standbyPower)
          
          // Cap prediction at actual power for this timestamp
          const actualPower = powerMap.get(new Date(p.timestamp).getTime()) || 0
          adjustedPower = Math.min(adjustedPower, actualPower)
          
          return {
            timestamp: p.timestamp,
            value: adjustedPower
          }
        })
        
        const onPredictions = modelData.filter(d => d.value > 0)
        console.log(`Subtracting model ${modelName} predictions (only when ON, after standby adjustment)...`)
        console.log('ON count:', data.predictions.filter(p => p.isOn).length)
        console.log('OFF count:', data.predictions.filter(p => !p.isOn).length)
        console.log('Total power to subtract:', onPredictions.reduce((sum, d) => sum + d.value, 0).toFixed(2) + 'W')
        
        // Subtract model predictions from power data
        powerData.value = subtractSensorData(powerData.value, modelData)
        console.log(`Model subtraction complete for ${modelName}`)
        
      } catch (err) {
        console.error(`Failed to apply model ${modelName}:`, err)
        error.value = `Warning: Failed to subtract model ${modelName}: ${err.message}`
      }
    }
    
  } catch (err) {
    console.error('Error applying model subtractions:', err)
    error.value = 'Failed to apply model subtractions: ' + err.message
  }
}

// Subtract sensor data from main power data
const subtractSensorData = (mainData, sensorData) => {
  // Create a map of sensor data by timestamp for quick lookup
  const sensorMap = new Map()
  sensorData.forEach(item => {
    const timestamp = new Date(item.timestamp).getTime()
    sensorMap.set(timestamp, item.value)
  })
  
  // Subtract sensor values from main data
  return mainData.map(item => {
    const timestamp = new Date(item.timestamp).getTime()
    
    // Find closest sensor value (within 5 minutes)
    let closestValue = 0
    let minDiff = 5 * 60 * 1000 // 5 minutes in ms
    
    for (const [sensorTime, sensorValue] of sensorMap.entries()) {
      const diff = Math.abs(timestamp - sensorTime)
      if (diff < minDiff) {
        minDiff = diff
        closestValue = sensorValue
      }
    }
    
    // Subtract and ensure non-negative
    const newValue = Math.max(0, item.value - closestValue)
    
    return {
      timestamp: item.timestamp,
      value: newValue
    }
  })
}

// Get color for a label (matches chart colors)
const getLabelColor = (label) => {
  if (chartRef.value && chartRef.value.getColorForLabel) {
    const colors = chartRef.value.getColorForLabel(label)
    return colors.border
  }
  return '#42b983' // fallback color
}

// Toast notification function
const showToast = (message, type = 'success') => {
  toast.value.message = message
  toast.value.type = type
  toast.value.icon = type === 'success' ? '✓' : '✕'
  toast.value.show = true
  
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// Export current day data
const exportCurrentDay = async () => {
  if (filteredTags.value.length === 0) {
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    const result = await exportDay(selectedDate.value, tags.value)
    console.log(`✅ Saved ${result.entries} entries to ${result.filename}`)
    showToast(`Saved ${result.entries} entries to ${result.filename}`, 'success')
  } catch (err) {
    error.value = 'Failed to export: ' + err.message
    console.error('Export error:', err)
    showToast('Failed to export: ' + err.message, 'error')
  } finally {
    loading.value = false
  }
}

// Note: Removed auto-connect behavior - user must explicitly click "Connect" button
</script>

<style scoped>
.power-viewer {
  min-height: calc(100vh - 80px);
}

.config-panel {
  padding: 2rem;
  max-width: 500px;
  margin: 0 auto;
}

.config-panel h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.25rem;
}

.form-group {
  margin-bottom: 1.5rem;
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

button {
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.3s;
}

button:hover:not(:disabled) {
  background: #35a372;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fee;
  color: #c33;
  border-radius: 4px;
  font-size: 0.9rem;
}

.viewer-container {
  padding: 1.5rem;
  max-width: 100%;
}

.tab-navigation {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e0e0e0;
}

.tab-btn {
  width: auto;
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: #666;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-btn:hover {
  color: #42b983;
  background: rgba(66, 185, 131, 0.05);
}

.tab-btn.active {
  color: #42b983;
  border-bottom-color: #42b983;
  background: rgba(66, 185, 131, 0.1);
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

.date-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
}

.btn-export {
  width: auto;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  background: #28a745;
  margin-left: auto;
}

.btn-export:hover:not(:disabled) {
  background: #218838;
}

.btn-export:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.nav-btn {
  width: auto;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.current-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.current-date input[type="date"] {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.current-date span {
  font-weight: 600;
  color: #2c3e50;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.chart-section {
  background: #fafafa;
  padding: 0.75rem;
  border-radius: 8px;
  min-height: 400px;
}

.tags-section {
  background: white;
  border-radius: 8px;
  overflow-y: auto;
  max-height: 600px;
}

.statistics-section {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.statistics-section h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.25rem;
}

.statistics-section h3 {
  margin-bottom: 0.75rem;
  color: #2c3e50;
  font-size: 1.1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #42b983;
}

.stat-label {
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #42b983;
}

.label-breakdown {
  margin-top: 1rem;
}

.label-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.label-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.label-stat:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.label-name {
  font-weight: 600;
  color: #2c3e50;
}

.count-badge {
  background: #42b983;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  min-width: 30px;
  text-align: center;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-style: italic;
}

@media (max-width: 1200px) {
  .main-content {
    grid-template-columns: 1fr;
  }
  
  .tags-section {
    max-height: none;
  }
}

@media (max-width: 768px) {
  .date-navigation {
    flex-direction: column;
  }
  
  .nav-btn {
    width: 100%;
  }
  
  .viewer-container {
    padding: 1rem;
  }
}

/* Toast Notification Styles */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
  z-index: 9999;
  min-width: 300px;
  max-width: 500px;
}

.toast.success {
  background: #42b983;
  color: white;
}

.toast.error {
  background: #dc3545;
  color: white;
}

.toast-icon {
  font-size: 1.5rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

.toast-message {
  flex: 1;
}

/* Toast Animation */
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.3s ease-in;
}

@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
