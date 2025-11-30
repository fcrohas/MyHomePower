<template>
  <div class="ml-trainer">
    <div class="header">
      <h2>🧠 ML Tag Predictor</h2>
      <p>Train a deep learning model to predict power usage tags</p>
    </div>

    <!-- Training Controls -->
    <div class="controls-section">
      <!-- Training Metadata Display -->
      <div v-if="trainingMetadata" class="metadata-card">
        <h3>📊 Last Training Session</h3>
        <div class="metadata-grid">
          <div class="metadata-item">
            <span class="metadata-label">Trained:</span>
            <span class="metadata-value">{{ formatDate(trainingMetadata.trainedAt) }}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Days of Data:</span>
            <span class="metadata-value">{{ trainingMetadata.datasetInfo?.numberOfDays || 'N/A' }}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Training Samples:</span>
            <span class="metadata-value">{{ trainingMetadata.datasetInfo?.totalSamples?.toLocaleString() || 'N/A' }}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Unique Tags:</span>
            <span class="metadata-value">{{ trainingMetadata.uniqueTags?.length || 0 }}</span>
          </div>
        </div>
        <div v-if="trainingMetadata.uniqueTags && trainingMetadata.uniqueTags.length > 0" class="tags-display">
          <span class="metadata-label">Tags:</span>
          <div class="tags-list">
            <span v-for="tag in trainingMetadata.uniqueTags" :key="tag" class="tag-chip">{{ tag }}</span>
          </div>
        </div>
      </div>

      <div class="info-card">
        <h3>Model Architecture</h3>
        <p>5 × CNN1D (10-minute windows) → LSTM → Dense Output</p>
        <p class="detail">Input: 50 minutes of power data | Output: Predicted tag for next 10 minutes</p>
      </div>

      <div class="training-controls">
        <button 
          @click="startTraining" 
          :disabled="trainingInProgress"
          class="btn btn-primary"
        >
          {{ trainingInProgress ? 'Training...' : 'Start Training' }}
        </button>

        <button 
          @click="loadHistory" 
          :disabled="trainingInProgress"
          class="btn btn-secondary"
        >
          Load History
        </button>

        <div class="status-badge" :class="statusClass">
          {{ statusText }}
        </div>
      </div>
    </div>

    <!-- Model Management Section -->
    <div v-if="savedModels.length > 0" class="models-section">
      <h3>📦 Saved Models</h3>
      <div class="models-table-container">
        <table class="models-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Days</th>
              <th>Samples</th>
              <th>Tags</th>
              <th>Val Accuracy</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="model in savedModels" :key="model.id" :class="{ 'active-model': model.isActive }">
              <td>{{ formatDate(model.trainedAt) }}</td>
              <td>{{ model.datasetInfo?.numberOfDays || 'N/A' }}</td>
              <td>{{ model.datasetInfo?.totalSamples?.toLocaleString() || 'N/A' }}</td>
              <td>{{ model.uniqueTags?.length || 0 }}</td>
              <td>
                <span class="accuracy-badge" :class="getAccuracyClass(model.finalMetrics?.valAccuracy)">
                  {{ (model.finalMetrics?.valAccuracy * 100).toFixed(2) }}%
                </span>
              </td>
              <td>
                <span v-if="model.isActive" class="status-badge active">Active</span>
                <span v-else class="status-badge inactive">Inactive</span>
              </td>
              <td class="actions-cell">
                <button 
                  v-if="!model.isActive"
                  @click="loadModel(model.id)"
                  class="btn btn-small btn-load"
                  :disabled="loadingModel"
                >
                  Load
                </button>
                <button 
                  v-if="!model.isActive"
                  @click="deleteModel(model.id)"
                  class="btn btn-small btn-delete"
                  :disabled="deletingModel"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Training Progress -->
    <div v-if="trainingInProgress || trainingHistory.length > 0" class="progress-section">
      <div v-if="trainingInProgress" class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        <span class="progress-text">Epoch {{ currentEpoch }} / {{ totalEpochs }}</span>
      </div>

      <!-- Current Metrics -->
      <div v-if="currentMetrics" class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Loss</div>
          <div class="metric-value">{{ currentMetrics.loss.toFixed(4) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Accuracy</div>
          <div class="metric-value">{{ (currentMetrics.accuracy * 100).toFixed(2) }}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Val Loss</div>
          <div class="metric-value">{{ currentMetrics.valLoss.toFixed(4) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Val Accuracy</div>
          <div class="metric-value">{{ (currentMetrics.valAccuracy * 100).toFixed(2) }}%</div>
        </div>
      </div>

      <!-- Learning Curves Chart -->
      <div class="chart-container">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script>
import { markRaw } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

export default {
  name: 'MLTrainer',
  props: {
    powerData: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      trainingInProgress: false,
      trainingHistory: [],
      currentEpoch: 0,
      totalEpochs: 50,
      currentMetrics: null,
      modelTrained: false,
      error: null,
      chart: null,
      trainingMetadata: null,
      savedModels: [],
      loadingModel: false,
      deletingModel: false
    }
  },
  computed: {
    progressPercent() {
      return (this.currentEpoch / this.totalEpochs) * 100
    },
    statusText() {
      if (this.trainingInProgress) return 'Training...'
      if (this.modelTrained) return 'Model Trained'
      return 'No Model'
    },
    statusClass() {
      if (this.trainingInProgress) return 'status-training'
      if (this.modelTrained) return 'status-trained'
      return 'status-idle'
    }
  },
  mounted() {
    this.checkModelStatus()
    this.loadModelsList()
  },
  beforeUnmount() {
    if (this.chart) {
      this.chart.destroy()
      this.chart = null
    }
  },
  methods: {
    async checkModelStatus() {
      try {
        const response = await fetch('http://localhost:3001/api/ml/status')
        const data = await response.json()
        this.modelTrained = data.modelLoaded
        this.trainingMetadata = data.metadata
        
        // Load training history from metadata if available
        if (data.metadata && data.metadata.trainingHistory) {
          this.trainingHistory = data.metadata.trainingHistory
          this.currentMetrics = this.trainingHistory[this.trainingHistory.length - 1]
          this.currentEpoch = this.currentMetrics?.epoch || 0
          this.totalEpochs = this.trainingHistory[this.trainingHistory.length - 1]?.epoch || 50
          
          // Create the chart with loaded data
          this.$nextTick(() => {
            if (this.$refs.chartCanvas && this.trainingHistory.length > 0) {
              this.createChart()
            }
          })
        }
      } catch (err) {
        console.error('Failed to check model status:', err)
      }
    },

    async loadModelsList() {
      try {
        const response = await fetch('http://localhost:3001/api/ml/models')
        const data = await response.json()
        this.savedModels = data.models || []
      } catch (err) {
        console.error('Failed to load models list:', err)
      }
    },

    async loadModel(modelId) {
      this.loadingModel = true
      this.error = null

      try {
        const response = await fetch('http://localhost:3001/api/ml/models/load', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ modelId })
        })

        if (!response.ok) {
          throw new Error('Failed to load model')
        }

        const data = await response.json()
        
        // Update UI with loaded model
        this.trainingMetadata = data.metadata
        this.trainingHistory = data.metadata.trainingHistory || []
        this.currentMetrics = this.trainingHistory[this.trainingHistory.length - 1]
        this.currentEpoch = this.currentMetrics?.epoch || 0
        this.totalEpochs = this.trainingHistory[this.trainingHistory.length - 1]?.epoch || 50
        this.modelTrained = true

        // Refresh models list
        await this.loadModelsList()

        // Update chart
        this.$nextTick(() => {
          if (this.$refs.chartCanvas && this.trainingHistory.length > 0) {
            if (this.chart) {
              this.chart.destroy()
              this.chart = null
            }
            this.createChart()
          }
        })

        console.log('✅ Model loaded successfully')
      } catch (err) {
        this.error = 'Failed to load model: ' + err.message
        console.error('Load model error:', err)
      } finally {
        this.loadingModel = false
      }
    },

    async deleteModel(modelId) {
      if (!confirm('Are you sure you want to delete this model?')) {
        return
      }

      this.deletingModel = true
      this.error = null

      try {
        const response = await fetch(`http://localhost:3001/api/ml/models/${modelId}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          throw new Error('Failed to delete model')
        }

        // Refresh models list
        await this.loadModelsList()
        console.log('🗑️ Model deleted successfully')
      } catch (err) {
        this.error = 'Failed to delete model: ' + err.message
        console.error('Delete model error:', err)
      } finally {
        this.deletingModel = false
      }
    },

    getAccuracyClass(accuracy) {
      if (!accuracy) return 'accuracy-low'
      if (accuracy >= 0.95) return 'accuracy-high'
      if (accuracy >= 0.85) return 'accuracy-medium'
      return 'accuracy-low'
    },

    formatDate(isoString) {
      if (!isoString) return 'N/A'
      try {
        const date = new Date(isoString)
        return date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch (err) {
        return 'Invalid Date'
      }
    },

    async startTraining() {
      this.error = null
      this.trainingInProgress = true
      this.trainingHistory = []
      this.currentEpoch = 0
      this.currentMetrics = null

      try {
        const response = await fetch('http://localhost:3001/api/ml/train', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error('Training request failed')
        }

        // Read SSE stream
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6))
                
                if (data.error) {
                  this.error = data.error
                  this.trainingInProgress = false
                  break
                }

                if (data.done) {
                  this.trainingInProgress = false
                  this.modelTrained = true
                  // Refresh models list
                  this.loadModelsList()
                  // Reload status to get latest metadata
                  this.checkModelStatus()
                  // Final chart update
                  this.$nextTick(() => {
                    if (this.$refs.chartCanvas) {
                      this.updateChart()
                    }
                  })
                  break
                }

                // Update progress
                this.currentEpoch = data.epoch
                this.currentMetrics = {
                  loss: data.loss,
                  accuracy: data.accuracy,
                  valLoss: data.valLoss,
                  valAccuracy: data.valAccuracy
                }
                this.trainingHistory.push(data)
                
                // Update chart immediately for each epoch
                this.$nextTick(() => {
                  if (this.$refs.chartCanvas) {
                    // Create chart on first epoch or update existing
                    if (!this.chart) {
                      this.createChart()
                    } else {
                      this.updateChartData()
                    }
                  }
                })
              } catch (parseError) {
                console.error('Failed to parse SSE data:', parseError, line)
              }
            }
          }
        }
      } catch (err) {
        this.error = 'Training failed: ' + err.message
        this.trainingInProgress = false
        console.error('Training error:', err)
      }
    },

    async loadHistory() {
      try {
        const response = await fetch('http://localhost:3001/api/ml/history')
        const data = await response.json()
        
        if (data.history && data.history.length > 0) {
          this.trainingHistory = data.history
          this.currentMetrics = data.history[data.history.length - 1]
          this.currentEpoch = this.currentMetrics.epoch
          this.modelTrained = true
          this.$nextTick(() => {
            this.updateChart()
          })
        } else {
          this.error = 'No training history found'
        }
      } catch (err) {
        this.error = 'Failed to load history: ' + err.message
      }
    },

    updateChartData() {
      
      if (!this.chart || !this.$refs.chartCanvas) {
        console.warn('❌ Cannot update chart: chart or canvas missing')
        return
      }

      try {
        // Convert reactive arrays to plain arrays to avoid Vue reactivity issues with Chart.js
        const epochs = [...this.trainingHistory.map(h => h.epoch)]
        const losses = [...this.trainingHistory.map(h => h.loss)]
        const valLosses = [...this.trainingHistory.map(h => h.valLoss)]
        const accuracies = [...this.trainingHistory.map(h => h.accuracy)]
        const valAccuracies = [...this.trainingHistory.map(h => h.valAccuracy)]


        // Update chart data with plain arrays
        this.chart.data.labels = epochs
        this.chart.data.datasets[0].data = losses
        this.chart.data.datasets[1].data = valLosses
        this.chart.data.datasets[2].data = accuracies
        this.chart.data.datasets[3].data = valAccuracies
        
        console.log('  - Chart data updated, calling chart.update()')
        // Update chart without animation for performance
        this.chart.update('none')
        console.log('✅ Chart updated successfully')
      } catch (err) {
        console.error('❌ Chart update error:', err)
      }
    },

    updateChart() {
      if (!this.$refs.chartCanvas) return

      if (this.chart) {
        // Update existing chart
        this.updateChartData()
      } else if (this.trainingHistory.length > 0) {
        // Create new chart
        this.createChart()
      }
    },

    createChart() {
      if (!this.$refs.chartCanvas || this.trainingHistory.length === 0) return

      // Convert reactive arrays to plain arrays to avoid Vue reactivity issues with Chart.js
      const epochs = [...this.trainingHistory.map(h => h.epoch)]
      const losses = [...this.trainingHistory.map(h => h.loss)]
      const valLosses = [...this.trainingHistory.map(h => h.valLoss)]
      const accuracies = [...this.trainingHistory.map(h => h.accuracy)]
      const valAccuracies = [...this.trainingHistory.map(h => h.valAccuracy)]

      const ctx = this.$refs.chartCanvas.getContext('2d')
      // Use markRaw to prevent Chart.js instance from being reactive
      this.chart = markRaw(new Chart(ctx, {
          type: 'line',
          data: {
            labels: epochs,
            datasets: [
              {
                label: 'Training Loss',
                data: losses,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                yAxisID: 'y',
                tension: 0.3
              },
              {
                label: 'Validation Loss',
                data: valLosses,
                borderColor: 'rgb(255, 159, 64)',
                backgroundColor: 'rgba(255, 159, 64, 0.1)',
                yAxisID: 'y',
                tension: 0.3
              },
              {
                label: 'Training Accuracy',
                data: accuracies,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                yAxisID: 'y1',
                tension: 0.3
              },
              {
                label: 'Validation Accuracy',
                data: valAccuracies,
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                yAxisID: 'y1',
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            plugins: {
              title: {
                display: true,
                text: 'Training Progress - Learning Curves',
                font: { size: 16 }
              },
              legend: {
                position: 'top'
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Epoch'
                }
              },
              y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: {
                  display: true,
                  text: 'Loss'
                }
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: {
                  display: true,
                  text: 'Accuracy'
                },
                grid: {
                  drawOnChartArea: false
                }
              }
            }
          }
      }))
    },

    async testPrediction() {
      if (this.selectedDataPreview.length === 0) {
        this.error = 'No data in selected range. Please adjust the date range.'
        return
      }

      if (this.selectedMinutes < 50) {
        this.error = 'Need at least 50 minutes of data for prediction. Please expand the date range.'
        return
      }

      this.predicting = true
      this.error = null

      try {
        // Transform data to match server expectations: time/value -> timestamp/power
        const transformedData = this.selectedDataPreview.map(d => ({
          timestamp: d.time || d.timestamp,
          power: d.value !== undefined ? d.value : d.power
        }))

        console.log('Sending prediction data:', transformedData.length, 'points')
        console.log('First data point:', transformedData[0])
        console.log('Last data point:', transformedData[transformedData.length - 1])

        const response = await fetch('http://localhost:3001/api/ml/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            powerData: transformedData
          })
        })

        if (!response.ok) {
          throw new Error('Prediction request failed')
        }

        this.predictionResult = await response.json()
        console.log('Prediction result:', this.predictionResult)
      } catch (err) {
        console.error('Prediction error:', err)
        this.error = 'Prediction failed: ' + err.message
      } finally {
        this.predicting = false
      }
    }
  }
}
</script>

<style scoped>
.ml-trainer {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h2 {
  margin: 0 0 10px 0;
  color: #42b983;
}

.header p {
  color: #666;
  margin: 0;
}

.controls-section {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

.metadata-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.metadata-card h3 {
  margin: 0 0 15px 0;
  font-size: 18px;
  font-weight: 600;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
}

.metadata-item {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.metadata-label {
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.9;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.metadata-value {
  font-size: 18px;
  font-weight: 700;
}

.tags-display {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  background: rgba(255, 255, 255, 0.9);
  color: #667eea;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.info-card {
  background: white;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 20px;
}

.info-card h3 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 16px;
}

.info-card p {
  margin: 5px 0;
  color: #666;
  font-size: 14px;
}

.info-card .detail {
  font-size: 12px;
  color: #999;
}

.training-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #42b983;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #35a372;
}

.btn-secondary {
  background: #666;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #555;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-badge {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-idle {
  background: #e0e0e0;
  color: #666;
}

.status-training {
  background: #fff3cd;
  color: #856404;
  animation: pulse 1.5s infinite;
}

.status-trained {
  background: #d4edda;
  color: #155724;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.progress-section {
  margin-bottom: 30px;
}

.progress-bar {
  background: #e0e0e0;
  border-radius: 10px;
  height: 30px;
  position: relative;
  overflow: hidden;
  margin-bottom: 20px;
}

.progress-fill {
  background: linear-gradient(90deg, #42b983, #35a372);
  height: 100%;
  transition: width 0.3s;
  border-radius: 10px;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.metric-card {
  background: white;
  border-radius: 8px;
  padding: 15px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.metric-label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #42b983;
}

.chart-container {
  background: white;
  border-radius: 8px;
  padding: 20px;
  height: 400px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.models-section {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

.models-section h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 18px;
}

.models-table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.models-table {
  width: 100%;
  border-collapse: collapse;
}

.models-table thead {
  background: #42b983;
  color: white;
}

.models-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.models-table tbody tr {
  border-bottom: 1px solid #e0e0e0;
  transition: background-color 0.2s;
}

.models-table tbody tr:hover {
  background-color: #f9f9f9;
}

.models-table tbody tr.active-model {
  background-color: #e8f5e9;
}

.models-table td {
  padding: 12px;
  font-size: 14px;
  color: #333;
}

.accuracy-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.accuracy-high {
  background: #d4edda;
  color: #155724;
}

.accuracy-medium {
  background: #fff3cd;
  color: #856404;
}

.accuracy-low {
  background: #f8d7da;
  color: #721c24;
}

.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #e0e0e0;
  color: #666;
}

.actions-cell {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
}

.btn-load {
  background: #42b983;
  color: white;
}

.btn-load:hover:not(:disabled) {
  background: #35a372;
}

.btn-delete {
  background: #dc3545;
  color: white;
}

.btn-delete:hover:not(:disabled) {
  background: #c82333;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 6px;
  margin-top: 20px;
  border: 1px solid #f5c6cb;
}
</style>
