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
      </div>

      <!-- Chart -->
      <div class="chart-container">
        <PowerChart 
          :data="chartData"
          :tags="tags"
          :selectedRange="selectedRange"
          @range-selected="onRangeSelected"
        />
      </div>

      <!-- Tag Manager -->
      <TagManager 
        :tags="tags"
        :selectedRange="selectedRange"
        :currentDate="selectedDate"
        @add-tag="addTag"
        @delete-tag="deleteTag"
        @clear-selection="clearSelection"
      />

      <!-- Loading/Status -->
      <div v-if="loading" class="loading">Loading data...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { format, parseISO, addDays, subDays } from 'date-fns'
import PowerChart from './PowerChart.vue'
import TagManager from './TagManager.vue'
import { connectToHA, fetchHistory } from '../services/homeassistant'

// Connection state
const connected = ref(false)
const haUrl = ref(localStorage.getItem('haUrl') || '')
const haToken = ref(localStorage.getItem('haToken') || '')
const entityId = ref(localStorage.getItem('entityId') || 'sensor.power_consumption')
const error = ref('')
const loading = ref(false)

// Date management
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))

// Data
const powerData = ref([])
const tags = ref([])
const selectedRange = ref(null)

// Chart data
const chartData = computed(() => {
  return powerData.value.map(item => ({
    x: new Date(item.timestamp),
    y: item.value
  }))
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
    
    powerData.value = history.map(item => ({
      timestamp: item.last_changed,
      value: parseFloat(item.state)
    })).filter(item => !isNaN(item.value))
    
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
    id: Date.now(),
    date: selectedDate.value,
    startTime: tag.startTime,
    endTime: tag.endTime,
    label: tag.label
  })
  saveTags()
  selectedRange.value = null
}

const deleteTag = (tagId) => {
  tags.value = tags.value.filter(t => t.id !== tagId)
  saveTags()
}

const clearSelection = () => {
  selectedRange.value = null
}

// Auto-connect if credentials exist
onMounted(() => {
  if (haUrl.value && haToken.value && entityId.value) {
    connect()
  }
})
</script>

<style scoped>
.power-viewer {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  overflow: hidden;
}

.config-panel {
  padding: 2rem;
  max-width: 500px;
  margin: 0 auto;
}

.config-panel h2 {
  margin-bottom: 1.5rem;
  color: #2c3e50;
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
}

.date-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;
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

.chart-container {
  margin-bottom: 2rem;
  background: #fafafa;
  padding: 1rem;
  border-radius: 8px;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-style: italic;
}

@media (max-width: 768px) {
  .date-navigation {
    flex-direction: column;
  }
  
  .nav-btn {
    width: 100%;
  }
}
</style>
