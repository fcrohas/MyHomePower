<template>
  <div class="anomaly-detector">
    <!-- Main Section -->
    <div class="anomaly-section">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-controls">
          <div class="control-group">
            <label>Tag:</label>
            <select v-model="selectedTag" @change="onTagSelected" :disabled="loading">
              <option value="">-- Choose a tag --</option>
              <option v-for="tag in availableTags" :key="tag" :value="tag">
                {{ tag }} {{ isModelTrained(tag) ? '✓' : '' }}
              </option>
            </select>
          </div>

          <div class="control-group">
            <label>Date:</label>
            <input 
              type="date" 
              v-model="selectedDate" 
              :disabled="loading || !hasModel"
            />
          </div>

          <div class="control-group">
            <label>Sensitivity:</label>
            <input 
              type="range" 
              v-model.number="threshold" 
              min="0.1" 
              max="2.0" 
              step="0.05"
              :disabled="loading || !hasModel"
              class="threshold-slider"
            />
            <span class="threshold-value">{{ threshold.toFixed(2) }}</span>
          </div>
        </div>

        <div class="toolbar-actions">
          <button 
            @click="detectAnomalies" 
            class="btn btn-primary" 
            :disabled="loading || !hasModel || !selectedDate"
          >
            🔍 Detect Anomalies
          </button>

          <button 
            @click="showTrainingModal" 
            class="btn btn-secondary" 
            :disabled="loading || !selectedTag"
            :title="hasModel ? 'Retrain the model' : 'Train a new model'"
          >
            {{ hasModel ? '🔄 Retrain' : '🧠 Train Model' }}
          </button>
        </div>
      </div>

      <!-- Training Modal -->
      <div v-if="showTraining" class="modal-overlay" @click.self="closeTrainingModal">
        <div class="training-modal">
          <div class="modal-header">
            <h4>{{ hasModel ? '🔄 Retrain' : '🧠 Train' }} Autoencoder for "{{ selectedTag }}"</h4>
            <button @click="closeTrainingModal" class="btn-close">✕</button>
          </div>
          <div class="modal-body">
            <p class="section-hint">
              The autoencoder will learn normal power consumption patterns. 
              Select 3-7 dates with typical behavior (no anomalies).
            </p>
            
            <div class="training-dates">
              <label>Training Dates:</label>
              <div class="date-list">
                <div v-for="(date, idx) in trainingDates" :key="idx" class="date-item">
                  <input type="date" v-model="trainingDates[idx]" :disabled="loading" />
                  <button @click="removeTrainingDate(idx)" class="btn btn-small btn-delete" :disabled="loading">✕</button>
                </div>
              </div>
              <button @click="addTrainingDate" class="btn btn-small" :disabled="loading || trainingDates.length >= 10">
                + Add Date
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeTrainingModal" class="btn btn-secondary" :disabled="loading">
              Cancel
            </button>
            <button 
              @click="trainAutoencoder" 
              class="btn btn-primary" 
              :disabled="loading || trainingDates.length < 3"
            >
              {{ loading ? 'Training...' : '🚀 Start Training' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Results Section -->
      <div v-if="anomalyResults.length > 0" class="results-container">
        <div class="results-main">
          <!-- Timeline -->
          <div class="timeline-section">
            <div class="timeline-header">
              <h4>Timeline - {{ formatDate(selectedDate) }}</h4>
              <span class="timeline-hint">Colors: green (normal) → yellow → red (anomaly)</span>
            </div>
            <div style="display: flex; justify-content: center;">
              <svg :width="timelineWidth" :height="120" class="timeline-svg">
          <!-- Background grid - vertical lines for hours -->
          <g class="grid">
            <line 
              v-for="hour in 24" 
              :key="'hour-' + hour"
              :x1="(hour / 24) * (timelineWidth - 40) + 20"
              :x2="(hour / 24) * (timelineWidth - 40) + 20"
              y1="10"
              y2="130"
              stroke="#e0e0e0"
              stroke-width="1"
              stroke-dasharray="4,4"
            />
            <!-- Half-hour tick marks -->
            <line 
              v-for="half in 24" 
              :key="'half-' + half"
              :x1="((half - 0.5) / 24) * (timelineWidth - 40) + 20"
              :x2="((half - 0.5) / 24) * (timelineWidth - 40) + 20"
              y1="125"
              y2="130"
              stroke="#ccc"
              stroke-width="1"
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
              :fill="getScoreColor(result.anomalyScore)"
              :opacity="0.8"
              @click="selectWindow(idx)"
              class="timeline-bar"
              :class="{ 'selected-bar': selectedWindow === idx }"
            >
              <title>{{ formatTime(result.startTime) }} - Score: {{ result.anomalyScore.toFixed(3) }}</title>
            </rect>
          </g>

          <!-- Power curves overlay -->
          <g class="power-curves">
            <path
              v-for="(result, idx) in anomalyResults"
              :key="'curve-' + idx"
              :d="getTimelineCurvePath(result)"
              fill="none"
              stroke="#2c3e50"
              stroke-width="1"
              opacity="0.6"
            />
          </g>

          <!-- Time labels -->
          <g class="time-labels">
            <text 
              v-for="hour in [0, 6, 12, 18, 24]" 
              :key="hour"
              :x="(hour / 24) * (timelineWidth - 40) + 20"
              y="155"
              text-anchor="middle"
              font-size="12"
              fill="#666"
            >
              {{ hour }}:00
            </text>
          </g>
        </svg>
            </div>
          </div>

          <!-- Analysis Grid: Anomaly List & Details Horizontal -->
          <div class="analysis-grid">
            <!-- Left: Anomaly Score List -->
            <div class="score-distribution">
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

            <!-- Center: Selected Window Detail -->
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
                  <div class="curve-legend">
                    <span class="legend-item">
                      <span class="color-box" style="background: #4ecdc4;"></span> Original Pattern
                    </span>
                    <span class="legend-item">
                      <span class="color-box" style="background: #ff6b6b; opacity: 0.5;"></span> Reconstructed by AI
                    </span>
                  </div>
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

            <!-- Placeholder when no window selected -->
            <div v-else class="window-placeholder">
              <p>👈 Click on any window in the score distribution to see detailed analysis</p>
            </div>

          <!-- Right: Summary -->
          <div class="summary-panel">
            <h4>Detection Summary</h4>
            <div class="summary-stats">
              <div class="summary-item">
                <span class="summary-label">Total Windows</span>
                <span class="summary-value">{{ anomalyResults.length }}</span>
              </div>
              <div class="summary-item highlight">
                <span class="summary-label">Anomalies Found</span>
                <span class="summary-value">{{ anomalyCount }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Anomaly Rate</span>
                <span class="summary-value">{{ anomalyRate }}%</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Sensitivity</span>
                <span class="summary-value">{{ threshold.toFixed(2) }}</span>
              </div>
            </div>

            <div class="summary-distribution">
              <h5>Score Distribution</h5>
              <div class="distribution-bars">
                <div class="distribution-bar">
                  <span class="bar-label">Normal</span>
                  <div class="bar-track">
                    <div class="bar-fill normal" :style="{ width: normalRate + '%' }"></div>
                  </div>
                  <span class="bar-value">{{ normalCount }}</span>
                </div>
                <div class="distribution-bar">
                  <span class="bar-label">Anomaly</span>
                  <div class="bar-track">
                    <div class="bar-fill anomaly" :style="{ width: anomalyRate + '%' }"></div>
                  </div>
                  <span class="bar-value">{{ anomalyCount }}</span>
                </div>
              </div>
              </div>
            </div>
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { format } from 'date-fns'

const props = defineProps({
  sessionId: String
})

const API_BASE = ''

// State
const selectedTag = ref('')
const showTraining = ref(false)
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))
const availableTags = ref([])
const trainedModels = ref([])
const trainingDates = ref([format(new Date(), 'yyyy-MM-dd')])
const threshold = ref(0.5)
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
const hasModel = computed(() => 
  selectedTag.value && isModelTrained(selectedTag.value)
)

const anomalyCount = computed(() => 
  anomalyResults.value.filter(r => r.isAnomaly).length
)

const normalCount = computed(() => 
  anomalyResults.value.length - anomalyCount.value
)

const anomalyRate = computed(() => 
  anomalyResults.value.length > 0 
    ? ((anomalyCount.value / anomalyResults.value.length) * 100).toFixed(1)
    : '0.0'
)

const normalRate = computed(() => 
  anomalyResults.value.length > 0 
    ? ((normalCount.value / anomalyResults.value.length) * 100).toFixed(1)
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

const showTrainingModal = () => {
  showTraining.value = true
}

const closeTrainingModal = () => {
  showTraining.value = false
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
    console.log('Loaded tags:', availableTags.value)
    console.log('Trained models:', trainedModels.value)
  } catch (err) {
    error.value = `Failed to load tags: ${err.message}`
  }
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
    
    // Reload tags from server to get updated trained models list
    await loadTags()
    
    successMessage.value = `✅ ${data.message}`
    showTraining.value = false
    
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
    
    console.log('Anomaly detection results:', {
      totalWindows: data.anomalies?.length,
      anomalyCount: data.anomalyCount,
      sampleResult: data.anomalies?.[0]
    })
    
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

const getScoreColor = (score) => {
  // Normalize score to 0-1 range based on max score
  const normalized = Math.min(score / maxScore.value, 1)
  
  // Color gradient from green (low score) -> yellow -> red (high score)
  if (normalized < 0.33) {
    // Green to yellow-green
    const r = Math.round(78 + (normalized / 0.33) * (150 - 78))
    const g = Math.round(205 - (normalized / 0.33) * (205 - 200))
    const b = Math.round(196 - (normalized / 0.33) * (196 - 100))
    return `rgb(${r}, ${g}, ${b})`
  } else if (normalized < 0.66) {
    // Yellow-green to orange
    const localNorm = (normalized - 0.33) / 0.33
    const r = Math.round(150 + localNorm * (255 - 150))
    const g = Math.round(200 - localNorm * (200 - 140))
    const b = Math.round(100 - localNorm * 100)
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Orange to red
    const localNorm = (normalized - 0.66) / 0.34
    const r = 255
    const g = Math.round(140 - localNorm * (140 - 107))
    const b = Math.round(0 + localNorm * 107)
    return `rgb(${r}, ${g}, ${b})`
  }
}

const getTimelineCurvePath = (result) => {
  if (!result.original || result.original.length === 0) return ''
  
  // Find max power across all windows for consistent scaling
  const allMaxPowers = anomalyResults.value.map(r => Math.max(...r.original))
  const globalMax = Math.max(...allMaxPowers)
  
  // Calculate starting x position
  const startX = getTimelineX(result.startTime)
  const width = getTimelineWidth(result.startTime, result.endTime)
  
  // Generate path points
  const points = result.original.map((power, idx) => {
    const x = startX + (idx / result.original.length) * width
    // Scale power to fit within the bar height (80px), with some padding
    const y = 110 - (power / globalMax) * 70 // 110 = 30 (top) + 80 (height), scaled to 70px
    return `${x},${y}`
  })
  
  // Create SVG path
  if (points.length === 0) return ''
  const firstPoint = points[0].split(',')
  let path = `M ${firstPoint[0]} ${firstPoint[1]}`
  
  for (let i = 1; i < points.length; i++) {
    const point = points[i].split(',')
    path += ` L ${point[0]} ${point[1]}`
  }
  
  return path
}

// Lifecycle
onMounted(() => {
  if (props.sessionId) {
    loadTags()
  }
})

// Watch for sessionId changes
watch(() => props.sessionId, (newSessionId, oldSessionId) => {
  if (newSessionId && newSessionId !== oldSessionId) {
    console.log('Session ID changed, reloading tags...')
    loadTags()
  }
})
</script>

<style scoped>
.anomaly-detector {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Main Section */
.anomaly-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
  min-height: 600px;
}

.anomaly-header {
  margin-bottom: 15px;
}

.anomaly-section h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
}

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 20px;
  gap: 20px;
  flex-wrap: wrap;
}

.toolbar-controls {
  display: flex;
  gap: 20px;
  align-items: center;
  flex: 1;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
}

.control-group label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
  white-space: nowrap;
}

.control-group select,
.control-group input[type="date"] {
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  min-width: 180px;
}

.threshold-slider {
  width: 120px;
}

.threshold-value {
  font-size: 13px;
  font-weight: 700;
  color: #42b983;
  margin-top: 4px;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
}

/* Training Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.training-modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.modal-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: #dc3545;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 20px;
  border-top: 2px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.form-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid #42b983;
  margin-bottom: 20px;
}

.form-section h5 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 15px;
  font-weight: 600;
}

.section-hint {
  margin: 0 0 15px 0;
  font-size: 13px;
  color: #666;
  line-height: 1.4;
}

.tag-selection-row {
  display: flex;
  gap: 15px;
  align-items: center;
}

.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.form-group select,
.form-group input[type="date"] {
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-group select:focus,
.form-group input[type="date"]:focus {
  outline: none;
  border-color: #42b983;
}

.model-status {
  display: flex;
  align-items: center;
}

.status-badge {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge.trained {
  background: #d4edda;
  color: #155724;
}

.status-badge.untrained {
  background: #fff3cd;
  color: #856404;
}

.analysis-controls {
  display: flex;
  gap: 20px;
  align-items: flex-end;
  margin-bottom: 20px;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.training-dates {
  margin-bottom: 15px;
}

.training-dates label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  margin-bottom: 10px;
}

.date-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.date-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.date-item input {
  flex: 1;
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
}

/* Button Styles */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #42b983 0%, #35a372 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.3);
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #35a372 0%, #2d8d61 100%);
  box-shadow: 0 4px 12px rgba(66, 185, 131, 0.4);
  transform: translateY(-2px);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #5a6268;
}

.btn-small {
  padding: 8px 16px;
  font-size: 13px;
}

.btn-delete {
  background: #dc3545;
  color: white;
}

.btn-delete:hover:not(:disabled) {
  background: #c82333;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.threshold-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.threshold-control label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.threshold-control input[type="range"] {
  width: 200px;
}

.threshold-value {
  font-weight: 700;
  color: #42b983;
  font-size: 14px;
}

.threshold-hint {
  font-size: 12px;
  color: #666;
}

/* Results Section */
.results-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.results-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.timeline-section {
  background: #fafafa;
  border-radius: 8px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.timeline-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 15px;
  font-weight: 600;
}

.timeline-hint {
  font-size: 12px;
  color: #666;
  font-style: italic;
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
  padding: 15px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  color: #856404;
  margin-top: 15px;
}

.loading {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 30px;
  justify-content: center;
  color: #666;
  margin-top: 15px;
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
  padding: 15px;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 6px;
  color: #721c24;
  margin-top: 15px;
}

.success-message {
  padding: 15px;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 6px;
  color: #155724;
  margin-top: 15px;
}

.legend-info {
  margin-bottom: 20px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  text-align: center;
}

.legend-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
}

.legend-item.timeline-info {
  font-style: italic;
}

.legend-item .color-box {
  width: 20px;
  height: 12px;
  border-radius: 2px;
}

.curve-legend {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  justify-content: center;
}

.timeline-chart,
.analysis-grid {
  margin-bottom: 30px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: 350px 1fr 300px;
  gap: 20px;
  align-items: start;
}

.score-distribution {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-svg {
  display: block;
  background: #fafafa;
  border-radius: 6px;
  padding: 10px;
}

.timeline-bar {
  cursor: pointer;
  transition: opacity 0.3s, stroke 0.3s;
}

.timeline-bar:hover {
  opacity: 1 !important;
}

.timeline-bar.selected-bar {
  stroke: #2c3e50;
  stroke-width: 3;
}

.score-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 500px;
  overflow-y: auto;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 8px;
}

.score-bar-item {
  display: grid;
  grid-template-columns: 1fr 60px 80px;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
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
  font-size: 13px;
  color: #666;
}

.score-value {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  text-align: right;
}

.window-detail {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px solid #42b983;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.window-detail h4 {
  font-size: 13px;
  color: #2c3e50;
  margin: 0 0 12px 0;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.window-placeholder {
  padding: 40px 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px dashed #ccc;
  text-align: center;
  color: #666;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

/* Summary Panel */
.summary-panel {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
  position: sticky;
  top: 0;
}

.summary-panel h4 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 15px;
  font-weight: 600;
}

.summary-panel h5 {
  margin: 20px 0 10px 0;
  color: #2c3e50;
  font-size: 13px;
  font-weight: 600;
}

.summary-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border-left: 3px solid #42b983;
}

.summary-item.highlight {
  border-left-color: #ff6b6b;
  background: #fff5f5;
}

.summary-label {
  display: block;
  font-size: 11px;
  color: #666;
  font-weight: 500;
  margin-bottom: 4px;
}

.summary-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
}

.summary-distribution {
  margin-top: 15px;
}

.distribution-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.distribution-bar {
  display: grid;
  grid-template-columns: 60px 1fr 40px;
  gap: 10px;
  align-items: center;
}

.bar-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.bar-track {
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.3s;
}

.bar-fill.normal {
  background: #4ecdc4;
}

.bar-fill.anomaly {
  background: #ff6b6b;
}

.bar-value {
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
  text-align: right;
}

.detail-info {
  display: flex;
  gap: 30px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.info-item {
  font-size: 14px;
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
  padding: 15px;
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

@media (max-width: 1200px) {
  .analysis-grid {
    grid-template-columns: 300px 1fr;
  }
  
  .summary-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-controls {
    flex-direction: column;
    gap: 15px;
  }

  .toolbar-actions {
    flex-direction: column;
  }

  .analysis-grid {
    grid-template-columns: 1fr;
  }

  .summary-panel {
    position: static;
  }

  .detail-info {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
