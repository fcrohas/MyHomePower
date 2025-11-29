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
      Analyzing power consumption patterns...
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
            <span class="label">Total Energy:</span>
            <span class="value">{{ totalEnergy.toFixed(2) }} Wh</span>
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
                <th>Predicted Tag</th>
                <th>Confidence</th>
                <th>Avg Power</th>
                <th>Energy (Wh)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pred, idx) in predictions" :key="idx">
                <td>{{ pred.startTime }} - {{ pred.endTime }}</td>
                <td>
                  <span class="tag-badge" :style="{ backgroundColor: pred.color }">
                    {{ pred.tag }}
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
const modelLoaded = ref(false)
const error = ref('')
const predictions = ref([])
const powerData = ref([])
const powerChart = ref(null)
const pieChart = ref(null)
const powerChartCanvas = ref(null)
const pieChartCanvas = ref(null)
const showDetailedPredictions = ref(false)

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
  return predictions.value.reduce((sum, p) => sum + p.energy, 0)
})

const avgPower = computed(() => {
  if (predictions.value.length === 0) return 0
  const sum = predictions.value.reduce((s, p) => s + p.avgPower, 0)
  return sum / predictions.value.length
})

const energyByTag = computed(() => {
  const byTag = {}
  predictions.value.forEach(p => {
    if (!byTag[p.tag]) {
      byTag[p.tag] = 0
    }
    byTag[p.tag] += p.energy
  })
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
  if (!colorMap.value[tag]) {
    colorMap.value[tag] = tagColors[Object.keys(colorMap.value).length % tagColors.length]
  }
  return colorMap.value[tag]
}

const loadAndPredict = async () => {
  // Clear existing data first
  predictions.value = []
  powerData.value = []
  loading.value = true
  error.value = ''

  try {
    // Check if we have a valid session
    if (!props.sessionId) {
      error.value = 'No active session. Please reconnect to Home Assistant.'
      loading.value = false
      modelLoaded.value = false
      return
    }

    // Fetch power data for the selected date
    const startDate = new Date(`${selectedDate.value}T00:00:00`)
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
      return
    }

    // Call the prediction endpoint with sliding window
    const predictResponse = await fetch('http://localhost:3001/api/ml/predict-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate.value,
        powerData: powerData.value
      })
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
    let result
    try {
      result = JSON.parse(resultText)
    } catch (e) {
      throw new Error('Invalid response from prediction endpoint')
    }
    
    // Model is loaded if we got here successfully
    modelLoaded.value = true
    
    predictions.value = result.predictions.map((p) => ({
      ...p,
      color: getTagColor(p.tag)
    }))

    // Render charts
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
  const dataPoints = powerData.value.map(d => {
    const timestamp = d.timestamp || d.last_changed || d.last_updated
    const value = parseFloat(d.value || d.state)
    return {
      x: new Date(timestamp),
      y: value
    }
  }).filter(d => !isNaN(d.x.getTime()) && !isNaN(d.y))
  
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
      tag: pred.tag
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
  const colors = tags.map(tag => colorMap.value[tag])

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
  // Only load if we have a sessionId
  if (props.sessionId) {
    loadAndPredict()
  }
})

// Watch for sessionId changes
watch(() => props.sessionId, (newSessionId) => {
  if (newSessionId) {
    loadAndPredict()
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

.nav-btn, .btn-analyze {
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
