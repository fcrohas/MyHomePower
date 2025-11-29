<template>
  <div class="ml-trainer">
    <div class="header">
      <h2>🧠 ML Tag Predictor</h2>
      <p>Train a deep learning model to predict power usage tags</p>
    </div>

    <!-- Training Controls -->
    <div class="controls-section">
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

    <!-- Prediction Section -->
    <div class="prediction-section">
      <h3>Test Prediction</h3>
      <p>Use the last 50 minutes of loaded data to predict the next tag</p>
      
      <button 
        @click="testPrediction" 
        :disabled="!modelTrained || predicting"
        class="btn btn-primary"
      >
        {{ predicting ? 'Predicting...' : 'Predict Tag' }}
      </button>

      <div v-if="predictionResult" class="prediction-result">
        <h4>Prediction Result</h4>
        <div class="predicted-tag">
          <span class="tag-label">{{ predictionResult.predictedTag }}</span>
          <span class="confidence">{{ (predictionResult.confidence * 100).toFixed(1) }}% confidence</span>
        </div>
        
        <div class="probabilities">
          <h5>All Probabilities</h5>
          <div 
            v-for="item in predictionResult.allProbabilities.slice(0, 5)" 
            :key="item.tag"
            class="probability-bar"
          >
            <span class="prob-label">{{ item.tag }}</span>
            <div class="prob-bar-bg">
              <div 
                class="prob-bar-fill" 
                :style="{ width: (item.probability * 100) + '%' }"
              ></div>
            </div>
            <span class="prob-value">{{ (item.probability * 100).toFixed(1) }}%</span>
          </div>
        </div>
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
      predicting: false,
      predictionResult: null
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
      } catch (err) {
        console.error('Failed to check model status:', err)
      }
    },

    async startTraining() {
      this.error = null
      this.trainingInProgress = true
      this.trainingHistory = []
      this.currentEpoch = 0
      this.currentMetrics = null
      this.predictionResult = null

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
      if (this.powerData.length === 0) {
        this.error = 'No power data loaded. Please load data first.'
        return
      }

      this.predicting = true
      this.error = null

      try {
        const response = await fetch('http://localhost:3001/api/ml/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            powerData: this.powerData
          })
        })

        if (!response.ok) {
          throw new Error('Prediction request failed')
        }

        this.predictionResult = await response.json()
      } catch (err) {
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

.prediction-section {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.prediction-section h3 {
  margin: 0 0 10px 0;
  color: #333;
}

.prediction-section p {
  color: #666;
  margin: 0 0 15px 0;
  font-size: 14px;
}

.prediction-result {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
}

.prediction-result h4 {
  margin: 0 0 15px 0;
  color: #333;
}

.predicted-tag {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
  padding: 15px;
  background: #e8f5e9;
  border-radius: 8px;
}

.tag-label {
  font-size: 24px;
  font-weight: 700;
  color: #2e7d32;
  text-transform: uppercase;
}

.confidence {
  font-size: 16px;
  color: #666;
}

.probabilities h5 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 14px;
}

.probability-bar {
  display: grid;
  grid-template-columns: 120px 1fr 60px;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.prob-label {
  font-size: 13px;
  color: #666;
  text-transform: capitalize;
}

.prob-bar-bg {
  background: #e0e0e0;
  border-radius: 4px;
  height: 20px;
  overflow: hidden;
}

.prob-bar-fill {
  background: linear-gradient(90deg, #42b983, #35a372);
  height: 100%;
  transition: width 0.3s;
  border-radius: 4px;
}

.prob-value {
  font-size: 12px;
  color: #666;
  text-align: right;
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
