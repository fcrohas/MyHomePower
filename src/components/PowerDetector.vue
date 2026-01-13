<template>
  <div class="power-detector">
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
      {{ loadingProgress }}
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Charts Container -->
    <div v-if="predictions.length > 0 && !loading" class="charts-container">
      <!-- Left Column: Power Chart and Predictions Table -->
      <div class="left-column">
        <div class="chart-section">
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

        <!-- Detailed Predictions Table -->
        <div class="predictions-table-inline">
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
                      <span v-else class="tag-badge" style="background-color: #95a5a6;">other</span>
                    </td>
                    <td>
                      <div v-if="pred.tags && pred.tags.length > 0 && pred.tags[0].probability !== undefined" class="confidence-bar">
                        <div class="confidence-fill" :style="{ width: (pred.tags[0].probability * 100) + '%' }"></div>
                        <span class="confidence-text">{{ (pred.tags[0].probability * 100).toFixed(1) }}%</span>
                      </div>
                      <span v-else>N/A</span>
                    </td>
                    <td>{{ pred.avgPower?.toFixed(1) || 'N/A' }} W</td>
                    <td>{{ pred.energy?.toFixed(2) || 'N/A' }}</td>
                    <td>{{ pred.standbyEnergy?.toFixed(2) || 'N/A' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Energy Charts -->
      <div class="energy-charts-column">
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
        </div>
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
import { updateHASensor } from '../services/homeassistant'
import { startAutoPredictor, stopAutoPredictor, getAutoPredictorStatus, triggerManualRun } from '../services/autoPredictor'

const props = defineProps({
  sessionId: {
    type: String,
    required: false,
    default: ''
  },
  detectorSettings: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:detectorSettings'])

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

// Configuration - now using props instead of local state
const threshold = computed(() => props.detectorSettings.threshold)
const useSeq2Point = computed(() => props.detectorSettings.useSeq2Point)
const useGSP = computed(() => props.detectorSettings.useGSP)
const gspConfig = computed(() => props.detectorSettings.gspConfig)
const autoSyncToHA = computed(() => props.detectorSettings.autoSyncToHA)
const autoRunEnabled = computed(() => props.detectorSettings.autoRunEnabled)

// Seq2point configuration
const seq2pointModels = ref([])
const selectedSeq2PointModels = ref([]) // Array of selected model names
const loadingModels = ref(false)

// Home Assistant sensor sync configuration
const lastSyncTime = ref(null)
const syncStatus = ref(null)

// Automatic background predictions
const autoRunStatus = ref({
  enabled: false,
  isRunning: false,
  intervalMinutes: 60,
  lastRun: null,
  lastStatus: 'Not started'
})
const autoRunCheckInterval = ref(null)

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
    const response = await fetch('/api/seq2point/models')
    if (response.ok) {
      const data = await response.json()
      const previousModels = new Set(seq2pointModels.value)
      
      // Extract just the appliance names from the model objects
      seq2pointModels.value = (data.models || []).map(m => m.appliance)
      
      // Auto-select new models that weren't in the previous list
      if (seq2pointModels.value.length > 0) {
        if (selectedSeq2PointModels.value.length === 0) {
          // First load: select all models
          selectedSeq2PointModels.value = [...seq2pointModels.value]
        } else {
          // Keep existing selections and add new models
          const newModels = seq2pointModels.value.filter(m => !previousModels.has(m))
          selectedSeq2PointModels.value = [
            ...selectedSeq2PointModels.value.filter(m => seq2pointModels.value.includes(m)), // Keep existing valid selections
            ...newModels // Add new models
          ]
        }
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

// Watch for auto-run toggle changes
watch(() => props.detectorSettings.autoRunEnabled, async (enabled, oldEnabled) => {
  if (enabled === oldEnabled) return
  
  if (enabled) {
    try {
      // Start the auto-predictor with current configuration
      const config = {
        intervalMinutes: 60,
        useSeq2Point: useSeq2Point.value,
        selectedModels: selectedSeq2PointModels.value,
        useGSP: useGSP.value,
        gspConfig: gspConfig.value
      }
      
      await startAutoPredictor(props.sessionId, config)
      
      // Update status
      await updateAutoRunStatus()
      
      // Start polling for status updates
      startAutoRunStatusPolling()
    } catch (error) {
      console.error('Failed to start auto-predictor:', error)
      alert(`Failed to start automatic predictions: ${error.message}`)
    }
  } else {
    try {
      await stopAutoPredictor()
      stopAutoRunStatusPolling()
      autoRunStatus.value = {
        enabled: false,
        isRunning: false,
        intervalMinutes: 60,
        lastRun: null,
        lastStatus: 'Not started'
      }
    } catch (error) {
      console.error('Failed to stop auto-predictor:', error)
    }
  }
})

// Update auto-run status
const updateAutoRunStatus = async () => {
  try {
    const status = await getAutoPredictorStatus()
    autoRunStatus.value = status
  } catch (error) {
    console.error('Failed to get auto-predictor status:', error)
  }
}

// Start polling for status updates
const startAutoRunStatusPolling = () => {
  if (autoRunCheckInterval.value) {
    clearInterval(autoRunCheckInterval.value)
  }
  
  // Check status every 30 seconds
  autoRunCheckInterval.value = setInterval(updateAutoRunStatus, 30000)
}

// Stop polling for status updates
const stopAutoRunStatusPolling = () => {
  if (autoRunCheckInterval.value) {
    clearInterval(autoRunCheckInterval.value)
    autoRunCheckInterval.value = null
  }
}

// Trigger manual run
const triggerManualAutoRun = async () => {
  try {
    await triggerManualRun()
    setTimeout(updateAutoRunStatus, 2000) // Update status after 2 seconds
  } catch (error) {
    console.error('Failed to trigger manual run:', error)
    alert(`Failed to trigger manual run: ${error.message}`)
  }
}

// Format auto-run time
const formatAutoRunTime = (isoString) => {
  if (!isoString) return 'Never'
  try {
    const date = parseISO(isoString)
    return format(date, 'MMM dd, HH:mm:ss')
  } catch {
    return isoString
  }
}

// Sync predicted power data to Home Assistant sensors
const syncPredictionsToHA = async () => {
  if (!autoSyncToHA.value || !props.sessionId) {
    return
  }
  
  syncStatus.value = { type: 'info', message: 'Syncing sensors to Home Assistant...' }
  
  try {
    // Calculate accumulated energy for each appliance for the entire day
    const applianceEnergies = {}
    
    // Aggregate energy from all prediction windows
    predictions.value.forEach(pred => {
      const appliance = pred.tag
      if (appliance && appliance !== 'standby' && appliance !== 'other' && appliance !== 'baseline') {
        if (!applianceEnergies[appliance]) {
          applianceEnergies[appliance] = 0
        }
        // Add energy from this prediction window
        applianceEnergies[appliance] += pred.energy || 0
      }
    })
    
    // Update sensors with accumulated daily energy
    const updatePromises = []
    for (const [appliance, energy] of Object.entries(applianceEnergies)) {
      if (energy !== undefined) {
        const roundedEnergy = Math.round(energy * 100) / 100
        
        // Create sensor entity ID: sensor.p_ai_<appliance_name>
        // Sanitize appliance name for entity ID (lowercase, replace spaces with underscores)
        const sanitizedName = appliance.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        const entityId = `sensor.p_ai_${sanitizedName}`
        
        // First, mark any old sensor as unavailable to clean it up
        // This helps if the device_class changed from power to energy
        const cleanupPromise = updateHASensor(entityId, 'unavailable', {})
          .catch(() => {
            // Ignore errors - sensor might not exist
          })
        
        // Wait a moment then create the new sensor with correct attributes
        const promise = cleanupPromise.then(() => {
          // Create attributes for the sensor
          const attributes = {
            unit_of_measurement: 'Wh',
            device_class: 'energy',
            state_class: 'total_increasing',
            friendly_name: `Predicted ${appliance} Energy`,
            icon: 'mdi:lightning-bolt',
            source: 'AI Power Viewer',
            appliance: appliance,
            prediction_date: selectedDate.value,
            last_updated: new Date().toISOString()
          }
          
          // Update sensor in Home Assistant
          return updateHASensor(entityId, roundedEnergy, attributes)
        })
          .catch(err => {
            console.error(`Failed to update sensor ${entityId}:`, err)
            return { error: err.message, entityId }
          })
        
        updatePromises.push(promise)
      }
    }
    
    // Wait for all updates to complete
    const results = await Promise.all(updatePromises)
    const successCount = results.filter(r => !r.error).length
    const failCount = results.filter(r => r.error).length
    
    lastSyncTime.value = format(new Date(), 'HH:mm:ss')
    
    if (failCount === 0) {
      syncStatus.value = { 
        type: 'success', 
        message: `✅ Successfully synced ${successCount} sensor${successCount !== 1 ? 's' : ''} to Home Assistant` 
      }
    } else {
      syncStatus.value = { 
        type: 'warning', 
        message: `⚠️ Synced ${successCount}/${successCount + failCount} sensors (${failCount} failed)` 
      }
    }
  } catch (error) {
    console.error('Failed to sync predictions to HA:', error)
    syncStatus.value = { 
      type: 'error', 
      message: `❌ Sync failed: ${error.message}` 
    }
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

    const historyResponse = await fetch('/api/ha/history', {
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
        
        const seq2pointResponse = await fetch('/api/seq2point/predict-day', {
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
        // Set loading to false first so charts container becomes visible
        loading.value = false
        loadingProgress.value = ''
        
        // Render charts after DOM updates
        await nextTick()
        setTimeout(() => {
          renderPowerChart()
          renderPieChart()
        }, 100)
        
        // Sync predictions to Home Assistant if enabled (in background)
        if (autoSyncToHA.value) {
          syncPredictionsToHA().catch(err => {
            console.error('Background sync failed:', err)
          })
        }
      } else {
        // No appliance activity detected
        error.value = `No appliance activity detected above the ${(threshold.value * 100).toFixed(0)}% confidence threshold on this day. Try lowering the threshold in settings.`
        loading.value = false
        loadingProgress.value = ''
      }
      
      return
    }

    // Use GSP API if enabled
    if (useGSP.value) {
      loadingProgress.value = 'Running GSP disaggregation...'
      
      // Transform powerData to ensure it has the right format
      const formattedPowerData = powerData.value.map(dp => ({
        timestamp: dp.timestamp || dp.last_changed || dp.last_updated,
        power: parseFloat(dp.power || dp.value || dp.state || 0)
      }))
      
      // Call GSP API
      const gspResponse = await fetch('/api/gsp/analyze-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate.value,
          powerData: formattedPowerData,
          config: gspConfig.value
        })
      })
      
      if (!gspResponse.ok) {
        const errorText = await gspResponse.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
          throw new Error(errorData.error || errorData.message || 'GSP disaggregation failed')
        } catch (e) {
          throw new Error(`GSP disaggregation failed: ${gspResponse.status}`)
        }
      }
      
      const gspResult = await gspResponse.json()
      
      if (!gspResult.success) {
        throw new Error(gspResult.message || 'GSP disaggregation failed')
      }
      
      // Transform GSP results to prediction format
      modelLoaded.value = true
      const allWindows = []
      const windowSize = 10 * 60 * 1000 // 10 minutes in ms
      
      // For each appliance found by GSP
      if (gspResult.appliances && gspResult.appliances.length > 0) {
        loadingProgress.value = `Processing ${gspResult.appliances.length} detected appliances...`
        
        for (const appliance of gspResult.appliances) {
          const applianceTimeseries = appliance.timeseries || []
          
          // Group appliance activity into 10-minute windows
          const dayStart = new Date(`${selectedDate.value}T00:00:00`).getTime()
          const dayEnd = new Date(`${selectedDate.value}T23:59:59`).getTime()
          
          for (let time = dayStart; time < dayEnd; time += windowSize) {
            const windowEnd = Math.min(time + windowSize, dayEnd)
            
            // Find appliance power readings in this window
            const windowReadings = applianceTimeseries.filter(reading => {
              const readingTime = new Date(reading.timestamp).getTime()
              return readingTime >= time && readingTime < windowEnd && reading.power > 0
            })
            
            if (windowReadings.length > 0) {
              // Calculate average power and energy for this window
              const avgPower = windowReadings.reduce((sum, r) => sum + r.power, 0) / windowReadings.length
              
              // Use trapezoidal integration for energy
              let windowEnergy = 0
              for (let i = 0; i < windowReadings.length - 1; i++) {
                const current = windowReadings[i]
                const next = windowReadings[i + 1]
                const currentTime = new Date(current.timestamp).getTime()
                const nextTime = new Date(next.timestamp).getTime()
                const duration = (nextTime - currentTime) / (1000 * 60 * 60) // hours
                
                if (duration > 0 && duration < 1) {
                  const avgWindowPower = (current.power + next.power) / 2
                  windowEnergy += avgWindowPower * duration
                }
              }
              
              allWindows.push({
                startTime: format(new Date(time), 'HH:mm'),
                endTime: format(new Date(windowEnd), 'HH:mm'),
                tag: appliance.name,
                displayTag: appliance.name,
                confidence: 0.8, // GSP doesn't provide confidence, use fixed value
                avgPower: avgPower,
                energy: windowEnergy,
                standbyEnergy: 0,
                color: getTagColor(appliance.name),
                tags: [{ tag: appliance.name, probability: 0.8 }]
              })
            }
          }
        }
        
        // Sort predictions by time
        allWindows.sort((a, b) => {
          const timeA = new Date(`${selectedDate.value}T${a.startTime}`).getTime()
          const timeB = new Date(`${selectedDate.value}T${b.startTime}`).getTime()
          return timeA - timeB
        })
        
        predictions.value = allWindows
        loadingProgress.value = 'Processing predictions...'
        
        // Render charts if we have predictions
        if (predictions.value.length > 0) {
          // Set loading to false first so charts container becomes visible
          loading.value = false
          loadingProgress.value = ''
          
          // Render charts after DOM updates
          await nextTick()
          setTimeout(() => {
            renderPowerChart()
            renderPieChart()
          }, 100)
          
          // Sync predictions to Home Assistant if enabled (in background)
          if (autoSyncToHA.value) {
            syncPredictionsToHA().catch(err => {
              console.error('Background sync failed:', err)
            })
          }
        } else {
          error.value = gspResult.message || 'No appliances detected by GSP'
          loading.value = false
          loadingProgress.value = ''
        }
      } else {
        error.value = gspResult.message || 'GSP did not detect any appliances. Try adjusting the configuration parameters.'
        loading.value = false
        loadingProgress.value = ''
      }
      
      return
    }

    // Call the legacy prediction endpoint
    const endpoint = '/api/ml/predict-day'
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
      // Set loading to false first so charts container becomes visible
      loading.value = false
      loadingProgress.value = ''
      
      // Render charts after DOM updates
      await nextTick()
      setTimeout(() => {
        renderPowerChart()
        renderPieChart()
      }, 100)
    } else {
      error.value = 'No appliance activity detected for this day'
      loading.value = false
      loadingProgress.value = ''
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
  console.log('renderPowerChart called, powerData length:', powerData.value.length, 'predictions:', predictions.value.length)
  if (!powerChartCanvas.value) {
    console.log('No canvas element found')
    return
  }
  
  if (powerData.value.length === 0) {
    console.log('No power data available for chart')
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

  // Calculate minimum power for standby line
  let minPower = Infinity
  dataPoints.forEach(d => {
    if (d.y < minPower) {
      minPower = d.y
    }
  })
  
  // Create horizontal line data for minimum power
  const minPowerLine = minPower !== Infinity ? [
    { x: dataPoints[0].x, y: minPower },
    { x: dataPoints[dataPoints.length - 1].x, y: minPower }
  ] : []

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
  
  // Add minimum standby power line if available
  if (minPowerLine.length > 0) {
    datasets.push({
      label: `Min Standby Power (${minPower.toFixed(0)} W)`,
      data: minPowerLine,
      borderColor: '#95a5a6',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [5, 5],
      fill: false,
      tension: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      yAxisID: 'y',
      order: 999 // Draw behind other lines
    })
  }
  
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
              } else if (context.dataset.label.includes('Min Standby')) {
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
      responsive: false,
      maintainAspectRatio: true,
      aspectRatio: 1.5,
      animation: false,
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
onMounted(async () => {
  // Load available seq2point models since it's the default
  loadSeq2PointModels()
  
  // Check if auto-run was previously enabled and restore status
  if (autoRunEnabled.value && props.sessionId) {
    await updateAutoRunStatus()
    if (autoRunStatus.value.isRunning) {
      startAutoRunStatusPolling()
    }
  }
})

// Watch for sessionId changes - don't auto-analyze, just clear any error state
watch(() => props.sessionId, (newSessionId) => {
  if (newSessionId && error.value.includes('session')) {
    error.value = ''
  }
})

// Watch for seq2point toggle to load models when enabled
watch(() => props.detectorSettings.useSeq2Point, (enabled) => {
  if (enabled && seq2pointModels.value.length === 0) {
    loadSeq2PointModels()
  }
})

onUnmounted(() => {
  if (powerChart.value) {
    powerChart.value.destroy()
  }
  if (pieChart.value) {
    pieChart.value.destroy()
  }
  stopAutoRunStatusPolling()
})
</script>

<style scoped>
.power-detector {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.date-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
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
  margin: 1rem;
  text-align: center;
  flex-shrink: 0;
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
  margin: 1rem;
  text-align: center;
  flex-shrink: 0;
}

.charts-container {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 1rem;
  padding: 1rem;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.left-column > .chart-section {
  flex-shrink: 0;
}

.energy-charts-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.chart-section {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.energy-charts-column .chart-section {
  flex: 1;
  min-height: 0;
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
  margin: 0 0 0.75rem 0;
  color: #2c3e50;
  font-size: 1.1rem;
  flex-shrink: 0;
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
  flex: 1;
  min-height: 200px;
}

.power-chart-wrapper {
  min-height: 300px;
}

.pie-wrapper {
  min-height: 250px;
}

.legend-info {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #666;
  text-align: center;
}

.stats-summary {
  padding: 0.75rem;
  flex: 1;
  overflow-y: auto;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 0.9rem;
}

.stat-item .label {
  color: #666;
  font-weight: 500;
  font-size: 0.85rem;
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
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin: 0 1rem 1rem 1rem;
  flex-shrink: 0;
}

.predictions-table-inline {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.predictions-table-inline .accordion-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.predictions-table-inline .table-wrapper {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
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
  font-size: 1.1rem;
}

.predictions-table-inline h3 {
  margin-bottom: 0;
  color: #2c3e50;
  font-size: 1.1rem;
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

.section-divider {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}

.sync-status {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 0.9rem;
}

.sync-label {
  font-weight: 600;
  color: #495057;
}

.sync-value {
  color: #6c757d;
}

.sync-message {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.sync-message.info {
  background: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}

.sync-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.sync-message.warning {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
}

.sync-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.auto-run-status {
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 0.75rem;
}

.status-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.25rem 0;
}

.status-label {
  font-weight: 600;
  color: #495057;
  min-width: 80px;
}

.status-value {
  color: #6c757d;
  font-size: 0.9rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.status-badge.running {
  background: #d4edda;
  color: #155724;
}

.status-badge.stopped {
  background: #f8d7da;
  color: #721c24;
}

.btn-manual-run {
  width: 100%;
  padding: 0.5rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.btn-manual-run:hover:not(:disabled) {
  background: #0056b3;
}

.btn-manual-run:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 1200px) {
  .charts-container {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .date-selector {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .charts-container {
    padding: 0.5rem;
    gap: 0.5rem;
  }
  
  .chart-section {
    padding: 0.75rem;
  }
}
</style>
