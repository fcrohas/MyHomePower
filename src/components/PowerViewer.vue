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

      <!-- Loading/Status -->
      <div v-if="loading" class="loading">Loading data...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, parseISO, addDays, subDays } from 'date-fns'
import PowerChart from './PowerChart.vue'
import TagManager from './TagManager.vue'
import MLTrainer from './MLTrainer.vue'
import { connectToHA, fetchHistory, exportDay } from '../services/homeassistant'

// Connection state
const connected = ref(false)
const haUrl = ref(localStorage.getItem('haUrl') || '')
const haToken = ref(localStorage.getItem('haToken') || '')
const entityId = ref(localStorage.getItem('entityId') || 'sensor.power_consumption')
const error = ref('')
const loading = ref(false)

// Tab management
const activeTab = ref('tagging')

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

// Get color for a label (matches chart colors)
const getLabelColor = (label) => {
  if (chartRef.value && chartRef.value.getColorForLabel) {
    const colors = chartRef.value.getColorForLabel(label)
    return colors.border
  }
  return '#42b983' // fallback color
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
    alert(`Success! Saved ${result.entries} entries to ${result.filename}`)
  } catch (err) {
    error.value = 'Failed to export: ' + err.message
    console.error('Export error:', err)
    alert('Failed to export: ' + err.message)
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
</style>
