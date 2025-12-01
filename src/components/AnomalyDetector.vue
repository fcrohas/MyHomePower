<template>
  <div class="anomaly-detector">
    <div class="detector-header">
      <h2>🔬 Anomaly Detector</h2>
      <p class="description">
        Select a tag to train an autoencoder on normal patterns, then detect anomalous behavior
      </p>
    </div>

    <!-- Tag Selection -->
    <div class="tag-selection-panel">
      <div class="form-group">
        <label>Select Tag:</label>
        <select v-model="selectedTag" @change="onTagSelected" :disabled="loading">
          <option value="">-- Choose a tag --</option>
          <option v-for="tag in availableTags" :key="tag" :value="tag">
            {{ tag }} {{ isModelTrained(tag) ? '✓' : '' }}
          </option>
        </select>
        <span v-if="selectedTag && isModelTrained(selectedTag)" class="status-badge trained">
          Model Trained
        </span>
        <span v-else-if="selectedTag" class="status-badge untrained">
          No Model
        </span>
      </div>

      <div v-if="selectedTag" class="date-selector">
        <label>Analysis Date:</label>
        <input 
          type="date" 
          v-model="selectedDate" 
          :disabled="loading"
        />
      </div>
    </div>

    <!-- Training Section -->
    <div v-if="selectedTag && !isModelTrained(selectedTag)" class="training-panel">
      <h3>🧠 Train Autoencoder</h3>
      <p class="info-text">
        The autoencoder will learn normal power consumption patterns for "{{ selectedTag }}". 
        Select dates with typical behavior (no anomalies).
      </p>
      
      <div class="training-dates">
        <label>Training Dates (select 3-7 days with normal behavior):</label>
        <div class="date-list">
          <div v-for="(date, idx) in trainingDates" :key="idx" class="date-item">
            <input type="date" v-model="trainingDates[idx]" :disabled="loading" />
            <button @click="removeTrainingDate(idx)" class="btn-remove" :disabled="loading">✕</button>
          </div>
        </div>
        <button @click="addTrainingDate" class="btn-add" :disabled="loading || trainingDates.length >= 10">
          + Add Date
        </button>
      </div>

      <button 
        @click="trainAutoencoder" 
        class="btn-train" 
        :disabled="loading || trainingDates.length < 3"
      >
        {{ loading ? 'Training...' : 'Train Autoencoder' }}
      </button>
    </div>

    <!-- Analysis Section -->
    <div v-if="selectedTag && isModelTrained(selectedTag)" class="analysis-panel">
      <div class="controls">
        <button 
          @click="detectAnomalies" 
          class="btn-analyze" 
          :disabled="loading || !selectedDate"
        >
          🔍 Detect Anomalies
        </button>

        <div class="threshold-control">
          <label>Sensitivity:</label>
          <input 
            type="range" 
            v-model.number="threshold" 
            min="1.5" 
            max="4.0" 
            step="0.1"
            :disabled="loading"
          />
          <span class="threshold-value">{{ threshold.toFixed(1) }}</span>
          <span class="threshold-hint">
            {{ threshold < 2.0 ? 'High' : threshold < 3.0 ? 'Medium' : 'Low' }}
          </span>
        </div>

        <button 
          @click="retrainModel" 
          class="btn-retrain" 
          :disabled="loading"
          title="Retrain the autoencoder with new data"
        >
          🔄 Retrain Model
        </button>
      </div>

      <!-- Results Summary -->
      <div v-if="anomalyResults.length > 0" class="results-summary">
        <div class="stat-card">
          <span class="stat-label">Total Windows</span>
          <span class="stat-value">{{ anomalyResults.length }}</span>
        </div>
        <div class="stat-card anomaly">
          <span class="stat-label">Anomalies Detected</span>
          <span class="stat-value">{{ anomalyCount }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Anomaly Rate</span>
          <span class="stat-value">{{ anomalyRate }}%</span>
        </div>
      </div>
    </div>

    <!-- Status Messages -->
    <div v-if="!props.sessionId && !loading" class="status-warning">
      ⚠️ Not connected to Home Assistant. Please connect in the Power Tagging tab first.
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      {{ loadingMessage }}
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="successMessage" class="success-message">
      {{ successMessage }}
    </div>

    <!-- Anomaly Visualizations -->
    <div v-if="anomalyResults.length > 0" class="anomaly-charts">
      <div class="chart-header">
        <h3>Anomaly Analysis for "{{ selectedTag }}" on {{ formatDate(selectedDate) }}</h3>
        <div class="legend">
          <span class="legend-item normal">
            <span class="color-box"></span> Normal Pattern
          </span>
          <span class="legend-item anomaly">
            <span class="color-box"></span> Anomaly
          </span>
          <span class="legend-item reconstructed">
            <span class="color-box"></span> Reconstructed
          </span>
        </div>
      </div>

      <!-- Timeline Overview -->
      <div class="timeline-chart">
        <h4>Timeline Overview</h4>
        <svg :width="timelineWidth" :height="150" class="timeline-svg">
          <!-- Background grid -->
          <g class="grid">
            <line 
              v-for="hour in 24" 
              :key="hour"
              :x1="(hour / 24) * (timelineWidth - 40) + 20"
              :x2="(hour / 24) * (timelineWidth - 40) + 20"
              y1="10"
              y2="130"
              stroke="#e0e0e0"
              stroke-width="1"
              stroke-dasharray="2,2"
            />
          </g>

          <!-- Anomaly bars -->
          <g class="anomalies">
            <rect
              v-for="(result, idx) in anomalyResults"
              :key="idx"
              :x="getTimelineX(result.startTime)"
              y="30"
              :width="getTimelineWidth(result.startTime, result.endTime)"
              height="80"
              :fill="result.isAnomaly ? '#ff6b6b' : '#4ecdc4'"
              :opacity="result.isAnomaly ? 0.8 : 0.3"
              @click="selectWindow(idx)"
              class="timeline-bar"
            />
          </g>

          <!-- Time labels -->
          <g class="time-labels">
            <text 
              v-for="hour in [0, 6, 12, 18, 24]" 
              :key="hour"
              :x="(hour / 24) * (timelineWidth - 40) + 20"
              y="145"
              text-anchor="middle"
              font-size="12"
              fill="#666"
            >
              {{ hour }}:00
            </text>
          </g>
        </svg>
      </div>

      <!-- Anomaly Score Distribution -->
      <div class="score-distribution">
        <h4>Anomaly Score Distribution</h4>
        <div class="score-bars">
          <div
            v-for="(result, idx) in sortedByScore"
            :key="idx"
            class="score-bar-item"
            :class="{ 'is-anomaly': result.isAnomaly, 'selected': selectedWindow === result.originalIndex }"
            @click="selectWindow(result.originalIndex)"
          >
            <div class="score-bar">
              <div 
                class="score-fill"
                :style="{ width: (result.anomalyScore / maxScore * 100) + '%' }"
              ></div>
            </div>
            <span class="score-label">{{ formatTime(result.startTime) }}</span>
            <span class="score-value">{{ result.anomalyScore.toFixed(3) }}</span>
          </div>
        </div>
      </div>

      <!-- Selected Window Detail -->
      <div v-if="selectedWindow !== null" class="window-detail">
        <h4>Window Detail - {{ formatTime(anomalyResults[selectedWindow].startTime) }}</h4>
        <div class="detail-info">
          <span class="info-item">
            Status: 
            <strong :class="anomalyResults[selectedWindow].isAnomaly ? 'anomaly-text' : 'normal-text'">
              {{ anomalyResults[selectedWindow].isAnomaly ? '⚠️ ANOMALY' : '✓ Normal' }}
            </strong>
          </span>
          <span class="info-item">
            Anomaly Score: <strong>{{ anomalyResults[selectedWindow].anomalyScore.toFixed(4) }}</strong>
          </span>
          <span class="info-item">
            Threshold: <strong>{{ anomalyResults[selectedWindow].threshold.toFixed(2) }}</strong>
          </span>
          <span class="info-item">
            Avg Power: <strong>{{ anomalyResults[selectedWindow].avgPower.toFixed(1) }} W</strong>
          </span>
        </div>

        <!-- Power Curve Comparison -->
        <div class="power-curve-chart">
          <svg :width="chartWidth" :height="300" class="curve-svg">
            <!-- Axis -->
            <line x1="40" y1="250" :x2="chartWidth - 20" y2="250" stroke="#333" stroke-width="2" />
            <line x1="40" y1="30" x2="40" y2="250" stroke="#333" stroke-width="2" />

            <!-- Grid lines -->
            <g class="grid">
              <line 
                v-for="i in 5" 
                :key="i"
                x1="40"
                :x2="chartWidth - 20"
                :y1="30 + (i * 44)"
                :y2="30 + (i * 44)"
                stroke="#e0e0e0"
                stroke-width="1"
                stroke-dasharray="2,2"
              />
            </g>

            <!-- Original curve -->
            <polyline
              :points="getOriginalCurvePoints()"
              fill="none"
              stroke="#4ecdc4"
              stroke-width="2"
              class="original-curve"
            />

            <!-- Reconstructed curve -->
            <polyline
              :points="getReconstructedCurvePoints()"
              fill="none"
              stroke="#ff6b6b"
              stroke-width="2"
              stroke-dasharray="5,5"
              class="reconstructed-curve"
            />

            <!-- Y-axis labels -->
            <g class="y-labels">
              <text 
                v-for="(val, i) in yAxisLabels" 
                :key="i"
                x="35"
                :y="250 - (i * 55)"
                text-anchor="end"
                font-size="12"
                fill="#666"
              >
                {{ val }}
              </text>
            </g>

            <!-- X-axis label -->
            <text :x="chartWidth / 2" y="280" text-anchor="middle" font-size="12" fill="#666">
              Time (samples in 10-minute window)
            </text>
            <text x="15" y="140" text-anchor="middle" font-size="12" fill="#666" transform="rotate(-90, 15, 140)">
              Power (W)
            </text>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { format } from 'date-fns'

const props = defineProps({
  sessionId: String
})

const API_BASE = 'http://localhost:3001'

// State
const selectedTag = ref('')
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))
const availableTags = ref([])
const trainedModels = ref([])
const trainingDates = ref([format(new Date(), 'yyyy-MM-dd')])
const threshold = ref(2.5)
const anomalyResults = ref([])
const selectedWindow = ref(null)
const loading = ref(false)
const loadingMessage = ref('')
const error = ref('')
const successMessage = ref('')

// Chart dimensions
const timelineWidth = ref(1000)
const chartWidth = ref(800)

// Computed
const anomalyCount = computed(() => 
  anomalyResults.value.filter(r => r.isAnomaly).length
)

const anomalyRate = computed(() => 
  anomalyResults.value.length > 0 
    ? ((anomalyCount.value / anomalyResults.value.length) * 100).toFixed(1)
    : '0.0'
)

const maxScore = computed(() => 
  Math.max(...anomalyResults.value.map(r => r.anomalyScore), 1)
)

const sortedByScore = computed(() => 
  anomalyResults.value
    .map((r, idx) => ({ ...r, originalIndex: idx }))
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
)

const yAxisLabels = computed(() => {
  if (selectedWindow.value === null) return []
  const window = anomalyResults.value[selectedWindow.value]
  const maxPower = Math.max(...window.original, ...window.reconstructed)
  const step = maxPower / 4
  return [0, 1, 2, 3, 4].map(i => Math.round(i * step))
})

// Methods
const isModelTrained = (tag) => {
  return trainedModels.value.includes(tag)
}

const formatDate = (dateStr) => {
  return format(new Date(dateStr), 'MMM dd, yyyy')
}

const formatTime = (timestamp) => {
  return format(new Date(timestamp), 'HH:mm')
}

const onTagSelected = () => {
  anomalyResults.value = []
  selectedWindow.value = null
  error.value = ''
  successMessage.value = ''
}

const addTrainingDate = () => {
  trainingDates.value.push(format(new Date(), 'yyyy-MM-dd'))
}

const removeTrainingDate = (idx) => {
  trainingDates.value.splice(idx, 1)
}

const loadTags = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/anomaly/tags`)
    if (!response.ok) throw new Error('Failed to load tags')
    
    const data = await response.json()
    availableTags.value = data.tags || []
    trainedModels.value = data.availableModels || []
  } catch (err) {
    error.value = `Failed to load tags: ${err.message}`
  }
}

const retrainModel = () => {
  trainedModels.value = trainedModels.value.filter(t => t !== selectedTag.value)
  anomalyResults.value = []
  selectedWindow.value = null
}

const trainAutoencoder = async () => {
  if (!selectedTag.value || trainingDates.value.length < 3) {
    error.value = 'Please select at least 3 training dates'
    return
  }

  loading.value = true
  loadingMessage.value = 'Training autoencoder... This may take a few minutes.'
  error.value = ''
  successMessage.value = ''

  try {
    const response = await fetch(`${API_BASE}/api/anomaly/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag: selectedTag.value,
        sessionId: props.sessionId,
        trainingDates: trainingDates.value
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Training failed')
    }

    const data = await response.json()
    trainedModels.value.push(selectedTag.value)
    successMessage.value = `✅ ${data.message}`
    
    setTimeout(() => {
      successMessage.value = ''
    }, 5000)

  } catch (err) {
    error.value = `Training failed: ${err.message}`
  } finally {
    loading.value = false
    loadingMessage.value = ''
  }
}

const detectAnomalies = async () => {
  if (!selectedTag.value || !selectedDate.value) {
    error.value = 'Please select a tag and date'
    return
  }

  loading.value = true
  loadingMessage.value = 'Detecting anomalies...'
  error.value = ''
  successMessage.value = ''

  try {
    const response = await fetch(`${API_BASE}/api/anomaly/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag: selectedTag.value,
        sessionId: props.sessionId,
        date: selectedDate.value,
        threshold: threshold.value
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Detection failed')
    }

    const data = await response.json()
    anomalyResults.value = data.anomalies || []
    selectedWindow.value = null
    
    if (anomalyResults.value.length === 0) {
      error.value = 'No data found for this tag on the selected date'
    } else {
      successMessage.value = `✅ Analysis complete: ${data.anomalyCount} anomalies detected`
      setTimeout(() => {
        successMessage.value = ''
      }, 5000)
    }

  } catch (err) {
    error.value = `Detection failed: ${err.message}`
  } finally {
    loading.value = false
    loadingMessage.value = ''
  }
}

const selectWindow = (idx) => {
  selectedWindow.value = idx
}

const getTimelineX = (timestamp) => {
  const date = new Date(selectedDate.value)
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayEnd = dayStart + 24 * 60 * 60 * 1000
  const position = (timestamp - dayStart) / (dayEnd - dayStart)
  return position * (timelineWidth.value - 40) + 20
}

const getTimelineWidth = (startTime, endTime) => {
  const date = new Date(selectedDate.value)
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayEnd = dayStart + 24 * 60 * 60 * 1000
  const width = (endTime - startTime) / (dayEnd - dayStart) * (timelineWidth.value - 40)
  return Math.max(width, 2)
}

const getOriginalCurvePoints = () => {
  if (selectedWindow.value === null) return ''
  const window = anomalyResults.value[selectedWindow.value]
  const maxPower = Math.max(...window.original, ...window.reconstructed)
  const points = window.original.map((val, idx) => {
    const x = 40 + (idx / window.original.length) * (chartWidth.value - 60)
    const y = 250 - (val / maxPower) * 220
    return `${x},${y}`
  })
  return points.join(' ')
}

const getReconstructedCurvePoints = () => {
  if (selectedWindow.value === null) return ''
  const window = anomalyResults.value[selectedWindow.value]
  const maxPower = Math.max(...window.original, ...window.reconstructed)
  const points = window.reconstructed.map((val, idx) => {
    const x = 40 + (idx / window.reconstructed.length) * (chartWidth.value - 60)
    const y = 250 - (val / maxPower) * 220
    return `${x},${y}`
  })
  return points.join(' ')
}

// Lifecycle
onMounted(() => {
  if (props.sessionId) {
    loadTags()
  }
})
</script>

<style scoped>
.anomaly-detector {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.detector-header {
  margin-bottom: 2rem;
}

.detector-header h2 {
  font-size: 1.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.description {
  color: #666;
  font-size: 0.95rem;
}

.tag-selection-panel {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
}

.form-group select,
.date-selector input {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-group select:focus,
.date-selector input:focus {
  outline: none;
  border-color: #42b983;
}

.date-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.date-selector label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-left: 0.5rem;
}

.status-badge.trained {
  background: #d4edda;
  color: #155724;
}

.status-badge.untrained {
  background: #fff3cd;
  color: #856404;
}

.training-panel,
.analysis-panel {
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
}

.training-panel h3 {
  font-size: 1.2rem;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.info-text {
  color: #666;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #42b983;
}

.training-dates {
  margin-bottom: 1.5rem;
}

.training-dates label {
  display: block;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.75rem;
}

.date-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.date-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.date-item input {
  flex: 1;
  padding: 0.5rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
}

.btn-remove {
  padding: 0.5rem 0.75rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.3s;
}

.btn-remove:hover:not(:disabled) {
  background: #c82333;
}

.btn-add {
  padding: 0.5rem 1rem;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.3s;
}

.btn-add:hover:not(:disabled) {
  background: #359268;
}

.btn-train,
.btn-analyze,
.btn-retrain {
  padding: 0.75rem 1.5rem;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: background 0.3s;
}

.btn-train:hover:not(:disabled),
.btn-analyze:hover:not(:disabled) {
  background: #359268;
}

.btn-retrain {
  background: #6c757d;
}

.btn-retrain:hover:not(:disabled) {
  background: #5a6268;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.threshold-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.threshold-control label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
}

.threshold-control input[type="range"] {
  width: 150px;
}

.threshold-value {
  font-weight: 700;
  color: #42b983;
  min-width: 2rem;
}

.threshold-hint {
  font-size: 0.85rem;
  color: #666;
}

.results-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-left: 4px solid #42b983;
}

.stat-card.anomaly {
  border-left-color: #ff6b6b;
}

.stat-label {
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #2c3e50;
}

.status-warning {
  padding: 1rem;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  color: #856404;
  margin-bottom: 1rem;
}

.loading {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  justify-content: center;
  color: #666;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e0e0e0;
  border-top-color: #42b983;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  padding: 1rem;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 6px;
  color: #721c24;
  margin-bottom: 1rem;
}

.success-message {
  padding: 1rem;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 6px;
  color: #155724;
  margin-bottom: 1rem;
}

.anomaly-charts {
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.chart-header h3 {
  font-size: 1.2rem;
  color: #2c3e50;
}

.legend {
  display: flex;
  gap: 1.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #666;
}

.legend-item .color-box {
  width: 20px;
  height: 12px;
  border-radius: 2px;
}

.legend-item.normal .color-box {
  background: #4ecdc4;
}

.legend-item.anomaly .color-box {
  background: #ff6b6b;
}

.legend-item.reconstructed .color-box {
  background: #ff6b6b;
  opacity: 0.5;
}

.timeline-chart,
.score-distribution,
.window-detail {
  margin-bottom: 2rem;
}

.timeline-chart h4,
.score-distribution h4,
.window-detail h4 {
  font-size: 1.1rem;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.timeline-svg {
  display: block;
  background: #fafafa;
  border-radius: 6px;
  padding: 10px;
}

.timeline-bar {
  cursor: pointer;
  transition: opacity 0.3s;
}

.timeline-bar:hover {
  opacity: 1 !important;
}

.score-bars {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.score-bar-item {
  display: grid;
  grid-template-columns: 1fr 60px 80px;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.score-bar-item:hover {
  background: #e9ecef;
}

.score-bar-item.selected {
  background: #d4edda;
  border: 2px solid #42b983;
}

.score-bar-item.is-anomaly {
  background: #ffe5e5;
}

.score-bar-item.is-anomaly.selected {
  background: #ffcccc;
  border: 2px solid #ff6b6b;
}

.score-bar {
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ecdc4, #ff6b6b);
  border-radius: 10px;
  transition: width 0.3s;
}

.score-label {
  font-size: 0.85rem;
  color: #666;
}

.score-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c3e50;
  text-align: right;
}

.window-detail {
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px solid #42b983;
}

.detail-info {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.info-item {
  font-size: 0.95rem;
  color: #666;
}

.info-item strong {
  color: #2c3e50;
  font-weight: 700;
}

.anomaly-text {
  color: #ff6b6b;
}

.normal-text {
  color: #4ecdc4;
}

.power-curve-chart {
  background: white;
  border-radius: 6px;
  padding: 1rem;
}

.curve-svg {
  display: block;
}

.original-curve {
  filter: drop-shadow(0 2px 4px rgba(78, 205, 196, 0.3));
}

.reconstructed-curve {
  filter: drop-shadow(0 2px 4px rgba(255, 107, 107, 0.3));
}

@media (max-width: 768px) {
  .tag-selection-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .detail-info {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>
