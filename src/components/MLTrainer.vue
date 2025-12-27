<template>
  <div class="ml-trainer">
    <div class="header">
      <h2>🧠 Seq2Point NILM Model</h2>
      <p>Train a deep learning model to predict individual appliance power consumption</p>
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
            <span class="metadata-label">Appliance:</span>
            <span class="metadata-value">{{ trainingMetadata.appliance || 'N/A' }}</span>
          </div>
        </div>
        <div v-if="trainingMetadata.windowLength" class="tags-display">
          <span class="metadata-label">Window Length:</span>
          <span class="tag-chip">{{ trainingMetadata.windowLength }} timesteps</span>
        </div>
      </div>

      <div class="info-card">
        <h3>Seq2Point Architecture</h3>
        <p>5 × Conv2D Layers → Flatten → Dense(1024) → Power Output</p>
        <p class="detail">Input: 599 timesteps of aggregate power | Output: Appliance power at midpoint (regression)</p>
      </div>

      <!-- Appliance Selection Section -->
      <div class="tag-selection-card">
        <h3>⚡ Training Configuration</h3>
        
        <!-- Date Range Selection -->
        <div class="date-range-section">
          <h4>📅 Date Range (optional)</h4>
          <p class="date-range-description">Filter training data by date range</p>
          <div class="date-inputs">
            <div class="date-input-group">
              <label for="startDate">Start Date:</label>
              <input 
                id="startDate"
                v-model="startDate"
                type="date"
                :disabled="trainingInProgress"
                :max="endDate || undefined"
                class="date-input"
              />
            </div>
            <div class="date-input-group">
              <label for="endDate">End Date:</label>
              <input 
                id="endDate"
                v-model="endDate"
                type="date"
                :disabled="trainingInProgress"
                :min="startDate || undefined"
                class="date-input"
              />
            </div>
            <button 
              v-if="startDate || endDate"
              @click="clearDateRange"
              :disabled="trainingInProgress"
              class="btn-clear-dates"
            >
              Clear Dates
            </button>
          </div>
        </div>
        
        <!-- Appliance Selection -->
        <div class="tag-selection-section">
          <h4>⚡ Select Appliance</h4>
          <p class="tag-selection-description">Choose which appliance to train the seq2point model for (one appliance per model)</p>
        
        <div v-if="loadingTags" class="loading-tags">Loading available appliances...</div>
        
        <div v-else-if="availableTags.length > 0" class="appliance-selection">
          <label 
            v-for="tag in availableTags" 
            :key="tag"
            class="appliance-radio-label"
            :class="{ 'appliance-selected': selectedAppliance === tag }"
          >
            <input 
              type="radio"
              :value="tag"
              v-model="selectedAppliance"
              :disabled="trainingInProgress"
              name="appliance"
            />
            <span class="appliance-name">{{ tag }}</span>
          </label>
        </div>
        
        <div v-else class="no-tags-message">
          No appliances found in data files. Please add some tags first.
        </div>
        </div>
        
        <!-- Early Stopping Section -->
        <div class="early-stopping-section">
          <h4>🛑 Training Configuration</h4>
          
          <div class="training-config-params">
            <div class="param-input-group">
              <label for="windowLength">Window Length:</label>
              <input 
                id="windowLength"
                v-model.number="windowLength"
                type="number"
                min="299"
                max="999"
                step="100"
                :disabled="trainingInProgress"
                class="param-input"
                title="Number of timesteps in input window (odd numbers recommended)"
              />
              <span class="param-hint">Input window size (default: 599, must be odd)</span>
            </div>
            
            <div class="param-input-group">
              <label for="maxEpochs">Max Epochs:</label>
              <input 
                id="maxEpochs"
                v-model.number="maxEpochs"
                type="number"
                min="5"
                max="200"
                :disabled="trainingInProgress"
                class="param-input"
                title="Maximum number of training epochs"
              />
              <span class="param-hint">Maximum number of training epochs</span>
            </div>
            
            <div class="param-input-group">
              <label for="batchSize">Batch Size:</label>
              <input 
                id="batchSize"
                v-model.number="batchSize"
                type="number"
                min="100"
                max="2000"
                step="100"
                :disabled="trainingInProgress"
                class="param-input"
                title="Training batch size"
              />
              <span class="param-hint">Number of samples per batch</span>
            </div>
          </div>
          
          <p class="early-stopping-description">Stop training automatically when validation loss stops improving</p>
          
          <div class="early-stopping-controls">
            <label class="early-stopping-toggle">
              <input 
                type="checkbox"
                v-model="earlyStoppingEnabled"
                :disabled="trainingInProgress"
              />
              <span class="toggle-label">Enable Early Stopping</span>
            </label>
            
            <div v-if="earlyStoppingEnabled" class="early-stopping-params">
              <div class="param-input-group">
                <label for="patience">Patience (epochs):</label>
                <input 
                  id="patience"
                  v-model.number="patience"
                  type="number"
                  min="1"
                  max="20"
                  :disabled="trainingInProgress"
                  class="param-input"
                  title="Number of epochs with no improvement before stopping"
                />
                <span class="param-hint">Wait this many epochs without improvement</span>
              </div>
              
              <div class="param-input-group">
                <label for="minDelta">Min Delta:</label>
                <input 
                  id="minDelta"
                  v-model.number="minDelta"
                  type="number"
                  min="0"
                  max="0.01"
                  step="0.0001"
                  :disabled="trainingInProgress"
                  class="param-input"
                  title="Minimum change to qualify as an improvement"
                />
                <span class="param-hint">Minimum loss decrease to count as improvement</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="training-controls">
        <div class="model-name-input-group">
          <label for="newModelName">Model Name:</label>
          <input 
            id="newModelName"
            v-model="newModelName"
            :disabled="trainingInProgress"
            class="model-name-input"
            :placeholder="suggestedModelName"
            maxlength="100"
          />
          <button 
            v-if="suggestedModelName && newModelName !== suggestedModelName"
            @click="useSuggestedName"
            :disabled="trainingInProgress"
            class="btn-use-suggestion"
            title="Use suggested name"
          >
            Use: {{ suggestedModelName }}
          </button>
        </div>

        <button 
          @click="startTraining" 
          :disabled="trainingInProgress"
          class="btn btn-primary"
        >
          {{ trainingInProgress ? 'Training...' : 'Start Training' }}
        </button>

        <button 
          v-if="trainingInProgress"
          @click="stopTraining" 
          class="btn btn-danger"
        >
          🛑 Stop Training
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
              <th>Name</th>
              <th>Date</th>
              <th>Days</th>
              <th>Samples</th>
              <th>Appliance</th>
              <th>Val MAE</th>
              <th>Inference</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="model in savedModels" :key="model.id" :class="{ 'active-model': model.isActive }">
              <td>
                <div v-if="editingModelId === model.id" class="name-edit">
                  <input 
                    v-model="editingModelName"
                    @keyup.enter="saveModelName(model.id)"
                    @keyup.esc="cancelEditName"
                    class="name-input"
                    placeholder="Enter model name"
                    ref="nameInput"
                  />
                  <button @click="saveModelName(model.id)" class="btn-icon" title="Save">✓</button>
                  <button @click="cancelEditName" class="btn-icon" title="Cancel">✕</button>
                </div>
                <div v-else class="name-display">
                  <span class="model-name">{{ model.name || 'Unnamed Model' }}</span>
                  <button @click="startEditName(model.id, model.name)" class="btn-icon-edit" title="Edit name">✏️</button>
                </div>
              </td>
              <td>{{ formatDate(model.trainedAt) }}</td>
              <td>{{ model.datasetInfo?.numberOfDays || 'N/A' }}</td>
              <td>{{ model.datasetInfo?.totalSamples?.toLocaleString() || 'N/A' }}</td>
              <td>{{ model.appliance || 'N/A' }}</td>
              <td>
                <span class="accuracy-badge" :class="getMaeClass(model.finalMetrics?.valMae)">
                  {{ model.finalMetrics?.valMae ? model.finalMetrics.valMae.toFixed(2) + ' W' : 'N/A' }}
                </span>
              </td>
              <td>
                <div v-if="model.hasOnnx" class="inference-toggle">
                  <label class="toggle-switch">
                    <input 
                      type="checkbox"
                      :checked="model.useOnnx"
                      @change="toggleInferenceEngine(model.appliance, $event.target.checked)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                  <span class="inference-label">{{ model.useOnnx ? 'ONNX' : 'TFJS' }}</span>
                </div>
                <span v-else class="inference-label-na">—</span>
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
                  @click="convertToONNX(model.appliance)"
                  class="btn btn-small btn-onnx"
                  :class="{ 'onnx-converted': model.hasOnnx }"
                  :disabled="convertingModel === model.appliance"
                  :title="model.hasOnnx ? 'ONNX model available (click to reconvert)' : 'Convert to ONNX for faster inference'"
                >
                  {{ convertingModel === model.appliance ? '...' : (model.hasOnnx ? '✓ ONNX' : 'ONNX') }}
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
      
      <div v-if="stoppedEarly" class="early-stop-message">
        🛑 Training stopped early due to no improvement in validation loss
      </div>

      <!-- Current Metrics -->
      <div v-if="currentMetrics" class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">MSE (Loss)</div>
          <div class="metric-value">{{ currentMetrics.loss.toFixed(4) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">MAE</div>
          <div class="metric-value">{{ currentMetrics.mae ? currentMetrics.mae.toFixed(2) : 'N/A' }} W</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Val MSE</div>
          <div class="metric-value">{{ currentMetrics.valLoss.toFixed(4) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Val MAE</div>
          <div class="metric-value">{{ currentMetrics.valMae ? currentMetrics.valMae.toFixed(2) : 'N/A' }} W</div>
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

    <!-- Toast Notifications -->
    <div class="toast-container">
      <div 
        v-for="toast in toasts" 
        :key="toast.id"
        class="toast"
        :class="toast.type"
      >
        <span class="toast-icon">{{ toast.icon }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
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
      convertingModel: null,
      deletingModel: false,
      editingModelId: null,
      editingModelName: '',
      savingModelName: false,
      newModelName: '',
      availableTags: [],
      selectedAppliance: '',
      loadingTags: false,
      startDate: '',
      endDate: '',
      earlyStoppingEnabled: true,
      patience: 5,
      minDelta: 0.0001,
      stoppedEarly: false,
      maxEpochs: 30,
      windowLength: 599,
      batchSize: 1000,
      toasts: []
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
    },
    suggestedModelName() {
      if (this.selectedAppliance) {
        return `Seq2Point ${this.selectedAppliance.charAt(0).toUpperCase() + this.selectedAppliance.slice(1)}`
      }
      return 'Seq2Point Model'
    }
  },
  mounted() {
    this.checkModelStatus()
    this.loadModelsList()
    this.loadAvailableTags()
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
        const response = await fetch('/api/ml/status')
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
        const response = await fetch('/api/seq2point/models')
        const data = await response.json()
        // Handle response format from seq2point endpoint
        const models = data.models || []
        
        // Transform to match expected structure
        this.savedModels = models.map(model => ({
          id: model.appliance, // Use appliance name as ID for seq2point models
          appliance: model.appliance,
          name: model.metadata?.name || `Seq2Point ${model.appliance}`,
          trainedAt: model.metadata?.trainedAt,
          datasetInfo: model.metadata?.datasetInfo,
          finalMetrics: model.metadata?.finalMetrics,
          isActive: model.loaded,
          hasOnnx: model.hasOnnx,
          useOnnx: model.useOnnx || false
        }))
      } catch (err) {
        console.error('Failed to load models list:', err)
      }
    },

    async loadModel(modelId) {
      this.loadingModel = true
      this.error = null

      try {
        const response = await fetch('/api/ml/models/load', {
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
        const response = await fetch(`/api/ml/models/${modelId}`, {
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

    async toggleInferenceEngine(appliance, useOnnx) {
      try {
        const response = await fetch('/api/seq2point/set-inference-engine', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ appliance, useOnnx })
        })

        if (!response.ok) {
          throw new Error('Failed to set inference engine')
        }

        // Update local state
        const model = this.savedModels.find(m => m.appliance === appliance)
        if (model) {
          model.useOnnx = useOnnx
        }

        this.showToast(`Switched to ${useOnnx ? 'ONNX' : 'TensorFlow.js'} for ${appliance}`, 'success')
      } catch (err) {
        this.showToast('Failed to switch inference engine: ' + err.message, 'error')
        console.error('Toggle inference error:', err)
      }
    },

    async convertToONNX(appliance) {
      if (!appliance) return
      
      this.convertingModel = appliance
      this.error = null

      try {
        const response = await fetch('/api/seq2point/convert-onnx', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ appliance })
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.message || 'Failed to convert model to ONNX')
        }

        const data = await response.json()
        this.showToast(data.message, 'success')
        console.log('✅ ONNX conversion successful:', data.path)
        
        // Refresh models list to update ONNX status
        await this.loadModelsList()
      } catch (err) {
        this.showToast('ONNX conversion failed: ' + err.message, 'error')
        console.error('ONNX conversion error:', err)
      } finally {
        this.convertingModel = null
      }
    },

    showToast(message, type = 'info') {
      const id = Date.now()
      const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
      }
      
      const toast = {
        id,
        message,
        type,
        icon: icons[type] || icons.info
      }
      
      this.toasts.push(toast)
      
      // Auto-remove after 4 seconds
      setTimeout(() => {
        const index = this.toasts.findIndex(t => t.id === id)
        if (index > -1) {
          this.toasts.splice(index, 1)
        }
      }, 4000)
    },

    getMaeClass(mae) {
      if (!mae) return 'accuracy-low'
      if (mae <= 30) return 'accuracy-high'  // Good: low error
      if (mae <= 60) return 'accuracy-medium'  // Medium: acceptable error
      return 'accuracy-low'  // High: poor predictions
    },

    startEditName(modelId, currentName) {
      this.editingModelId = modelId
      this.editingModelName = currentName || ''
      this.$nextTick(() => {
        const inputs = this.$refs.nameInput
        if (inputs) {
          const input = Array.isArray(inputs) ? inputs[0] : inputs
          if (input) input.focus()
        }
      })
    },

    cancelEditName() {
      this.editingModelId = null
      this.editingModelName = ''
    },

    async saveModelName(modelId) {
      if (this.savingModelName) return

      this.savingModelName = true
      this.error = null

      try {
        const response = await fetch(`/api/ml/models/${modelId}/name`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: this.editingModelName })
        })

        if (!response.ok) {
          throw new Error('Failed to update model name')
        }

        // Update local state
        const model = this.savedModels.find(m => m.id === modelId)
        if (model) {
          model.name = this.editingModelName
        }

        this.cancelEditName()
        console.log('✅ Model name updated successfully')
      } catch (err) {
        this.error = 'Failed to update model name: ' + err.message
        console.error('Update model name error:', err)
      } finally {
        this.savingModelName = false
      }
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
      if (!this.selectedAppliance) {
        this.error = 'Please select an appliance to train'
        return
      }
      
      this.error = null
      this.trainingInProgress = true
      this.trainingHistory = []
      this.currentEpoch = 0
      this.currentMetrics = null
      this.stoppedEarly = false

      try {
        const requestBody = {
          name: this.newModelName || this.suggestedModelName,
          appliance: this.selectedAppliance,
          windowLength: this.windowLength,
          batchSize: this.batchSize
        }
        
        // Include date range if specified
        if (this.startDate) {
          requestBody.startDate = this.startDate
        }
        if (this.endDate) {
          requestBody.endDate = this.endDate
        }
        
        // Include early stopping configuration
        if (this.earlyStoppingEnabled) {
          requestBody.earlyStoppingEnabled = true
          requestBody.patience = this.patience
          requestBody.minDelta = this.minDelta
        }
        
        // Include max epochs setting
        requestBody.maxEpochs = this.maxEpochs

        const response = await fetch('/api/ml/train', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
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
                  this.newModelName = '' // Clear the input after successful training
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
                  mae: data.mae || data.meanAbsoluteError || 0,
                  valLoss: data.valLoss,
                  valMae: data.valMae || data.val_meanAbsoluteError || 0
                }
                this.trainingHistory.push(data)
                
                // Check if early stopping occurred
                if (data.stoppedEarly) {
                  this.stoppedEarly = true
                }
                
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

    async stopTraining() {
      try {
        const response = await fetch('/api/ml/stop', {
          method: 'POST'
        })
        
        if (!response.ok) {
          throw new Error('Failed to stop training')
        }
        
        const data = await response.json()
        console.log('Training stopped:', data.message)
        // The training loop will detect the stop and clean up
      } catch (err) {
        this.error = 'Failed to stop training: ' + err.message
        console.error('Stop training error:', err)
      }
    },

    async loadHistory() {
      try {
        const response = await fetch('/api/ml/history')
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
        const maes = [...this.trainingHistory.map(h => h.mae || h.meanAbsoluteError || 0)]
        const valMaes = [...this.trainingHistory.map(h => h.valMae || h.val_meanAbsoluteError || 0)]


        // Update chart data with plain arrays
        this.chart.data.labels = epochs
        this.chart.data.datasets[0].data = losses
        this.chart.data.datasets[1].data = valLosses
        this.chart.data.datasets[2].data = maes
        this.chart.data.datasets[3].data = valMaes
        
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
      const maes = [...this.trainingHistory.map(h => h.mae || h.meanAbsoluteError || 0)]
      const valMaes = [...this.trainingHistory.map(h => h.valMae || h.val_meanAbsoluteError || 0)]

      const ctx = this.$refs.chartCanvas.getContext('2d')
      // Use markRaw to prevent Chart.js instance from being reactive
      this.chart = markRaw(new Chart(ctx, {
          type: 'line',
          data: {
            labels: epochs,
            datasets: [
              {
                label: 'Training MSE',
                data: losses,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                yAxisID: 'y',
                tension: 0.3
              },
              {
                label: 'Validation MSE',
                data: valLosses,
                borderColor: 'rgb(255, 159, 64)',
                backgroundColor: 'rgba(255, 159, 64, 0.1)',
                yAxisID: 'y',
                tension: 0.3
              },
              {
                label: 'Training MAE (W)',
                data: maes,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                yAxisID: 'y1',
                tension: 0.3
              },
              {
                label: 'Validation MAE (W)',
                data: valMaes,
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
                  text: 'Mean Squared Error (MSE)'
                }
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: {
                  display: true,
                  text: 'Mean Absolute Error (W)'
                },
                grid: {
                  drawOnChartArea: false
                }
              }
            }
          }
      }))
    },

    async loadAvailableTags() {
      this.loadingTags = true
      try {
        const response = await fetch('/api/ml/available-tags')
        if (!response.ok) {
          throw new Error('Failed to fetch available tags')
        }
        const data = await response.json()
        this.availableTags = data.tags || []
        console.log(`Loaded ${this.availableTags.length} available appliances`)
      } catch (err) {
        console.error('Failed to load available appliances:', err)
        this.error = 'Failed to load available appliances: ' + err.message
        this.availableTags = []
      } finally {
        this.loadingTags = false
      }
    },

    useSuggestedName() {
      this.newModelName = this.suggestedModelName
    },

    clearDateRange() {
      this.startDate = ''
      this.endDate = ''
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

        const response = await fetch('/api/ml/predict', {
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
  align-items: flex-end;
  flex-wrap: wrap;
}

.model-name-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 250px;
}

.model-name-input-group label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.model-name-input {
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.model-name-input:focus {
  outline: none;
  border-color: #42b983;
}

.model-name-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
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

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c82333;
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

.early-stop-message {
  background: #fff3cd;
  color: #856404;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
  border: 1px solid #ffeaa7;
  font-weight: 600;
  text-align: center;
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

.name-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  font-weight: 500;
  color: #333;
}

.btn-icon-edit {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
  font-size: 14px;
}

.btn-icon-edit:hover {
  opacity: 1;
}

.name-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name-input {
  padding: 6px 10px;
  border: 1px solid #42b983;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  min-width: 150px;
}

.name-input:focus {
  border-color: #35a372;
  box-shadow: 0 0 0 2px rgba(66, 185, 131, 0.1);
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 16px;
  font-weight: bold;
  transition: transform 0.1s;
}

.btn-icon:hover {
  transform: scale(1.1);
}

.btn-icon:first-of-type {
  color: #42b983;
}

.btn-icon:last-of-type {
  color: #dc3545;
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

.btn-onnx {
  background: #4a90e2;
  color: white;
}

.btn-onnx:hover:not(:disabled) {
  background: #357abd;
}

.btn-onnx.onnx-converted {
  background: #28a745;
  border: 2px solid #1e7e34;
}

.btn-onnx.onnx-converted:hover:not(:disabled) {
  background: #218838;
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

/* Tag Selection Styles */
.tag-selection-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  border: 2px solid #e0e0e0;
}

.tag-selection-card h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 18px;
}

.tag-selection-card h4 {
  margin: 15px 0 8px 0;
  color: #333;
  font-size: 16px;
}

/* Date Range Section */
.date-range-section {
  margin-bottom: 25px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.date-range-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
}

.date-inputs {
  display: flex;
  gap: 15px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.date-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.date-input-group label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.date-input {
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s;
  min-width: 160px;
}

.date-input:hover:not(:disabled) {
  border-color: #42b983;
}

.date-input:focus {
  outline: none;
  border-color: #42b983;
  box-shadow: 0 0 0 3px rgba(66, 185, 131, 0.1);
}

.date-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-clear-dates {
  padding: 10px 16px;
  background: #fff;
  border: 2px solid #dc3545;
  color: #dc3545;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-clear-dates:hover:not(:disabled) {
  background: #dc3545;
  color: white;
}

.btn-clear-dates:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tag Selection Section */
.tag-selection-section {
  margin-top: 20px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.tag-selection-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
}

.loading-tags {
  text-align: center;
  padding: 20px;
  color: #666;
  font-style: italic;
}

.no-tags-message {
  text-align: center;
  padding: 20px;
  color: #999;
  font-style: italic;
}

/* Appliance Selection Styles */
.appliance-selection {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 15px;
}

.appliance-radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.appliance-radio-label:hover {
  border-color: #42b983;
  background: #f0fdf7;
}

.appliance-radio-label.appliance-selected {
  border-color: #42b983;
  background: #e8f5e9;
}

.appliance-radio-label input[type="radio"] {
  cursor: pointer;
  width: 18px;
  height: 18px;
  accent-color: #42b983;
}

.appliance-radio-label .appliance-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  flex: 1;
}

.btn-use-suggestion {
  padding: 6px 12px;
  background: #e8f5e9;
  border: 1px solid #42b983;
  color: #42b983;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
}

.btn-use-suggestion:hover:not(:disabled) {
  background: #42b983;
  color: white;
}

.btn-use-suggestion:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Early Stopping Section */
.early-stopping-section {
  margin-top: 20px;
}

.early-stopping-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
}

.training-config-params {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 15px;
  background: white;
  border-radius: 6px;
  border: 2px solid #e0e0e0;
  margin-bottom: 20px;
}

.early-stopping-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.early-stopping-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.early-stopping-toggle input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: #42b983;
}

.toggle-label {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.early-stopping-params {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 15px;
  background: white;
  border-radius: 6px;
  border: 2px solid #42b983;
}

.param-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-input-group label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.param-input {
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s;
  max-width: 200px;
}

.param-input:hover:not(:disabled) {
  border-color: #42b983;
}

.param-input:focus {
  outline: none;
  border-color: #42b983;
  box-shadow: 0 0 0 3px rgba(66, 185, 131, 0.1);
}

.param-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
}

/* Toast Notifications */
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}

.toast {
  background: white;
  padding: 16px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  animation: slideIn 0.3s ease-out;
  border-left: 4px solid;
}

.toast.success {
  border-left-color: #28a745;
  background: #f0f9f4;
}

.toast.error {
  border-left-color: #dc3545;
  background: #fef5f5;
}

.toast.warning {
  border-left-color: #ffc107;
  background: #fffbf0;
}

.toast.info {
  border-left-color: #17a2b8;
  background: #f0f8fa;
}

.toast-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.param-hint {
  font-size: 12px;
  color: #999;
  font-style: italic;
}

/* Inference Engine Toggle */
.inference-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 24px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: #4a90e2;
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.inference-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  min-width: 40px;
}

.inference-label-na {
  color: #ccc;
  font-size: 14px;
}

</style>
