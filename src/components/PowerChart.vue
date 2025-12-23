<template>
  <div class="chart-wrapper">
    <div class="chart-controls">
      <button @click="showAutoLabelSettings = true" class="btn-auto-label" title="Auto Label with ML">
        🤖 Auto Labels
      </button>
      <button @click="resetZoom" class="btn-reset-zoom" title="Reset Zoom">
        🔍 Reset Zoom
      </button>
    </div>
    <canvas ref="chartCanvas"></canvas>
    <div class="chart-instructions" v-if="!selectedRange">
      Click and drag on the chart to select a time range for tagging
    </div>
    
    <!-- Auto Label Settings Dialog -->
    <div v-if="showAutoLabelSettings" class="modal-overlay" @click.self="showAutoLabelSettings = false">
      <div class="modal-content">
        <h3>Auto Label Settings</h3>
        
        <div class="form-group">
          <label>Model Type:</label>
          <select v-model="autoLabelSettings.modelType">
            <option value="classifier">Classification Model</option>
            <option value="seq2point">Seq2Point Models</option>
          </select>
        </div>

        <div v-if="autoLabelSettings.modelType === 'classifier'" class="form-group">
          <label>Model:</label>
          <select v-model="autoLabelSettings.modelId">
            <option value="" disabled>-- Select a model --</option>
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.name || `Model ${model.id}` }} ({{ formatModelDate(model.trainedAt) }})
            </option>
          </select>
        </div>

        <div v-if="autoLabelSettings.modelType === 'seq2point'" class="form-group">
          <label>Seq2Point Models:</label>
          <div v-if="loadingSeq2PointModels" class="loading-hint">Loading models...</div>
          <div v-else-if="seq2pointModels.length === 0" class="hint">
            No trained seq2point models found. Train models first.
          </div>
          <div v-else class="model-checkboxes">
            <label v-for="model in seq2pointModels" :key="model" class="checkbox-label">
              <input 
                type="checkbox" 
                :value="model" 
                v-model="autoLabelSettings.selectedSeq2PointModels"
              />
              <span>{{ model }}</span>
            </label>
          </div>
        </div>
        
        <div v-if="autoLabelSettings.modelType === 'classifier'" class="form-group">
          <label>Confidence Threshold: {{ autoLabelSettings.threshold }}</label>
          <input 
            type="range" 
            v-model.number="autoLabelSettings.threshold" 
            min="0.1" 
            max="0.9" 
            step="0.05"
          />
          <small>Tags with confidence below this threshold will be filtered out</small>
        </div>
        
        <div v-if="autoLabelSettings.modelType === 'classifier'" class="form-group">
          <label>Sliding Window Size (minutes): {{ autoLabelSettings.stepSize }}</label>
          <input 
            type="range" 
            v-model.number="autoLabelSettings.stepSize" 
            min="5" 
            max="30" 
            step="5"
          />
          <small>Smaller values = more predictions, larger values = faster processing</small>
        </div>
        
        <div class="form-actions">
          <button @click="runAutoLabel" :disabled="isAutoLabeling" class="btn-primary">
            {{ isAutoLabeling ? 'Processing...' : 'Generate Labels' }}
          </button>
          <button @click="showAutoLabelSettings = false" class="btn-secondary">
            Cancel
          </button>
        </div>
        
        <div v-if="autoLabelError" class="error-message">
          {{ autoLabelError }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import zoomPlugin from 'chartjs-plugin-zoom'
import 'chartjs-adapter-date-fns'

Chart.register(...registerables, annotationPlugin, zoomPlugin)

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
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
  }
})

const emit = defineEmits(['range-selected', 'add-tag', 'update-tag'])

// Auto Label Feature
const showAutoLabelSettings = ref(false)
const autoLabelSettings = ref({
  modelType: 'seq2point', // 'classifier' or 'seq2point'
  modelId: '',
  selectedSeq2PointModels: [],
  threshold: 0.3,
  stepSize: 10
})
const predictedTags = ref([])
const availableModels = ref([])
const seq2pointModels = ref([])
const loadingSeq2PointModels = ref(false)
const isAutoLabeling = ref(false)
const autoLabelError = ref('')

const chartCanvas = ref(null)
let chartInstance = null
let isSelecting = false
let selectionStart = null
let selectionStartX = null
let crosshairX = null
let isDraggingTag = false
let draggedTag = null
let draggedBoundary = null // 'start' or 'end'
let dragThreshold = 10 // pixels

// Custom crosshair plugin
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw: (chart) => {
    const ctx = chart.ctx
    const chartArea = chart.chartArea
    
    ctx.save()
    
    // Draw the current mouse position crosshair
    if (crosshairX !== null) {
      ctx.beginPath()
      ctx.moveTo(crosshairX, chartArea.top)
      ctx.lineTo(crosshairX, chartArea.bottom)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.setLineDash([5, 5])
      ctx.stroke()
    }
    
    // Draw the selection start line when selecting
    if (isSelecting && selectionStartX !== null) {
      ctx.beginPath()
      ctx.moveTo(selectionStartX, chartArea.top)
      ctx.lineTo(selectionStartX, chartArea.bottom)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)'
      ctx.setLineDash([5, 5])
      ctx.stroke()
      
      // Draw a light box between the start and current position
      if (crosshairX !== null && crosshairX !== selectionStartX) {
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255, 193, 7, 0.15)'
        const left = Math.min(selectionStartX, crosshairX)
        const width = Math.abs(crosshairX - selectionStartX)
        ctx.fillRect(left, chartArea.top, width, chartArea.bottom - chartArea.top)
      }
    }
    
    ctx.restore()
  }
}

const createChart = () => {
  if (!chartCanvas.value) return
  
  const ctx = chartCanvas.value.getContext('2d')
  
  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Power Consumption (W)',
          data: props.data,
          borderColor: '#42b983',
          backgroundColor: 'rgba(66, 185, 131, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
          fill: true
        }
      ]
    },
    plugins: [crosshairPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          enabled: true,
          callbacks: {
            title: (items) => {
              const date = new Date(items[0].parsed.x)
              return date.toLocaleTimeString()
            },
            label: (item) => {
              return `${item.parsed.y.toFixed(2)} W`
            }
          }
        },
        annotation: {
          annotations: getAnnotations()
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1
            },
            pinch: {
              enabled: true
            },
            mode: 'x'
          },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: 'ctrl'
          },
          limits: {
            x: {
              min: 'original',
              max: 'original'
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
  
  // Add mouse event listeners for range selection
  chartCanvas.value.addEventListener('mousedown', handleMouseDown)
  chartCanvas.value.addEventListener('mousemove', handleMouseMove)
  chartCanvas.value.addEventListener('mouseup', handleMouseUp)
  chartCanvas.value.addEventListener('mouseleave', handleMouseLeave)
}

const getAnnotations = () => {
  const annotations = {}
  
  // Add tag annotations - only for current date
  const tagsForToday = props.tags.filter(tag => tag.date === props.currentDate)
  tagsForToday.forEach((tag) => {
    const startTime = new Date(tag.date + 'T' + tag.startTime)
    const endTime = new Date(tag.date + 'T' + tag.endTime)
    
    const colors = getTagColorByLabel(tag.label)
    
    // Add box annotation for the zone
    annotations[`tag-box-${tag.id}`] = {
      type: 'box',
      xMin: startTime,
      xMax: endTime,
      yMin: 'min',
      yMax: 'max',
      backgroundColor: colors.background,
      borderWidth: 0
    }
    
    // Add line annotations for start and end with labels
    annotations[`tag-line-start-${tag.id}`] = {
      type: 'line',
      xMin: startTime,
      xMax: startTime,
      yMin: 'min',
      yMax: 'max',
      borderColor: colors.border,
      borderWidth: 2,
      label: {
        content: tag.label,
        enabled: true,
        position: 'start',
        backgroundColor: colors.border,
        color: '#fff'
      }
    }
    
    annotations[`tag-line-end-${tag.id}`] = {
      type: 'line',
      xMin: endTime,
      xMax: endTime,
      yMin: 'min',
      yMax: 'max',
      borderColor: colors.border,
      borderWidth: 2
    }
  })
  
  // Add selection annotation
  if (props.selectedRange) {
    // Add box for the zone
    annotations['selection-box'] = {
      type: 'box',
      xMin: props.selectedRange.start,
      xMax: props.selectedRange.end,
      yMin: 'min',
      yMax: 'max',
      backgroundColor: 'rgba(255, 193, 7, 0.15)',
      borderWidth: 0
    }
    
    // Add lines for boundaries
    annotations['selection-line-start'] = {
      type: 'line',
      xMin: props.selectedRange.start,
      xMax: props.selectedRange.start,
      yMin: 'min',
      yMax: 'max',
      borderColor: 'rgba(255, 193, 7, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5]
    }
    
    annotations['selection-line-end'] = {
      type: 'line',
      xMin: props.selectedRange.end,
      xMax: props.selectedRange.end,
      yMin: 'min',
      yMax: 'max',
      borderColor: 'rgba(255, 193, 7, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5]
    }
  }
  
  return annotations
}

// Label to color mapping (persistent across chart updates)
const labelColorMap = new Map()
let colorIndex = 0

const getTagColorByLabel = (label) => {
  // Return existing color if already assigned
  if (labelColorMap.has(label)) {
    return labelColorMap.get(label)
  }
  
  // Available colors
  const colors = [
    { background: 'rgba(255, 99, 132, 0.2)', border: 'rgba(255, 99, 132, 0.8)' },
    { background: 'rgba(54, 162, 235, 0.2)', border: 'rgba(54, 162, 235, 0.8)' },
    { background: 'rgba(255, 206, 86, 0.2)', border: 'rgba(255, 206, 86, 0.8)' },
    { background: 'rgba(75, 192, 192, 0.2)', border: 'rgba(75, 192, 192, 0.8)' },
    { background: 'rgba(153, 102, 255, 0.2)', border: 'rgba(153, 102, 255, 0.8)' },
    { background: 'rgba(255, 159, 64, 0.2)', border: 'rgba(255, 159, 64, 0.8)' },
    { background: 'rgba(255, 99, 255, 0.2)', border: 'rgba(255, 99, 255, 0.8)' },
    { background: 'rgba(99, 255, 132, 0.2)', border: 'rgba(99, 255, 132, 0.8)' },
    { background: 'rgba(255, 192, 159, 0.2)', border: 'rgba(255, 192, 159, 0.8)' },
    { background: 'rgba(132, 99, 255, 0.2)', border: 'rgba(132, 99, 255, 0.8)' },
    { background: 'rgba(64, 224, 208, 0.2)', border: 'rgba(64, 224, 208, 0.8)' },
    { background: 'rgba(255, 140, 0, 0.2)', border: 'rgba(255, 140, 0, 0.8)' },
    { background: 'rgba(186, 85, 211, 0.2)', border: 'rgba(186, 85, 211, 0.8)' },
    { background: 'rgba(34, 139, 34, 0.2)', border: 'rgba(34, 139, 34, 0.8)' },
    { background: 'rgba(220, 20, 60, 0.2)', border: 'rgba(220, 20, 60, 0.8)' }
  ]
  
  // Assign next color in rotation
  const color = colors[colorIndex % colors.length]
  colorIndex++
  
  // Store mapping
  labelColorMap.set(label, color)
  
  return color
}

const handleMouseDown = (event) => {
  if (!chartInstance) return
  
  const rect = chartCanvas.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  
  // Check if clicking near a tag boundary
  const tagsForToday = props.tags.filter(tag => tag.date === props.currentDate)
  for (const tag of tagsForToday) {
    const startTime = new Date(tag.date + 'T' + tag.startTime)
    const endTime = new Date(tag.date + 'T' + tag.endTime)
    
    const startPixel = chartInstance.scales.x.getPixelForValue(startTime)
    const endPixel = chartInstance.scales.x.getPixelForValue(endTime)
    
    // Check if near start boundary
    if (Math.abs(mouseX - startPixel) < dragThreshold) {
      isDraggingTag = true
      draggedTag = tag
      draggedBoundary = 'start'
      chartCanvas.value.style.cursor = 'ew-resize'
      return
    }
    
    // Check if near end boundary
    if (Math.abs(mouseX - endPixel) < dragThreshold) {
      isDraggingTag = true
      draggedTag = tag
      draggedBoundary = 'end'
      chartCanvas.value.style.cursor = 'ew-resize'
      return
    }
  }
  
  // If not dragging a tag, start normal selection
  const points = chartInstance.getElementsAtEventForMode(
    event,
    'index',
    { intersect: false },
    true
  )
  
  if (points.length > 0) {
    isSelecting = true
    const index = points[0].index
    selectionStart = props.data[index]?.x
    
    // Store the X pixel position for drawing
    selectionStartX = event.clientX - rect.left
  }
}

const handleMouseMove = (event) => {
  if (!chartInstance) return
  
  const rect = chartCanvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  crosshairX = x
  
  // If dragging a tag boundary, update the chart
  if (isDraggingTag) {
    chartInstance.update('none')
    return
  }
  
  chartInstance.update('none')
  
  if (isSelecting) {
    chartCanvas.value.style.cursor = 'crosshair'
    return
  }
  
  // Check if hovering near a tag boundary to show resize cursor
  const tagsForToday = props.tags.filter(tag => tag.date === props.currentDate)
  let nearBoundary = false
  
  for (const tag of tagsForToday) {
    const startTime = new Date(tag.date + 'T' + tag.startTime)
    const endTime = new Date(tag.date + 'T' + tag.endTime)
    
    const startPixel = chartInstance.scales.x.getPixelForValue(startTime)
    const endPixel = chartInstance.scales.x.getPixelForValue(endTime)
    
    if (Math.abs(x - startPixel) < dragThreshold || Math.abs(x - endPixel) < dragThreshold) {
      nearBoundary = true
      break
    }
  }
  
  chartCanvas.value.style.cursor = nearBoundary ? 'ew-resize' : 'default'
}

const handleMouseUp = (event) => {
  if (!chartInstance) return
  
  // Handle tag dragging
  if (isDraggingTag && draggedTag && draggedBoundary) {
    const points = chartInstance.getElementsAtEventForMode(
      event,
      'index',
      { intersect: false },
      true
    )
    
    if (points.length > 0) {
      const index = points[0].index
      const newTime = props.data[index]?.x
      
      if (newTime) {
        const newTimeObj = new Date(newTime)
        const newTimeStr = newTimeObj.toTimeString().split(' ')[0] // HH:MM:SS format
        
        // Create updated tag
        const updatedTag = { ...draggedTag }
        
        if (draggedBoundary === 'start') {
          const endTime = new Date(draggedTag.date + 'T' + draggedTag.endTime)
          // Ensure start time is before end time
          if (newTimeObj < endTime) {
            updatedTag.startTime = newTimeStr
          }
        } else {
          const startTime = new Date(draggedTag.date + 'T' + draggedTag.startTime)
          // Ensure end time is after start time
          if (newTimeObj > startTime) {
            updatedTag.endTime = newTimeStr
          }
        }
        
        emit('update-tag', updatedTag)
      }
    }
    
    isDraggingTag = false
    draggedTag = null
    draggedBoundary = null
    chartCanvas.value.style.cursor = 'default'
    chartInstance.update('none')
    return
  }
  
  // Handle normal selection
  if (!isSelecting) return
  
  const points = chartInstance.getElementsAtEventForMode(
    event,
    'index',
    { intersect: false },
    true
  )
  
  if (points.length > 0 && selectionStart) {
    const index = points[0].index
    const selectionEnd = props.data[index]?.x
    
    if (selectionEnd && selectionStart !== selectionEnd) {
      const start = selectionStart < selectionEnd ? selectionStart : selectionEnd
      const end = selectionStart < selectionEnd ? selectionEnd : selectionStart
      
      emit('range-selected', { start, end })
    }
  }
  
  isSelecting = false
  selectionStart = null
  selectionStartX = null
  chartCanvas.value.style.cursor = 'default'
  chartInstance.update('none')
}

const handleMouseLeave = () => {
  isSelecting = false
  selectionStart = null
  selectionStartX = null
  crosshairX = null
  isDraggingTag = false
  draggedTag = null
  draggedBoundary = null
  if (chartCanvas.value) {
    chartCanvas.value.style.cursor = 'default'
  }
  if (chartInstance) {
    chartInstance.update('none')
  }
}

// Auto Label Methods
const loadAvailableModels = async () => {
  try {
    const response = await fetch('/api/ml/models')
    if (response.ok) {
      const models = await response.json()
      // Handle both array and object response formats
      availableModels.value = Array.isArray(models) ? models : (models.models || [])
      availableModels.value.sort((a, b) => b.trainedAt.localeCompare(a.trainedAt))
    }
  } catch (error) {
    console.error('Failed to load models:', error)
  }
}

const loadSeq2PointModels = async () => {
  loadingSeq2PointModels.value = true
  try {
    const response = await fetch('/api/seq2point/models')
    if (response.ok) {
      const data = await response.json()
      seq2pointModels.value = (data.models || []).map(m => m.appliance)
      console.log('Loaded available seq2point models:', seq2pointModels.value)
    } else {
      console.warn('Failed to load seq2point models')
      seq2pointModels.value = []
    }
  } catch (err) {
    console.warn('Seq2point server not available:', err.message)
    seq2pointModels.value = []
  } finally {
    loadingSeq2PointModels.value = false
  }
}

const runAutoLabel = async () => {
  if (!props.data || props.data.length === 0) {
    autoLabelError.value = 'No power data available'
    return
  }
  
  isAutoLabeling.value = true
  autoLabelError.value = ''
  
  try {
    if (autoLabelSettings.value.modelType === 'seq2point') {
      await runSeq2PointAutoLabel()
    } else {
      await runClassifierAutoLabel()
    }
    
    // Close settings dialog
    showAutoLabelSettings.value = false
    
  } catch (error) {
    console.error('Auto label error:', error)
    autoLabelError.value = error.message || 'Failed to generate auto labels'
  } finally {
    isAutoLabeling.value = false
  }
}

const runSeq2PointAutoLabel = async () => {
  if (!autoLabelSettings.value.selectedSeq2PointModels || autoLabelSettings.value.selectedSeq2PointModels.length === 0) {
    throw new Error('Please select at least one seq2point model')
  }
  
  // Prepare power data
  const powerData = props.data.map(point => ({
    timestamp: new Date(point.x).toISOString(),
    power: point.y
  }))
  
  // Get predictions from each selected model
  const allPredictions = []
  
  for (const modelName of autoLabelSettings.value.selectedSeq2PointModels) {
    console.log(`Getting predictions from ${modelName}...`)
    
    const response = await fetch('/api/seq2point/predict-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appliance: modelName,
        date: props.currentDate,
        powerData: powerData
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`Failed to get predictions for ${modelName}: ${errorData.error}`)
    }
    
    const data = await response.json()
    console.log(`Got ${data.predictions.length} predictions for ${modelName}`)
    
    // Group consecutive ON predictions into time ranges
    let currentRange = null
    
    data.predictions.forEach((pred, idx) => {
      if (pred.isOn) {  // Only use ON status predictions
        if (!currentRange) {
          // Start new range
          currentRange = {
            startTime: pred.timestamp,
            endTime: pred.timestamp,
            label: modelName,
            totalPower: pred.predictedPower,
            count: 1,
            avgOnOffProb: pred.onoffProbability || 1
          }
        } else {
          // Extend current range
          currentRange.endTime = pred.timestamp
          currentRange.totalPower += pred.predictedPower
          currentRange.count++
          currentRange.avgOnOffProb += (pred.onoffProbability || 1)
        }
      } else {
        // OFF - close current range if exists
        if (currentRange) {
          allPredictions.push({
            startTime: new Date(currentRange.startTime).toTimeString().slice(0, 5),
            endTime: new Date(currentRange.endTime).toTimeString().slice(0, 5),
            label: currentRange.label,
            confidence: currentRange.avgOnOffProb / currentRange.count
          })
          currentRange = null
        }
      }
    })
    
    // Don't forget the last range
    if (currentRange) {
      allPredictions.push({
        startTime: new Date(currentRange.startTime).toTimeString().slice(0, 5),
        endTime: new Date(currentRange.endTime).toTimeString().slice(0, 5),
        label: currentRange.label,
        confidence: currentRange.avgOnOffProb / currentRange.count
      })
    }
  }
  
  console.log(`Generated ${allPredictions.length} predicted tags from seq2point models`)
  
  // Add predictions as tags
  allPredictions.forEach(pred => {
    emit('add-tag', {
      startTime: pred.startTime,
      endTime: pred.endTime,
      label: pred.label,
      isPrediction: true,
      confidence: pred.confidence
    })
  })
}

const runClassifierAutoLabel = async () => {
  // Load the selected model first if specified
  if (autoLabelSettings.value.modelId) {
    const loadResponse = await fetch('/api/ml/models/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: autoLabelSettings.value.modelId })
    })
    
    if (!loadResponse.ok) {
      throw new Error('Failed to load selected model')
    }
  }
  
  // Prepare power data
  const powerData = props.data.map(point => ({
    timestamp: new Date(point.x).toISOString(),
    value: point.y
  }))
  
  // Call the sliding window prediction API
  const response = await fetch('/api/ml/predict-day-sliding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: props.currentDate,
      powerData: powerData,
      stepSize: autoLabelSettings.value.stepSize,
      threshold: autoLabelSettings.value.threshold
    })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Prediction failed')
  }
  
  const result = await response.json()
  const predictions = result.predictions || []
  
  console.log(`Generated ${predictions.length} predicted tags`)
  
  // Add predictions as tags with isPrediction flag
  // For multi-label predictions, create separate tags for each label
  // Filter out "Standby" labels and merge contiguous predictions
  
  // First, expand multi-label predictions into individual entries
  const expandedPredictions = []
  predictions.forEach(prediction => {
    if (prediction.tags && prediction.tags.length > 1) {
      // Multi-label: create an entry for each label (excluding Standby)
      prediction.tags.forEach(tagItem => {
        if (tagItem.tag.toLowerCase() !== 'standby') {
          expandedPredictions.push({
            startTime: prediction.startTime,
            endTime: prediction.endTime,
            label: tagItem.tag,
            confidence: tagItem.probability
          })
        }
      })
    } else {
      // Single label (skip if it's Standby)
      if (prediction.tag.toLowerCase() !== 'standby') {
        expandedPredictions.push({
          startTime: prediction.startTime,
          endTime: prediction.endTime,
          label: prediction.tag,
          confidence: prediction.confidence
        })
      }
    }
  })
  
  // Sort by label then by start time
  expandedPredictions.sort((a, b) => {
    if (a.label !== b.label) return a.label.localeCompare(b.label)
    return a.startTime.localeCompare(b.startTime)
  })
  
  // Merge contiguous predictions with the same label
  const mergedPredictions = []
  let currentMerge = null
  
  expandedPredictions.forEach(pred => {
    if (!currentMerge || currentMerge.label !== pred.label || currentMerge.endTime !== pred.startTime) {
      // Start a new merge group
      if (currentMerge) {
        mergedPredictions.push(currentMerge)
      }
      currentMerge = {
        startTime: pred.startTime,
        endTime: pred.endTime,
        label: pred.label,
        confidence: pred.confidence,
        count: 1
      }
    } else {
      // Extend the current merge group
      currentMerge.endTime = pred.endTime
      currentMerge.confidence = (currentMerge.confidence * currentMerge.count + pred.confidence) / (currentMerge.count + 1)
      currentMerge.count++
    }
  })
  
  // Don't forget the last merge group
  if (currentMerge) {
    mergedPredictions.push(currentMerge)
  }
  
  console.log(`After filtering and merging: ${mergedPredictions.length} tags`)
  
  // Add merged predictions as tags
  mergedPredictions.forEach(pred => {
    emit('add-tag', {
      startTime: pred.startTime,
      endTime: pred.endTime,
      label: pred.label,
      isPrediction: true,
      confidence: pred.confidence
    })
  })
}

const formatModelDate = (isoDate) => {
  if (!isoDate) return 'Unknown'
  const date = new Date(isoDate)
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const resetZoom = () => {
  if (chartInstance) {
    chartInstance.resetZoom()
  }
}

onMounted(async () => {
  await nextTick()
  createChart()
  await loadAvailableModels()
  await loadSeq2PointModels()
})

watch(() => props.data, () => {
  createChart()
}, { deep: true })

watch(() => [props.tags, props.selectedRange], () => {
  if (chartInstance) {
    chartInstance.options.plugins.annotation.annotations = getAnnotations()
    chartInstance.update()
  }
}, { deep: true })

// Watch for model type changes to load appropriate models
watch(() => autoLabelSettings.value.modelType, async (newType) => {
  if (newType === 'seq2point' && seq2pointModels.value.length === 0) {
    await loadSeq2PointModels()
  } else if (newType === 'classifier' && availableModels.value.length === 0) {
    await loadAvailableModels()
  }
})
</script>

<style scoped>
.chart-wrapper {
  position: relative;
  width: 100%;
  min-height: 400px;
}

.chart-controls {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  align-items: center;
}

.btn-auto-label,
.btn-reset-zoom,
.btn-accept-all,
.btn-clear {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-auto-label {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-auto-label:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.btn-reset-zoom {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.btn-reset-zoom:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(240, 147, 251, 0.3);
}

.btn-accept-all {
  background: #42b983;
  color: white;
}

.btn-accept-all:hover {
  background: #359268;
}

.btn-clear {
  background: #dc3545;
  color: white;
}

.btn-clear:hover {
  background: #c82333;
}

canvas {
  max-width: 100%;
  cursor: default;
}

.chart-instructions {
  text-align: center;
  margin-top: 1rem;
  color: #666;
  font-size: 0.9rem;
  font-style: italic;
}

/* Modal Styles */
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

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.form-group {
  margin-bottom: 1.5rem;
}

.model-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
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
  background: #f8f9fa;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.loading-hint, .hint {
  padding: 1rem;
  text-align: center;
  color: #666;
  font-style: italic;
  font-size: 0.9rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #2c3e50;
}

.form-group select,
.form-group input[type="range"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.form-group input[type="range"] {
  padding: 0;
}

.form-group small {
  display: block;
  margin-top: 0.3rem;
  color: #666;
  font-size: 0.85rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-primary {
  background: #42b983;
  color: white;
  flex: 1;
}

.btn-primary:hover:not(:disabled) {
  background: #359268;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  color: #721c24;
  font-size: 0.9rem;
}
</style>
