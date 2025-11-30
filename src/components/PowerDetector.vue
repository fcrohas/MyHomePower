<template>
  <div class="power-detector">
    <div class="detector-header">
      <h2>🔍 Power Detector - AI Tag Prediction</h2>
      <p class="description">
        Using the trained ML model to predict activity tags for each 10-minute window
      </p>
    </div>

    <!-- Date Selection -->
    <div class="date-selector">
      <button @click="previousDay" class="nav-btn">← Previous Day</button>
      <div class="current-date">
        <input 
          type="date" 
          v-model="selectedDate" 
          @change="loadAndPredict"
        />
        <span>{{ formatDate(selectedDate) }}</span>
      </div>
      <button @click="nextDay" class="nav-btn">Next Day →</button>
      <button 
        @click="loadAndPredict" 
        class="btn-analyze" 
        :disabled="loading || !props.sessionId"
      >
        🔄 Analyze
      </button>
      <button 
        @click="showSettingsDialog = true" 
        class="btn-settings"
        title="Advanced Settings"
      >
        ⚙️ Settings
      </button>
    </div>

    <!-- Settings Dialog -->
    <div v-if="showSettingsDialog" class="dialog-overlay" @click.self="showSettingsDialog = false">
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>⚙️ Advanced Settings</h3>
          <button class="close-btn" @click="showSettingsDialog = false">✕</button>
        </div>
        <div class="dialog-body">
          <div class="config-item">
            <label for="stepSize">Sliding Window Step Size (minutes):</label>
            <select id="stepSize" v-model.number="stepSize">
              <option :value="1">1 minute (High Precision - Slow)</option>
              <option :value="3">3 minutes</option>
              <option :value="5">5 minutes (Recommended - Balanced)</option>
              <option :value="10">10 minutes (Fast)</option>
            </select>
            <span class="config-hint">Smaller steps = more precise but slower</span>
          </div>
          <div class="config-item">
            <label for="threshold">Detection Threshold:</label>
            <input 
              type="range" 
              id="threshold" 
              v-model.number="threshold" 
              min="0.1" 
              max="0.7" 
              step="0.05"
            />
            <span class="config-value">{{ (threshold * 100).toFixed(0) }}%</span>
            <span class="config-hint">Higher = fewer false positives</span>
          </div>
          <div class="config-item checkbox">
            <label>
              <input type="checkbox" v-model="useNewPredictor" />
              Use new sliding window predictor (multi-label detection)
            </label>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="showSettingsDialog = false" class="btn-close">Close</button>
        </div>
      </div>
    </div>

    <!-- Status Messages -->
    <div v-if="!props.sessionId && !loading" class="status-warning">
      ⚠️ Not connected to Home Assistant. Please connect in the Power Tagging tab first.
    </div>

    <div v-if="!modelLoaded && !loading && props.sessionId && predictions.length === 0" class="status-warning">
      ⚠️ Click "Analyze" to detect activities. A trained model will be loaded automatically.
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      {{ loadingProgress }}
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Charts Container -->
    <div v-if="predictions.length > 0 && !loading" class="charts-container">
      <!-- Power Chart with Predicted Tags -->
      <div class="chart-section full-width">
        <h3>📊 Power Consumption with Predicted Tags</h3>
        <div class="chart-wrapper power-chart-wrapper">
          <canvas ref="powerChartCanvas"></canvas>
        </div>
        <div class="legend-info">
          Each colored region represents a predicted activity tag for a 10-minute window
        </div>
      </div>

      <!-- Second Row: Pie Chart and Stats -->
      <div class="chart-section">
        <h3>📈 Energy Consumption by Activity</h3>
        <div class="chart-wrapper pie-wrapper">
          <canvas ref="pieChartCanvas"></canvas>
        </div>
      </div>

      <div class="chart-section">
        <h3>📊 Summary Statistics</h3>
        <div class="stats-summary">
          <div class="stat-item">
            <span class="label">Appliance Energy:</span>
            <span class="value">{{ totalEnergy.toFixed(2) }} Wh</span>
          </div>
          <div class="stat-item">
            <span class="label">Standby Energy:</span>
            <span class="value">{{ totalStandbyEnergy.toFixed(2) }} Wh</span>
          </div>
          <div class="stat-item">
            <span class="label">Total Energy:</span>
            <span class="value">{{ totalCombinedEnergy.toFixed(2) }} Wh</span>
          </div>
          <div class="stat-item">
            <span class="label">Active Periods:</span>
            <span class="value">{{ predictions.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Unique Activities:</span>
            <span class="value">{{ uniqueTags.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Avg Power:</span>
            <span class="value">{{ avgPower.toFixed(0) }} W</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Detailed Predictions Table -->
    <div v-if="predictions.length > 0 && !loading" class="predictions-table">
      <div class="accordion-header" @click="showDetailedPredictions = !showDetailedPredictions">
        <h3>🎯 Detailed Predictions</h3>
        <span class="accordion-icon">{{ showDetailedPredictions ? '▼' : '▶' }}</span>
      </div>
      <div v-show="showDetailedPredictions" class="accordion-content">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Time Range</th>
                <th>Predicted Tags</th>
                <th>Confidence</th>
                <th>Avg Power</th>
                <th>Appliance Energy (Wh)</th>
                <th>Standby Energy (Wh)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pred, idx) in predictions" :key="idx">
                <td>{{ pred.startTime }} - {{ pred.endTime }}</td>
                <td>
                  <div v-if="pred.tags && pred.tags.length > 1" class="multi-tags">
                    <span 
                      v-for="(tagInfo, tidx) in pred.tags" 
                      :key="tidx"
                      class="tag-badge" 
                      :style="{ backgroundColor: getTagColor(tagInfo.tag) }"
                      :title="`${(tagInfo.prob * 100).toFixed(1)}%`"
                    >
                      {{ tagInfo.tag === 'standby' ? 'other' : tagInfo.tag }}
                    </span>
                  </div>
                  <span 
                    v-else 
                    class="tag-badge" 
                    :style="{ backgroundColor: pred.color }"
                  >
                    {{ pred.displayTag || pred.tag }}
                  </span>
                </td>
                <td>
                  <div class="confidence-bar">
                    <div class="confidence-fill" :style="{ width: (pred.confidence * 100) + '%' }"></div>
                    <span class="confidence-text">{{ pred.confidence ? (pred.confidence * 100).toFixed(1) : '0.0' }}%</span>
                  </div>
                </td>
                <td>{{ pred.avgPower ? pred.avgPower.toFixed(0) : '0' }} W</td>
                <td>{{ pred.energy ? pred.energy.toFixed(2) : '0.00' }} Wh</td>
                <td>{{ pred.standbyEnergy ? pred.standbyEnergy.toFixed(2) : '0.00' }} Wh</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { format, parseISO, addDays, subDays } from 'date-fns'
import Chart from 'chart.js/auto'
import 'chartjs-adapter-date-fns'

const props = defineProps({
  sessionId: {
    type: String,
    required: false,
    default: ''
  }
})

// State
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))
const loading = ref(false)
const loadingProgress = ref('')
const modelLoaded = ref(false)
const error = ref('')
const predictions = ref([])
const powerData = ref([])
const powerChart = ref(null)
const pieChart = ref(null)
const powerChartCanvas = ref(null)
const pieChartCanvas = ref(null)
const showDetailedPredictions = ref(false)
const showSettingsDialog = ref(false)

// Configuration
const stepSize = ref(5) // Default 5 minutes
const threshold = ref(0.25) // Default 25% threshold for multi-label
const useNewPredictor = ref(false) // Use old predictor by default until tested

// Color palette for tags
const tagColors = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#34495E', '#16A085'
]

const colorMap = ref({})

// Computed
const uniqueTags = computed(() => {
  const tags = new Set(predictions.value.map(p => p.tag))
  return Array.from(tags)
})

const totalEnergy = computed(() => {
  // Sum of appliance energy only (standby is separate)
  return predictions.value.reduce((sum, p) => sum + p.energy, 0)
})

const totalStandbyEnergy = computed(() => {
  // Sum of standby energy across all windows
  return predictions.value.reduce((sum, p) => sum + (p.standbyEnergy || 0), 0)
})

const totalCombinedEnergy = computed(() => {
  // Total energy including standby
  return totalEnergy.value + totalStandbyEnergy.value
})

const avgPower = computed(() => {
  if (predictions.value.length === 0) return 0
  const sum = predictions.value.reduce((s, p) => s + p.avgPower, 0)
  return sum / predictions.value.length
})

const energyByTag = computed(() => {
  const byTag = {}
  predictions.value.forEach(p => {
    // Handle multi-label: distribute energy among all detected tags
    if (useNewPredictor.value && p.tags && p.tags.length > 0) {
      // Multi-label case: split energy among detected tags proportionally
      const totalProb = p.tags.reduce((sum, t) => sum + t.prob, 0)
      p.tags.forEach(tagInfo => {
        const tagName = tagInfo.tag === 'standby' ? 'other' : tagInfo.tag
        if (!byTag[tagName]) {
          byTag[tagName] = 0
        }
        // Weight energy by probability
        const weight = totalProb > 0 ? tagInfo.prob / totalProb : 1 / p.tags.length
        byTag[tagName] += (p.energy || 0) * weight
      })
    } else {
      // Single label case (legacy)
      const tagName = p.tag === 'standby' ? 'other' : p.tag
      if (!byTag[tagName]) {
        byTag[tagName] = 0
      }
      byTag[tagName] += p.energy || 0
    }
  })
  
  // Add baseline as a separate category for the total standby consumption across all periods
  if (totalStandbyEnergy.value > 0) {
    byTag['baseline'] = totalStandbyEnergy.value
  }
  
  return byTag
})

// Methods
const formatDate = (dateStr) => {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
}

const previousDay = () => {
  const date = parseISO(selectedDate.value)
  selectedDate.value = format(subDays(date, 1), 'yyyy-MM-dd')
  loadAndPredict()
}

const nextDay = () => {
  const date = parseISO(selectedDate.value)
  selectedDate.value = format(addDays(date, 1), 'yyyy-MM-dd')
  loadAndPredict()
}

const getTagColor = (tag) => {
  // Assign special colors for specific tags to avoid conflicts
  // Both "standby" and "other" should use the same color (light gray)
  if (tag === 'standby' || tag === 'other') {
    colorMap.value['standby'] = '#95A5A6' // Light gray
    colorMap.value['other'] = '#95A5A6' // Same color for consistency
    return '#95A5A6'
  }
  if (tag === 'baseline') {
    colorMap.value[tag] = '#BDC3C7' // Lighter gray for baseline
    return colorMap.value[tag]
  }
  
  // For regular tags, assign from the color palette
  if (!colorMap.value[tag]) {
    // Count only non-special tags to avoid index conflicts
    const specialTags = ['standby', 'other', 'baseline']
    const regularTagCount = Object.keys(colorMap.value).filter(t => !specialTags.includes(t)).length
    colorMap.value[tag] = tagColors[regularTagCount % tagColors.length]
  }
  return colorMap.value[tag]
}

const loadAndPredict = async () => {
  // Clear existing data first
  predictions.value = []
  powerData.value = []
  loading.value = true
  loadingProgress.value = 'Initializing analysis...'
  error.value = ''

  try {
    // Check if we have a valid session
    if (!props.sessionId) {
      error.value = 'No active session. Please reconnect to Home Assistant.'
      loading.value = false
      loadingProgress.value = ''
      modelLoaded.value = false
      return
    }

    // Fetch power data for the selected date
    loadingProgress.value = 'Fetching power data from Home Assistant...'
    // Need to start 50 minutes before midnight (23:10 previous day) to have enough 
    // lookback data for predicting from 00:00 (5 windows x 10 minutes = 50 minutes)
    const startDate = new Date(`${selectedDate.value}T00:00:00`)
    startDate.setMinutes(startDate.getMinutes() - 50) // Go back 50 minutes
    const endDate = new Date(`${selectedDate.value}T23:59:59`)

    const historyResponse = await fetch('http://localhost:3001/api/ha/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: props.sessionId,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString()
      })
    })

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text()
      if (historyResponse.status === 401) {
        throw new Error('Session expired. Please reconnect to Home Assistant in the Power Tagging tab.')
      }
      throw new Error(`Failed to fetch power data: ${historyResponse.status}`)
    }

    const historyText = await historyResponse.text()
    let historyData
    try {
      historyData = JSON.parse(historyText)
    } catch (e) {
      throw new Error('Invalid response from history endpoint')
    }
    
    powerData.value = historyData.data || []

    if (powerData.value.length === 0) {
      error.value = 'No power data available for this date'
      loading.value = false
      loadingProgress.value = ''
      return
    }

    loadingProgress.value = `Processing ${powerData.value.length} power readings...`

    // Call the prediction endpoint with sliding window
    const endpoint = useNewPredictor.value 
      ? 'http://localhost:3001/api/ml/predict-day-sliding'
      : 'http://localhost:3001/api/ml/predict-day'
    
    const requestBody = useNewPredictor.value
      ? {
          date: selectedDate.value,
          powerData: powerData.value,
          stepSize: stepSize.value,
          threshold: threshold.value
        }
      : {
          date: selectedDate.value,
          powerData: powerData.value
        }

    loadingProgress.value = useNewPredictor.value 
      ? `Running ML predictions (${stepSize.value} min steps)...`
      : 'Running ML predictions...'

    let result
    
    // Use fetch with streaming for real-time progress if using new predictor
    if (useNewPredictor.value) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
          if (response.status === 404) {
            modelLoaded.value = false
            throw new Error('No trained model found. Please train the model first in the ML Trainer tab.')
          }
          throw new Error(errorData.message || errorData.error || 'Prediction failed')
        } catch (e) {
          if (e.message.includes('No trained model')) {
            throw e
          }
          throw new Error(`Prediction failed: ${response.status}`)
        }
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              
              if (data.type === 'progress') {
                loadingProgress.value = data.message
              } else if (data.type === 'error') {
                throw new Error(data.message)
              } else if (data.type === 'result') {
                result = data.data
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } else {
      const predictResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!predictResponse.ok) {
        const errorText = await predictResponse.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
          if (predictResponse.status === 404) {
            modelLoaded.value = false
            throw new Error('No trained model found. Please train the model first in the ML Trainer tab.')
          }
          throw new Error(errorData.message || errorData.error || 'Prediction failed')
        } catch (e) {
          if (e.message.includes('No trained model')) {
            throw e
          }
          throw new Error(`Prediction failed: ${predictResponse.status}`)
        }
      }

      const resultText = await predictResponse.text()
      try {
        result = JSON.parse(resultText)
      } catch (e) {
        throw new Error('Invalid response from prediction endpoint')
      }
    }
    
    // Model is loaded if we got here successfully
    modelLoaded.value = true
    loadingProgress.value = 'Processing predictions...'
    
    // Handle different response formats
    if (useNewPredictor.value && result.timeRanges) {
      // New sliding window format with minute-level predictions
      // Convert time ranges to display format
      predictions.value = result.timeRanges.map((range) => {
        const tags = range.tags || []
        const primaryTag = tags.length > 0 ? tags[0].tag : 'standby'
        return {
          startTime: range.startTime,
          endTime: range.endTime,
          tag: primaryTag,
          tags: tags, // All detected tags
          confidence: range.avgConfidence || (tags.length > 0 ? tags[0].prob : 0),
          avgPower: range.avgPower || 0,
          energy: range.energy || 0,
          standbyEnergy: 0, // Could be calculated if needed
          displayTag: primaryTag === 'standby' ? 'other' : primaryTag,
          color: getTagColor(primaryTag),
          allProbabilities: tags.map(t => ({ tag: t.tag, probability: t.prob }))
        }
      })
    } else {
      // Legacy format with 10-minute windows
      predictions.value = result.predictions.map((p) => ({
        ...p,
        displayTag: p.tag === 'standby' ? 'other' : p.tag,
        color: getTagColor(p.tag)
      }))
    }

    // Render charts
    loadingProgress.value = 'Rendering visualizations...'
    await nextTick()
    console.log('Rendering charts...')
    console.log('powerChartCanvas:', powerChartCanvas.value)
    console.log('pieChartCanvas:', pieChartCanvas.value)
    console.log('predictions length:', predictions.value.length)
    
    // Wait a bit more for DOM to be ready
    setTimeout(() => {
      console.log('After timeout - powerChartCanvas:', powerChartCanvas.value)
      console.log('After timeout - pieChartCanvas:', pieChartCanvas.value)
      renderPowerChart()
      renderPieChart()
    }, 100)

  } catch (err) {
    console.error('Prediction error:', err)
    error.value = err.message
  } finally {
    loading.value = false
    loadingProgress.value = ''
  }
}

const renderPowerChart = () => {
  console.log('renderPowerChart called, canvas:', powerChartCanvas.value)
  if (!powerChartCanvas.value) return

  console.log('powerData length:', powerData.value.length)
  console.log('predictions length:', predictions.value.length)
  
  if (powerData.value.length === 0) {
    console.warn('No power data available for chart')
    return
  }

  // Destroy existing chart
  if (powerChart.value) {
    powerChart.value.destroy()
  }

  const ctx = powerChartCanvas.value.getContext('2d')

  // Prepare data points - handle Home Assistant timestamp format
  // Filter to only show data from the selected day (not the previous day's lookback data)
  const dayStartTime = new Date(`${selectedDate.value}T00:00:00`).getTime()
  const dayEndTime = new Date(`${selectedDate.value}T23:59:59`).getTime()
  
  const dataPoints = powerData.value.map(d => {
    const timestamp = d.timestamp || d.last_changed || d.last_updated
    const value = parseFloat(d.value || d.state)
    return {
      x: new Date(timestamp),
      y: value
    }
  }).filter(d => {
    const time = d.x.getTime()
    return !isNaN(time) && !isNaN(d.y) && time >= dayStartTime && time <= dayEndTime
  })
  
  console.log('dataPoints sample:', dataPoints.slice(0, 3))
  
  if (dataPoints.length === 0) {
    console.warn('No valid data points after parsing')
    return
  }

  // Create segment colors based on predictions
  const segments = []
  predictions.value.forEach(pred => {
    segments.push({
      start: new Date(`${selectedDate.value}T${pred.startTime}`),
      end: new Date(`${selectedDate.value}T${pred.endTime}`),
      color: pred.color,
      tag: pred.displayTag || pred.tag // Use displayTag for showing "other"
    })
  })

  powerChart.value = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Power (W)',
        data: dataPoints,
        borderColor: '#2c3e50',
        backgroundColor: 'rgba(44, 62, 80, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        segment: {
          backgroundColor: (ctx) => {
            const x = ctx.p1.parsed.x
            for (const seg of segments) {
              if (x >= seg.start.getTime() && x <= seg.end.getTime()) {
                return seg.color + '40'
              }
            }
            return 'rgba(44, 62, 80, 0.1)'
          }
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 3,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const timestamp = context.parsed.x
              let tag = 'Unknown'
              for (const seg of segments) {
                if (timestamp >= seg.start.getTime() && timestamp <= seg.end.getTime()) {
                  tag = seg.tag
                  break
                }
              }
              return [
                `Power: ${context.parsed.y.toFixed(0)} W`,
                `Activity: ${tag}`
              ]
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'hour',
            displayFormats: {
              hour: 'HH:mm'
            }
          },
          title: {
            display: true,
            text: 'Time'
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Power (W)'
          }
        }
      }
    }
  })
}

const renderPieChart = () => {
  console.log('renderPieChart called, canvas:', pieChartCanvas.value)
  if (!pieChartCanvas.value) return

  // Destroy existing chart
  if (pieChart.value) {
    pieChart.value.destroy()
  }

  const ctx = pieChartCanvas.value.getContext('2d')

  const tags = Object.keys(energyByTag.value)
  const energies = tags.map(tag => energyByTag.value[tag])
  // Use the same color mapping function as the power chart
  const colors = tags.map(tag => getTagColor(tag))

  pieChart.value = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: tags,
      datasets: [{
        data: energies,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.5,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            generateLabels: (chart) => {
              const data = chart.data
              return data.labels.map((label, i) => ({
                text: `${label}: ${data.datasets[0].data[i].toFixed(1)} Wh`,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }))
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || ''
              const value = context.parsed
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = ((value / total) * 100).toFixed(1)
              return `${label}: ${value.toFixed(2)} Wh (${percentage}%)`
            }
          }
        }
      }
    }
  })
}

// Lifecycle
onMounted(() => {
  // Don't auto-load on mount - wait for user to click Analyze button
})

// Watch for sessionId changes - don't auto-analyze, just clear any error state
watch(() => props.sessionId, (newSessionId) => {
  if (newSessionId && error.value.includes('session')) {
    error.value = ''
  }
})

onUnmounted(() => {
  if (powerChart.value) {
    powerChart.value.destroy()
  }
  if (pieChart.value) {
    pieChart.value.destroy()
  }
})
</script>

<style scoped>
.power-detector {
  padding: 1.5rem;
  max-width: 1600px;
  margin: 0 auto;
}

.detector-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.detector-header h2 {
  font-size: 1.75rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.description {
  color: #666;
  font-size: 0.95rem;
}

.dialog-overlay {
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

.dialog-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 1.5rem;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #95a5a6;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #ecf0f1;
  color: #2c3e50;
}

.dialog-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.dialog-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #ecf0f1;
  display: flex;
  justify-content: flex-end;
}

.btn-close {
  padding: 0.5rem 1.5rem;
  background: #5b9bd5;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #4a8bc2;
  transform: translateY(-1px);
}

.config-item {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.config-item label {
  font-weight: 500;
  color: #555;
}

.config-item select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  color: #2c3e50;
  font-size: 0.95rem;
}

.config-item input[type="range"] {
  width: 100%;
}

.config-value {
  font-weight: 600;
  color: #3498db;
  margin-left: 0.5rem;
}

.config-hint {
  font-size: 0.85rem;
  color: #95a5a6;
  font-style: italic;
}

.config-item.checkbox {
  flex-direction: row;
  align-items: center;
}

.config-item.checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.config-item.checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.date-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.current-date {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.current-date input[type="date"] {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
}

.current-date span {
  font-weight: 600;
  color: #2c3e50;
}

.nav-btn, .btn-analyze, .btn-settings {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.nav-btn {
  background: #42b983;
  color: white;
}

.nav-btn:hover {
  background: #359668;
  transform: translateY(-1px);
}

.btn-analyze {
  background: #5b9bd5;
  color: white;
}

.btn-analyze:hover:not(:disabled) {
  background: #4a8bc2;
  transform: translateY(-1px);
}

.btn-analyze:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-settings {
  background: #95a5a6;
  color: white;
}

.btn-settings:hover {
  background: #7f8c8d;
  transform: translateY(-1px);
}

.status-warning {
  background: #fff3cd;
  color: #856404;
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  text-align: center;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  color: #666;
  font-size: 1.1rem;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #42b983;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  text-align: center;
}

.charts-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.chart-section {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.chart-section.full-width {
  grid-column: 1 / -1;
}

.chart-section h3 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.25rem;
}

.chart-wrapper {
  position: relative;
  width: 100%;
  height: 300px;
}

.power-chart-wrapper {
  height: 400px;
}

.pie-wrapper {
  height: 350px;
}

.legend-info {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #666;
  text-align: center;
}

.stats-summary {
  padding: 1rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 0.95rem;
}

.stat-item .label {
  color: #666;
  font-weight: 500;
}

.stat-item .value {
  color: #2c3e50;
  font-weight: 700;
  font-size: 1.1rem;
}

.predictions-table {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.accordion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 0.5rem 0;
  transition: opacity 0.2s;
}

.accordion-header:hover {
  opacity: 0.7;
}

.accordion-icon {
  font-size: 1rem;
  color: #666;
  transition: transform 0.2s;
}

.accordion-content {
  margin-top: 1rem;
}

.predictions-table h3 {
  margin-bottom: 0;
  color: #2c3e50;
  font-size: 1.25rem;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #f8f9fa;
}

th {
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 2px solid #dee2e6;
}

td {
  padding: 0.75rem;
  border-bottom: 1px solid #dee2e6;
}

tbody tr:hover {
  background: #f8f9fa;
}

.tag-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0.125rem;
}

.multi-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.confidence-bar {
  position: relative;
  width: 100%;
  height: 24px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
}

.confidence-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #42b983, #5b9bd5);
  transition: width 0.3s;
}

.confidence-text {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.8rem;
  font-weight: 600;
  color: #2c3e50;
  z-index: 1;
}

@media (max-width: 1200px) {
  .charts-container {
    grid-template-columns: 1fr;
  }
  
  .chart-section.full-width {
    grid-column: 1;
  }
}

@media (max-width: 768px) {
  .date-selector {
    flex-direction: column;
  }
  
  .power-detector {
    padding: 1rem;
  }
}
</style>
