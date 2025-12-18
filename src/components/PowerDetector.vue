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
              <input type="checkbox" v-model="useSeq2Point" @change="onSeq2PointToggle" />
              Enable Seq2Point energy disaggregation
            </label>
          </div>
          <div v-if="useSeq2Point" class="config-item">
            <label>Seq2Point Models to Analyze:</label>
            <div v-if="loadingModels" class="config-hint">Loading models...</div>
            <div v-else-if="seq2pointModels.length === 0" class="config-hint">
              Train a seq2point model first using: node server/ml/seq2point-train.js "appliance_name"
            </div>
            <div v-else class="model-checkboxes">
              <label v-for="model in seq2pointModels" :key="model" class="checkbox-label">
                <input 
                  type="checkbox" 
                  :value="model" 
                  v-model="selectedSeq2PointModels"
                />
                <span>{{ model }}</span>
              </label>
            </div>
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
        <div class="chart-header">
          <h3>📊 Power Consumption with Predicted Tags</h3>
          <div v-if="selectedAppliance" class="filter-badge">
            <span class="filter-label">Filtered by:</span>
            <span class="filter-appliance" :style="{ backgroundColor: getTagColor(selectedAppliance) }">
              {{ selectedAppliance }}
            </span>
            <button @click="clearApplianceFilter" class="clear-filter-btn" title="Show all appliances">✕</button>
          </div>
        </div>
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
        <div class="legend-info">
          💡 Click on a slice to filter the power chart by appliance
        </div>
      </div>

      <div class="chart-section">
        <h3>📊 Energy Breakdown</h3>
        <div class="stats-summary">
          <div class="stat-item highlight">
            <span class="label">💡 Appliance Energy:</span>
            <span class="value">{{ totalEnergy.toFixed(2) }} Wh</span>
          </div>
          <div class="stat-item highlight">
            <span class="label">🔋 Standby Energy:</span>
            <span class="value">{{ totalStandbyEnergy.toFixed(2) }} Wh</span>
          </div>
          <div class="stat-item highlight">
            <span class="label">❓ Other Energy:</span>
            <span class="value">{{ otherEnergy.toFixed(2) }} Wh</span>
          </div>
          <div class="stat-item total">
            <span class="label">📊 Total Energy:</span>
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
                  <div v-if="pred.tags && pred.tags.length > 0" class="multi-tags">
                    <span 
                      v-for="(tagInfo, tidx) in pred.tags" 
                      :key="tidx"
                      class="tag-badge with-probability" 
                      :style="{ backgroundColor: getTagColor(tagInfo.tag) }"
                      :title="`${tagInfo.probability ? (tagInfo.probability * 100).toFixed(1) : '0.0'}%`"
                    >
                      <span class="tag-name">{{ tagInfo.tag === 'standby' ? 'other' : tagInfo.tag }}</span>
                      <span class="tag-probability">{{ tagInfo.probability ? (tagInfo.probability * 100).toFixed(1) : '0.0' }}%</span>
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
const threshold = ref(0.25) // Default 25% threshold for detection

// Seq2point configuration
const useSeq2Point = ref(true) // Enable seq2point by default
const seq2pointModels = ref([])
const selectedSeq2PointModels = ref([]) // Array of selected model names
const loadingModels = ref(false)

// Appliance filter for power chart
const selectedAppliance = ref(null)

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
  // Get standby energy from energyByTag (calculated from minimum power)
  return energyByTag.value['standby'] || 0
})

const otherEnergy = computed(() => {
  // Other energy = actual total - standby - appliances
  // This ensures the sum equals actual total energy
  const other = actualTotalEnergy.value - totalStandbyEnergy.value - totalEnergy.value
  return Math.max(0, other) // Ensure non-negative
})

const totalCombinedEnergy = computed(() => {
  // Total energy: appliance + standby + other
  return totalEnergy.value + totalStandbyEnergy.value + otherEnergy.value
})

const actualTotalEnergy = computed(() => {
  // Calculate actual total energy from power curve using trapezoidal integration
  // Include full intervals if any part overlaps with the selected day
  if (powerData.value.length < 2) return 0
  
  const dayStartTime = new Date(`${selectedDate.value}T00:00:00`).getTime()
  const dayEndTime = new Date(`${selectedDate.value}T23:59:59`).getTime()
  
  let totalEnergy = 0
  
  for (let i = 0; i < powerData.value.length - 1; i++) {
    const current = powerData.value[i]
    const next = powerData.value[i + 1]
    
    const currentTime = new Date(current.timestamp || current.last_changed || current.last_updated).getTime()
    const nextTime = new Date(next.timestamp || next.last_changed || next.last_updated).getTime()
    
    // Validate timestamps
    if (isNaN(currentTime) || isNaN(nextTime)) continue
    
    // Skip if interval is completely outside the day range
    if (nextTime <= dayStartTime || currentTime >= dayEndTime) continue
    
    // Get power values
    const currentPower = parseFloat(current.value || current.state || 0)
    const nextPower = parseFloat(next.value || next.state || 0)
    
    // Validate power values
    if (isNaN(currentPower) || isNaN(nextPower)) continue
    
    const duration = (nextTime - currentTime) / (1000 * 60 * 60) // hours
    
    // Validate duration
    if (isNaN(duration) || duration <= 0 || duration > 24) continue
    
    // Trapezoidal rule: average of start and end power × full duration
    // Use full interval duration to capture all energy
    const avgPower = (currentPower + nextPower) / 2
    const energy = avgPower * duration
    
    // Validate energy before adding
    if (!isNaN(energy) && isFinite(energy)) {
      totalEnergy += energy
    }
  }
  
  // Return 0 if result is invalid
  return isNaN(totalEnergy) || !isFinite(totalEnergy) ? 0 : totalEnergy
})

const energyErrorRate = computed(() => {
  // Calculate error rate: (predicted - actual) / actual * 100
  if (actualTotalEnergy.value === 0) return 0
  const error = ((totalCombinedEnergy.value - actualTotalEnergy.value) / actualTotalEnergy.value) * 100
  return error
})

const avgPower = computed(() => {
  if (predictions.value.length === 0) return 0
  const sum = predictions.value.reduce((s, p) => s + p.avgPower, 0)
  return sum / predictions.value.length
})

const energyByTag = computed(() => {
  const byTag = {}
  
  // Special handling for seq2point: show each appliance separately
  if (useSeq2Point.value && selectedSeq2PointModels.value.length > 0) {
    // Calculate energy for each appliance from predictions
    predictions.value.forEach(p => {
      const appliance = p.tag
      if (!byTag[appliance]) {
        byTag[appliance] = 0
      }
      byTag[appliance] += p.energy || 0
    })
    
    // Calculate total aggregate energy, standby (minimum power), and other
    const dayStartTime = new Date(`${selectedDate.value}T00:00:00`).getTime()
    const dayEndTime = new Date(`${selectedDate.value}T23:59:59`).getTime()
    
    // Build a set of tagged time periods (times when appliances are detected)
    const taggedPeriods = predictions.value.map(p => ({
      start: new Date(`${selectedDate.value}T${p.startTime}`).getTime(),
      end: new Date(`${selectedDate.value}T${p.endTime}`).getTime()
    }))
    
    // Find minimum power reading for standby calculation
    let minPower = Infinity
    let totalAggregateEnergy = 0
    let untaggedEnergy = 0
    let untaggedDuration = 0
    let totalDayDuration = 0
    
    for (let i = 0; i < powerData.value.length - 1; i++) {
      const current = powerData.value[i]
      const next = powerData.value[i + 1]
      
      const currentTime = new Date(current.timestamp || current.last_changed || current.last_updated).getTime()
      const nextTime = new Date(next.timestamp || next.last_changed || next.last_updated).getTime()
      
      // Only count energy within the selected day
      if (currentTime >= dayStartTime && currentTime <= dayEndTime) {
        const power = parseFloat(current.value || current.state || 0)
        const duration = (nextTime - currentTime) / (1000 * 60 * 60) // hours
        const energy = power * duration
        
        totalAggregateEnergy += energy
        totalDayDuration += duration
        
        // Track minimum power for standby
        if (power < minPower) {
          minPower = power
        }
        
        // Check if this timestamp falls within any tagged period
        const isTagged = taggedPeriods.some(period => 
          currentTime >= period.start && currentTime < period.end
        )
        
        // If not tagged, accumulate untagged energy
        if (!isTagged) {
          untaggedEnergy += energy
          untaggedDuration += duration
        }
      }
    }
    
    // Calculate standby energy: minimum power × total day duration
    const totalStandbyEnergy = minPower !== Infinity ? minPower * totalDayDuration : 0
    
    // Add standby energy (baseline consumption)
    if (totalStandbyEnergy > 0 && minPower !== Infinity) {
      byTag['standby'] = totalStandbyEnergy
    }
    
    // Calculate "other" energy: untagged power above standby
    // Other = energy during untagged periods - standby baseline for those periods
    const standbyDuringUntagged = minPower !== Infinity ? minPower * untaggedDuration : 0
    const otherEnergy = Math.max(0, untaggedEnergy - standbyDuringUntagged)
    if (otherEnergy > 0) {
      byTag['other'] = otherEnergy
    }
    
    return byTag
  }
  
  // Regular handling for multi-label or legacy predictions
  predictions.value.forEach(p => {
    // Single label case (legacy predictor)
    const tagName = p.tag === 'standby' ? 'other' : p.tag
    if (!byTag[tagName]) {
      byTag[tagName] = 0
    }
    byTag[tagName] += p.energy || 0
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

const clearApplianceFilter = () => {
  selectedAppliance.value = null
  renderPowerChart()
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
  if (tag === 'standby') {
    colorMap.value['standby'] = '#BDC3C7' // Light gray for standby
    return '#BDC3C7'
  }
  if (tag === 'other') {
    colorMap.value['other'] = '#7F8C8D' // Darker gray for other
    return '#7F8C8D'
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

const loadSeq2PointModels = async () => {
  loadingModels.value = true
  try {
    const response = await fetch('http://localhost:3001/api/seq2point/models')
    if (response.ok) {
      const data = await response.json()
      // Extract just the appliance names from the model objects
      seq2pointModels.value = (data.models || []).map(m => m.appliance)
      // Select all models by default
      if (seq2pointModels.value.length > 0 && selectedSeq2PointModels.value.length === 0) {
        selectedSeq2PointModels.value = [...seq2pointModels.value]
      }
    } else {
      console.error('Failed to load seq2point models')
      seq2pointModels.value = []
    }
  } catch (err) {
    console.error('Error loading seq2point models:', err)
    seq2pointModels.value = []
  } finally {
    loadingModels.value = false
  }
}

const onSeq2PointToggle = () => {
  if (useSeq2Point.value && seq2pointModels.value.length === 0) {
    loadSeq2PointModels()
  }
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
    // Fetch through the beginning of the next day to capture the last interval properly
    const endDate = new Date(`${selectedDate.value}T23:59:59`)
    endDate.setHours(endDate.getHours() + 1) // Add 1 hour to get into next day

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

    // Use seq2point API if enabled
    if (useSeq2Point.value) {
      if (selectedSeq2PointModels.value.length === 0) {
        throw new Error('Please select at least one seq2point model in settings')
      }
      
      // Transform powerData to ensure it has the right format (power/value field)
      const formattedPowerData = powerData.value.map(dp => ({
        timestamp: dp.timestamp || dp.last_changed || dp.last_updated,
        power: parseFloat(dp.power || dp.value || dp.state || 0)
      }))
      
      // Run predictions for all selected models
      const allWindows = []
      const appliancePowerData = {} // Store predicted power timeline for each appliance
      const windowSize = 10 * 60 * 1000 // 10 minutes in ms - define at broader scope
      
      for (let i = 0; i < selectedSeq2PointModels.value.length; i++) {
        const appliance = selectedSeq2PointModels.value[i]
        loadingProgress.value = `Running predictions for ${appliance} (${i + 1}/${selectedSeq2PointModels.value.length})...`
        
        const seq2pointResponse = await fetch('http://localhost:3001/api/seq2point/predict-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appliance: appliance,
            date: selectedDate.value,
            powerData: formattedPowerData
          })
        })
        
        if (!seq2pointResponse.ok) {
          const errorText = await seq2pointResponse.text()
          let errorData
          try {
            errorData = JSON.parse(errorText)
            console.warn(`Failed to predict ${appliance}:`, errorData.error || errorData.message)
            continue // Skip this appliance and continue with others
          } catch (e) {
            console.warn(`Failed to predict ${appliance}: ${seq2pointResponse.status}`)
            continue
          }
        }
        
        const seq2pointResult = await seq2pointResponse.json()
        
        // Transform seq2point predictions to match the expected format
        modelLoaded.value = true
        
        // Group predictions into 10-minute windows
        const dayStart = new Date(`${selectedDate.value}T00:00:00`).getTime()
        const dayEnd = new Date(`${selectedDate.value}T23:59:59`).getTime()
        
        // Use on/off classification from model if available
        const hasOnOffClassification = seq2pointResult.predictions.length > 0 && 
                                        seq2pointResult.predictions[0].onoffProbability !== null &&
                                        seq2pointResult.predictions[0].onoffProbability !== undefined
        
        // First, filter predictions based on on/off threshold
        const filteredPredictions = seq2pointResult.predictions.map(p => {
          let onoffProb = 0
          
          if (hasOnOffClassification) {
            // Use the on/off classifier probability directly
            onoffProb = p.onoffProbability || 0
          } else {
            // Fallback: calculate probability based on power level
            // Normalize power to 0-1 range: 0W = 0%, 500W+ = 100%
            const power = p.predictedPower || p.power || 0
            onoffProb = Math.min(1.0, power / 500)
          }
          
          // Apply threshold: if below threshold, set predicted power to 0
          return {
            ...p,
            predictedPower: onoffProb >= threshold.value ? (p.predictedPower || p.power || 0) : 0,
            onoffProbability: onoffProb,
            thresholdPassed: onoffProb >= threshold.value
          }
        })
        
        // Store predicted power timeline for this appliance
        appliancePowerData[appliance] = filteredPredictions.map(p => ({
          x: new Date(p.timestamp),
          y: p.predictedPower,
          probability: p.onoffProbability
        }))
        
        for (let time = dayStart; time < dayEnd; time += windowSize) {
          const windowEnd = Math.min(time + windowSize, dayEnd)
          const windowPredictions = filteredPredictions.filter(p => {
            const predTime = new Date(p.timestamp).getTime()
            return predTime >= time && predTime < windowEnd
          })
          
          if (windowPredictions.length > 0) {
            // Calculate average power only from predictions that passed threshold
            const activePredictions = windowPredictions.filter(p => p.thresholdPassed)
            
            if (activePredictions.length > 0) {
              // Use trapezoidal integration for energy calculation (same as actual total)
              let windowEnergy = 0
              for (let i = 0; i < activePredictions.length - 1; i++) {
                const current = activePredictions[i]
                const next = activePredictions[i + 1]
                const currentTime = new Date(current.timestamp).getTime()
                const nextTime = new Date(next.timestamp).getTime()
                const duration = (nextTime - currentTime) / (1000 * 60 * 60) // hours
                
                if (duration > 0 && duration < 1) { // Sanity check
                  // Trapezoidal rule: average of start and end power × duration
                  const avgPower = (current.predictedPower + next.predictedPower) / 2
                  windowEnergy += avgPower * duration
                }
              }
              
              // Calculate average power and probability for display
              const avgPower = activePredictions.reduce((sum, p) => sum + p.predictedPower, 0) / activePredictions.length
              const avgOnOffProb = activePredictions.reduce((sum, p) => sum + p.onoffProbability, 0) / activePredictions.length
              
              allWindows.push({
                startTime: format(new Date(time), 'HH:mm'),
                endTime: format(new Date(windowEnd), 'HH:mm'),
                tag: appliance,
                displayTag: appliance,
                confidence: avgOnOffProb,
                avgPower: avgPower,
                energy: windowEnergy, // Use trapezoidal integration result
                standbyEnergy: 0,
                color: getTagColor(appliance),
                tags: [{ tag: appliance, probability: avgOnOffProb }],
                windowTime: time // Store window start time for limiting
              })
            }
          }
        }
      }
      
      // Sort predictions by time (chronologically)
      allWindows.sort((a, b) => {
        const timeA = new Date(`${selectedDate.value}T${a.startTime}`).getTime()
        const timeB = new Date(`${selectedDate.value}T${b.startTime}`).getTime()
        return timeA - timeB
      })
      
      // Limit total predicted power per window to maximum actual power
      // Group windows by time period
      const windowsByTime = {}
      allWindows.forEach(window => {
        const key = window.startTime
        if (!windowsByTime[key]) {
          windowsByTime[key] = []
        }
        windowsByTime[key].push(window)
      })
      
      // For each time period with multiple appliances, check if total exceeds actual max power
      Object.keys(windowsByTime).forEach(timeKey => {
        const windows = windowsByTime[timeKey]
        if (windows.length > 1) {
          // Multiple appliances detected in this period
          const totalPredictedPower = windows.reduce((sum, w) => sum + w.avgPower, 0)
          
          // Find maximum actual power in this window
          const windowStart = new Date(`${selectedDate.value}T${timeKey}`).getTime()
          const windowEnd = windowStart + windowSize
          
          const actualPowersInWindow = powerData.value
            .filter(d => {
              const time = new Date(d.timestamp || d.last_changed || d.last_updated).getTime()
              return time >= windowStart && time < windowEnd
            })
            .map(d => parseFloat(d.value || d.state || 0))
          
          const maxActualPower = actualPowersInWindow.length > 0 
            ? Math.max(...actualPowersInWindow) 
            : totalPredictedPower
          
          // If total predicted exceeds actual, scale down proportionally
          if (totalPredictedPower > maxActualPower) {
            // Sort windows by predicted power (descending) to identify highest consumers
            windows.sort((a, b) => b.avgPower - a.avgPower)
            
            const scaleFactor = maxActualPower / totalPredictedPower
            
            // Apply scaling to all appliances proportionally
            windows.forEach(window => {
              window.avgPower = window.avgPower * scaleFactor
              window.energy = window.avgPower * 10 / 60 // Recalculate energy
            })
          }
        }
      })
      
      predictions.value = allWindows
      
      // Store all appliance power data for chart overlay
      powerData.value.appliancePowerData = appliancePowerData
      
      loadingProgress.value = 'Processing predictions...'
      
      // Only render charts if we have predictions
      if (predictions.value.length > 0) {
        // Render charts
        loadingProgress.value = 'Rendering visualizations...'
        await nextTick()
        setTimeout(() => {
          renderPowerChart()
          renderPieChart()
        }, 100)
      } else {
        // No appliance activity detected
        error.value = `No appliance activity detected above the ${(threshold.value * 100).toFixed(0)}% confidence threshold on this day. Try lowering the threshold in settings.`
      }
      
      loading.value = false
      loadingProgress.value = ''
      return
    }

    // Call the legacy prediction endpoint
    const endpoint = 'http://localhost:3001/api/ml/predict-day'
    const requestBody = {
      date: selectedDate.value,
      powerData: powerData.value
    }

    loadingProgress.value = 'Running ML predictions...'

    let result
    
    // Use standard fetch (no streaming needed for legacy predictor)
    if (false) {
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
      
      // Check if we got a result
      if (!result) {
        throw new Error('No result received from prediction endpoint')
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
    
    // Validate result
    if (!result || !result.predictions) {
      throw new Error('Invalid prediction result received from server')
    }
    
    // Handle legacy prediction format
    if (result.predictions) {
      predictions.value = result.predictions.map((p) => {
        
        // If there are multiple tags, find the highest confidence tag that is NOT "other" or "standby"
        let displayTag = p.tag
        let displayColor = getTagColor(p.tag)
        
        if (p.tags && Array.isArray(p.tags) && p.tags.length > 0) {
          // Filter out "other" and "standby" tags
          const nonOtherTags = p.tags.filter(t => 
            t.tag !== 'standby' && t.tag !== 'other'
          )
          
          // If we have non-other tags, use the one with highest confidence
          if (nonOtherTags.length > 0) {
            // Sort by probability/confidence descending
            const sortedTags = nonOtherTags.sort((a, b) => {
              const probA = a.probability || a.prob || 0
              const probB = b.probability || b.prob || 0
              return probB - probA
            })
            displayTag = sortedTags[0].tag
            displayColor = getTagColor(displayTag)
          } else {
            // Only "other"/"standby" tags present
            displayTag = 'other'
            displayColor = getTagColor('other')
          }
        } else {
          // Single tag case
          displayTag = p.tag === 'standby' ? 'other' : p.tag
          displayColor = getTagColor(displayTag)
        }
        
        return {
          ...p,
          displayTag: displayTag,
          color: displayColor
        }
      })
    }

    // Render charts only if we have predictions
    if (predictions.value.length > 0) {
      loadingProgress.value = 'Rendering visualizations...'
      await nextTick()
      // Wait a bit more for DOM to be ready
      setTimeout(() => {
        renderPowerChart()
        renderPieChart()
      }, 100)
    } else {
      error.value = 'No appliance activity detected for this day'
    }

  } catch (err) {
    console.error('Prediction error:', err)
    error.value = err.message
  } finally {
    loading.value = false
    loadingProgress.value = ''
  }
}

const renderPowerChart = () => {
  if (!powerChartCanvas.value) return
  
  if (powerData.value.length === 0) {
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
  
  if (dataPoints.length === 0) {
    return
  }

  // Create segment colors based on predictions
  // Filter by selected appliance if one is selected
  const segments = []
  predictions.value.forEach(pred => {
    // Check if this prediction matches the selected appliance
    let matches = !selectedAppliance.value // If no filter, include all
    
    if (selectedAppliance.value) {
      const applianceName = selectedAppliance.value
      
      // Check if this prediction contains the selected appliance
      if (pred.tags && Array.isArray(pred.tags)) {
        matches = pred.tags.some(t => {
          const tagName = t.tag === 'standby' ? 'other' : t.tag
          return tagName === applianceName || (applianceName === 'other' && t.tag === 'standby')
        })
      } else {
        const predTag = pred.displayTag || pred.tag
        matches = predTag === applianceName || (applianceName === 'other' && predTag === 'standby')
      }
    }
    
    if (matches) {
      segments.push({
        start: new Date(`${selectedDate.value}T${pred.startTime}`),
        end: new Date(`${selectedDate.value}T${pred.endTime}`),
        color: pred.color,
        tag: pred.displayTag || pred.tag // Use displayTag for showing "other"
      })
    }
  })

  // Filter data points to only show periods matching the selected appliance
  let filteredDataPoints = dataPoints
  if (selectedAppliance.value && segments.length > 0) {
    filteredDataPoints = dataPoints.filter(point => {
      const pointTime = point.x.getTime()
      // Check if this point falls within any of the filtered segments
      return segments.some(seg => pointTime >= seg.start.getTime() && pointTime <= seg.end.getTime())
    })
  }

  // Build datasets array - start with aggregate power
  const datasets = [{
    label: selectedAppliance.value ? `Power (W) - ${selectedAppliance.value}` : 'Power (W)',
    data: filteredDataPoints,
    borderColor: selectedAppliance.value ? getTagColor(selectedAppliance.value) : '#2c3e50',
    backgroundColor: selectedAppliance.value ? getTagColor(selectedAppliance.value) + '40' : 'rgba(44, 62, 80, 0.1)',
    borderWidth: 2,
    fill: true,
    tension: 0.1,
    pointRadius: 0,
    pointHoverRadius: 4,
    yAxisID: 'y',
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
  
  // If we have predicted power data from seq2point, add overlays for each appliance
  if (powerData.value.appliancePowerData && useSeq2Point.value) {
    // Add a dataset for each appliance
    Object.keys(powerData.value.appliancePowerData).forEach(appliance => {
      const applianceData = powerData.value.appliancePowerData[appliance]
      const applianceColor = getTagColor(appliance)
      
      // Only show if no filter is active, or if this is the filtered appliance
      if (!selectedAppliance.value || selectedAppliance.value === appliance) {
        datasets.push({
          label: `${appliance} Predicted Power`,
          data: applianceData.filter(d => {
            const time = d.x.getTime()
            return time >= dayStartTime && time <= dayEndTime
          }).map(d => ({ x: d.x, y: d.y })),
          borderColor: applianceColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'y'
        })
      }
    })
  }

  powerChart.value = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: datasets
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
          position: 'top',
          onClick: (e, legendItem, legend) => {
            const index = legendItem.datasetIndex
            const chart = legend.chart
            const meta = chart.getDatasetMeta(index)
            
            // Toggle visibility
            meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null
            chart.update()
          },
          labels: {
            usePointStyle: false,
            padding: 15,
            font: {
              size: 12
            }
          }
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
              
              // Customize tooltip based on dataset
              if (context.dataset.label.includes('Probability')) {
                return `${context.dataset.label}: ${(context.parsed.y * 100).toFixed(1)}%`
              } else if (context.dataset.label.includes('Predicted')) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(0)} W`
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
          },
          position: 'left'
        },
        y2: {
          beginAtZero: true,
          max: 1,
          title: {
            display: true,
            text: 'ON/OFF Probability'
          },
          position: 'right',
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  })
}

const renderPieChart = () => {
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
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const appliance = tags[index]
          selectedAppliance.value = appliance
          renderPowerChart()
        }
      },
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
  // Load available seq2point models since it's the default
  loadSeq2PointModels()
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

.model-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fafafa;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.checkbox-label:hover {
  background: #f0f0f0;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label span {
  font-size: 0.95rem;
  color: #2c3e50;
  font-weight: 500;
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

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chart-section h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.25rem;
}

.filter-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border-radius: 20px;
  font-size: 0.9rem;
}

.filter-label {
  color: #666;
  font-weight: 500;
}

.filter-appliance {
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.85rem;
}

.clear-filter-btn {
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.clear-filter-btn:hover {
  background: #c0392b;
  transform: scale(1.1);
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

.stat-item.highlight {
  background: #e8f5e9;
  border-left: 4px solid #4caf50;
}

.stat-item.total {
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
  font-size: 1.05rem;
}

.stat-item.total .value {
  font-size: 1.2rem;
  color: #1976d2;
}

.stat-item.error-low {
  background: #e8f5e9;
  border-left: 4px solid #4caf50;
}

.stat-item.error-high {
  background: #ffebee;
  border-left: 4px solid #f44336;
}

.stat-item.error-low .value {
  color: #2e7d32;
}

.stat-item.error-high .value {
  color: #c62828;
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

.tag-badge.with-probability {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
}

.tag-name {
  font-weight: 600;
}

.tag-probability {
  font-size: 0.75rem;
  opacity: 0.9;
  background: rgba(0, 0, 0, 0.15);
  padding: 0.125rem 0.375rem;
  border-radius: 8px;
  font-weight: 500;
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
