<template>
  <div class="chart-wrapper">
    <canvas ref="chartCanvas"></canvas>
    <div class="chart-instructions" v-if="!selectedRange">
      Click and drag on the chart to select a time range for tagging
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import 'chartjs-adapter-date-fns'

Chart.register(...registerables, annotationPlugin)

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

const emit = defineEmits(['range-selected'])

const chartCanvas = ref(null)
let chartInstance = null
let isSelecting = false
let selectionStart = null
let selectionStartX = null
let crosshairX = null

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
    const rect = chartCanvas.value.getBoundingClientRect()
    selectionStartX = event.clientX - rect.left
  }
}

const handleMouseMove = (event) => {
  if (!chartInstance) return
  
  // Update crosshair position
  const rect = chartCanvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  crosshairX = x
  chartInstance.update('none')
  
  if (isSelecting) {
    chartCanvas.value.style.cursor = 'crosshair'
  }
}

const handleMouseUp = (event) => {
  if (!isSelecting || !chartInstance) return
  
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
  if (chartCanvas.value) {
    chartCanvas.value.style.cursor = 'default'
  }
  if (chartInstance) {
    chartInstance.update('none')
  }
}

onMounted(async () => {
  await nextTick()
  createChart()
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
</script>

<style scoped>
.chart-wrapper {
  position: relative;
  width: 100%;
  min-height: 400px;
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
</style>
