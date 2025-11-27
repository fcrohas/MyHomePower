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
  tagsForToday.forEach((tag, index) => {
    const startTime = new Date(tag.date + 'T' + tag.startTime)
    const endTime = new Date(tag.date + 'T' + tag.endTime)
    
    annotations[`tag-${tag.id}`] = {
      type: 'box',
      xMin: startTime,
      xMax: endTime,
      backgroundColor: getTagColor(index),
      borderColor: getTagColor(index, true),
      borderWidth: 2,
      label: {
        content: tag.label,
        enabled: true,
        position: 'start'
      }
    }
  })
  
  // Add selection annotation
  if (props.selectedRange) {
    annotations['selection'] = {
      type: 'box',
      xMin: props.selectedRange.start,
      xMax: props.selectedRange.end,
      backgroundColor: 'rgba(255, 193, 7, 0.2)',
      borderColor: 'rgba(255, 193, 7, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5]
    }
  }
  
  return annotations
}

const getTagColor = (index, border = false) => {
  const colors = [
    'rgba(255, 99, 132, 0.2)',
    'rgba(54, 162, 235, 0.2)',
    'rgba(255, 206, 86, 0.2)',
    'rgba(75, 192, 192, 0.2)',
    'rgba(153, 102, 255, 0.2)',
    'rgba(255, 159, 64, 0.2)'
  ]
  
  const borderColors = [
    'rgba(255, 99, 132, 0.8)',
    'rgba(54, 162, 235, 0.8)',
    'rgba(255, 206, 86, 0.8)',
    'rgba(75, 192, 192, 0.8)',
    'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)'
  ]
  
  return border ? borderColors[index % borderColors.length] : colors[index % colors.length]
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
  }
}

const handleMouseMove = (event) => {
  if (!isSelecting || !chartInstance) return
  
  chartCanvas.value.style.cursor = 'crosshair'
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
  chartCanvas.value.style.cursor = 'default'
}

const handleMouseLeave = () => {
  isSelecting = false
  selectionStart = null
  if (chartCanvas.value) {
    chartCanvas.value.style.cursor = 'default'
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
