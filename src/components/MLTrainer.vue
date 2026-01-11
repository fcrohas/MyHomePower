<template>
  <div class="ml-trainer">
    <!-- Logs Icon -->
    <button 
      class="logs-icon-button" 
      @click="toggleLogs" 
      :title="showLogs ? 'Hide logs' : 'Show backend logs'"
    >
      📔
    </button>

    <!-- Logs Modal -->
    <div v-if="showLogs" class="logs-modal">
      <div class="logs-modal-content">
        <div class="logs-header">
          <h4>📔 Backend Live Logs</h4>
          <button @click="toggleLogs" class="btn-close-logs">✕</button>
        </div>
        <div class="logs-body" ref="logsBody">
          <div v-if="backendLogs.length === 0" class="no-logs">No logs yet. Logs will appear during training and data preparation.</div>
          <div v-for="(log, index) in backendLogs" :key="index" class="log-entry" :class="log.type">
            <span class="log-timestamp">{{ log.timestamp }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </div>
        <div class="logs-footer">
          <button @click="clearLogs" class="btn btn-small btn-secondary">Clear Logs</button>
        </div>
      </div>
    </div>

    <!-- Top Row: Saved Models (Left) and Training Config (Right) -->
    <div class="top-row">
      <!-- Left: Saved Models Section -->
      <div v-if="savedModels.length > 0" class="models-section">
        <div class="models-header">
          <h3>📦 Saved Models</h3>
          <div class="models-tabs">
            <button 
              :class="['models-tab-button', { active: savedModelsTab === 'list' }]"
              @click="savedModelsTab = 'list'"
            >
              Models List
            </button>
            <button 
              v-if="savedModelsTab === 'train'"
              :class="['models-tab-button', { active: savedModelsTab === 'train' }]"
              @click="savedModelsTab = 'train'"
            >
              🚀 Train New Model
            </button>
            <button 
              v-if="selectedModelForConfig && savedModelsTab === 'config'"
              :class="['models-tab-button', { active: savedModelsTab === 'config' }]"
              @click="savedModelsTab = 'config'"
            >
              Training Config
            </button>
            <button 
              v-if="(trainingInProgress || trainingHistory.length > 0) && savedModelsTab === 'progress'"
              :class="['models-tab-button', { active: savedModelsTab === 'progress' }]"
              @click="savedModelsTab = 'progress'"
            >
              📊 Training Progress
            </button>
            <button 
              v-if="viewingModelId && savedModelsTab === 'statistics'"
              :class="['models-tab-button', { active: savedModelsTab === 'statistics' }]"
              @click="savedModelsTab = 'statistics'"
            >
              📈 Statistics
            </button>
          </div>
        </div>

        <!-- Models List Tab -->
        <div v-show="savedModelsTab === 'list'" class="models-table-container">
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
                    @click="viewModelConfig(model)"
                    class="btn btn-small btn-config"
                    :class="{ 'selected': selectedModelForConfig?.id === model.id }"
                    title="View training configuration"
                  >
                    ⚙️
                  </button>
                  <button 
                    @click="viewModelHistory(model.id)"
                    class="btn btn-small btn-stats"
                    :title="'View training statistics'"
                  >
                    📊
                  </button>
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
                  <button 
                    @click="sendToLibrary(model)"
                    class="btn btn-small btn-library"
                    title="Send to Library"
                  >
                    📚
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="create-model-row">
            <button @click="openCreateModel" class="btn-create-model">
              <span class="create-icon">+</span>
              <span>Create New Model</span>
            </button>
          </div>
        </div>

        <!-- Train New Model Tab -->
        <div v-show="savedModelsTab === 'train'" class="model-train-view">
          <div class="train-header">
            <h4>🚀 Train New Model</h4>
            <button @click="closeTrainModel" class="btn btn-small btn-secondary">← Back to List</button>
          </div>

          <!-- Timeline Stepper -->
          <div class="timeline-stepper">
            <div class="step-item" :class="{ active: trainingStep === 1, completed: trainingStep > 1 }">
              <div class="step-number">1</div>
              <div class="step-label">Select Appliance</div>
            </div>
            <div class="step-connector" :class="{ completed: trainingStep > 1 }"></div>
            
            <div class="step-item" :class="{ active: trainingStep === 2, completed: trainingStep > 2 }">
              <div class="step-number">2</div>
              <div class="step-label">Training Parameters</div>
            </div>
            <div class="step-connector" :class="{ completed: trainingStep > 2 }"></div>
            
            <div class="step-item" :class="{ active: trainingStep === 3, completed: trainingStep > 3 }">
              <div class="step-number">3</div>
              <div class="step-label">Early Stopping</div>
            </div>
            <div class="step-connector" :class="{ completed: trainingStep > 3 }"></div>
            
            <div class="step-item" :class="{ active: trainingStep === 4, completed: trainingStep > 4 }">
              <div class="step-number">4</div>
              <div class="step-label">Model Name</div>
            </div>
          </div>

          <div class="train-form">
            <!-- Step 1: Appliance Selection -->
            <div v-show="trainingStep === 1" class="form-step">
              <div class="step-header">
                <span class="step-badge">Step 1</span>
                <h5>⚡ Select Appliance</h5>
              </div>
              <p class="section-hint">Choose which appliance to train the seq2point model for</p>
              
              <div v-if="loadingTags" class="loading-tags">Loading available appliances...</div>
              
              <div v-else-if="availableTags.length > 0" class="appliance-selection-grid">
                <label 
                  v-for="tag in availableTags" 
                  :key="tag"
                  class="appliance-radio-card"
                  :class="{ 'selected': selectedAppliance === tag }"
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

            <!-- Step 2: Training Parameters -->
            <div v-show="trainingStep === 2" class="form-step">
              <div class="step-header">
                <span class="step-badge">Step 2</span>
                <h5>🛠️ Training Parameters</h5>
              </div>
              
              <!-- Date Range -->
              <div class="param-subsection">
                <h6>📅 Training Period (optional)</h6>
                <p class="section-hint">Filter training data by date range</p>
                <div class="date-inputs-horizontal">
                  <div class="date-field">
                    <label for="trainStartDate">Start Date:</label>
                    <input 
                      id="trainStartDate"
                      v-model="startDate"
                      type="date"
                      :disabled="trainingInProgress"
                      :max="endDate || undefined"
                    />
                  </div>
                  <div class="date-field">
                    <label for="trainEndDate">End Date:</label>
                    <input 
                      id="trainEndDate"
                      v-model="endDate"
                      type="date"
                      :disabled="trainingInProgress"
                      :min="startDate || undefined"
                    />
                  </div>
                  <button 
                    v-if="startDate || endDate"
                    @click="clearDateRange"
                    :disabled="trainingInProgress"
                    class="btn-clear-dates-inline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <!-- Model Parameters -->
              <div class="param-subsection">
                <h6>⚙️ Model Configuration</h6>
                <div class="params-grid">
                  <div class="param-field">
                    <label for="trainWindowLength">Window Length:</label>
                    <input 
                      id="trainWindowLength"
                      v-model.number="windowLength"
                      type="number"
                      min="299"
                      max="999"
                      step="100"
                      :disabled="trainingInProgress"
                    />
                    <span class="field-hint">Input sequence size (default: 599, must be odd)</span>
                  </div>
                  
                  <div class="param-field">
                    <label for="trainMaxEpochs">Max Epochs:</label>
                    <input 
                      id="trainMaxEpochs"
                      v-model.number="maxEpochs"
                      type="number"
                      min="5"
                      max="200"
                      :disabled="trainingInProgress"
                    />
                    <span class="field-hint">Maximum training epochs</span>
                  </div>
                  
                  <div class="param-field">
                    <label for="trainBatchSize">Batch Size:</label>
                    <input 
                      id="trainBatchSize"
                      v-model.number="batchSize"
                      type="number"
                      min="100"
                      max="2000"
                      step="100"
                      :disabled="trainingInProgress"
                    />
                    <span class="field-hint">Samples per batch</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 3: Early Stopping -->
            <div v-show="trainingStep === 3" class="form-step">
              <div class="step-header">
                <span class="step-badge">Step 3</span>
                <h5>🛑 Early Stopping</h5>
              </div>
              <p class="section-hint">Automatically stop training when validation loss stops improving</p>
              
              <label class="checkbox-label">
                <input 
                  type="checkbox"
                  v-model="earlyStoppingEnabled"
                  :disabled="trainingInProgress"
                />
                <span>Enable Early Stopping</span>
              </label>
              
              <div v-if="earlyStoppingEnabled" class="params-grid">
                <div class="param-field">
                  <label for="trainPatience">Patience:</label>
                  <input 
                    id="trainPatience"
                    v-model.number="patience"
                    type="number"
                    min="1"
                    max="20"
                    :disabled="trainingInProgress"
                  />
                  <span class="field-hint">Epochs to wait without improvement</span>
                </div>
                
                <div class="param-field">
                  <label for="trainMinDelta">Min Delta:</label>
                  <input 
                    id="trainMinDelta"
                    v-model.number="minDelta"
                    type="number"
                    min="0"
                    max="0.01"
                    step="0.0001"
                    :disabled="trainingInProgress"
                  />
                  <span class="field-hint">Minimum loss decrease threshold</span>
                </div>
              </div>
            </div>

            <!-- Step 4: Model Name -->
            <div v-show="trainingStep === 4" class="form-step">
              <div class="step-header">
                <span class="step-badge">Step 4</span>
                <h5>📝 Model Name</h5>
              </div>
              <p class="section-hint">Give your model a descriptive name</p>
              
              <div class="model-name-field">
                <input 
                  v-model="newModelName"
                  :disabled="trainingInProgress"
                  class="model-name-input-large"
                  :placeholder="suggestedModelName"
                  maxlength="100"
                />
                <button 
                  v-if="suggestedModelName && newModelName !== suggestedModelName"
                  @click="useSuggestedName"
                  :disabled="trainingInProgress"
                  class="btn-use-suggestion-inline"
                >
                  Use: {{ suggestedModelName }}
                </button>
              </div>
            </div>

            <!-- Navigation Buttons -->
            <div class="form-navigation">
              <button 
                v-if="trainingStep > 1"
                @click="trainingStep--"
                :disabled="trainingInProgress"
                class="btn btn-secondary"
              >
                ← Previous
              </button>
              
              <button 
                v-if="trainingStep < 4"
                @click="nextStep"
                :disabled="!canProceed || trainingInProgress"
                class="btn btn-primary"
              >
                Next →
              </button>
              
              <button 
                v-if="trainingStep === 4"
                @click="startTraining"
                :disabled="!selectedAppliance || trainingInProgress"
                class="btn btn-success"
              >
                🚀 Start Training
              </button>
            </div>

            <!-- Start Training Button -->
            <div v-show="false" class="form-actions">
              <button 
                @click="startTraining" 
                :disabled="trainingInProgress || !selectedAppliance"
                class="btn btn-primary btn-large"
              >
                {{ trainingInProgress ? 'Training in Progress...' : 'Start Training' }}
              </button>
              <button 
                v-if="trainingInProgress"
                @click="stopTraining" 
                class="btn btn-danger btn-large"
              >
                🛑 Stop Training
              </button>
            </div>
          </div>
        </div>

        <!-- Training Config Tab -->
        <div v-show="savedModelsTab === 'config'" class="model-config-view">
          <div v-if="selectedModelForConfig" class="config-header">
            <div class="config-model-info">
              <h4>{{ selectedModelForConfig.name || selectedModelForConfig.appliance }}</h4>
              <span class="config-model-date">Trained: {{ formatDate(selectedModelForConfig.trainedAt) }}</span>
            </div>
            <button @click="closeModelConfig" class="btn btn-small btn-secondary">← Back to List</button>
          </div>

          <div v-if="selectedModelForConfig?.trainingConfig" class="training-config-display">
            <div class="config-grid">
              <div class="config-item">
                <div class="config-label">Window Length</div>
                <div class="config-value">{{ selectedModelForConfig.trainingConfig.windowLength }} timesteps</div>
              </div>
              <div class="config-item">
                <div class="config-label">Batch Size</div>
                <div class="config-value">{{ selectedModelForConfig.trainingConfig.batchSize }} samples</div>
              </div>
              <div class="config-item">
                <div class="config-label">Max Epochs</div>
                <div class="config-value">{{ selectedModelForConfig.trainingConfig.maxEpochs }}</div>
              </div>
              <div class="config-item">
                <div class="config-label">Actual Epochs</div>
                <div class="config-value">{{ selectedModelForConfig.trainingConfig.actualEpochs }}</div>
              </div>
              <div class="config-item">
                <div class="config-label">Early Stopping</div>
                <div class="config-value">
                  {{ selectedModelForConfig.trainingConfig.earlyStoppingEnabled ? 'Enabled' : 'Disabled' }}
                </div>
              </div>
              <div v-if="selectedModelForConfig.trainingConfig.earlyStoppingEnabled" class="config-item">
                <div class="config-label">Patience</div>
                <div class="config-value">{{ selectedModelForConfig.trainingConfig.patience }} epochs</div>
              </div>
              <div v-if="selectedModelForConfig.trainingConfig.earlyStoppingEnabled" class="config-item">
                <div class="config-label">Min Delta</div>
                <div class="config-value">{{ selectedModelForConfig.trainingConfig.minDelta }}</div>
              </div>
              <div v-if="selectedModelForConfig.datasetInfo?.dateRange" class="config-item config-item-wide">
                <div class="config-label">Date Range</div>
                <div class="config-value">
                  {{ selectedModelForConfig.datasetInfo.dateRange.startDate || 'Any' }} to 
                  {{ selectedModelForConfig.datasetInfo.dateRange.endDate || 'Any' }}
                </div>
              </div>
            </div>

            <!-- Metrics Summary -->
            <div class="metrics-summary">
              <h5>Final Metrics</h5>
              <div class="metrics-grid-compact">
                <div class="metric-item">
                  <span class="metric-label">Training Loss</span>
                  <span class="metric-value">{{ selectedModelForConfig.finalMetrics?.loss?.toFixed(4) || 'N/A' }}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Training MAE</span>
                  <span class="metric-value">{{ selectedModelForConfig.finalMetrics?.mae?.toFixed(2) || 'N/A' }} W</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Validation Loss</span>
                  <span class="metric-value">{{ selectedModelForConfig.finalMetrics?.valLoss?.toFixed(4) || 'N/A' }}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Validation MAE</span>
                  <span class="metric-value">{{ selectedModelForConfig.finalMetrics?.valMae?.toFixed(2) || 'N/A' }} W</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="no-config-message">
            Training configuration not available for this model.
          </div>
        </div>

        <!-- Training Progress Tab -->
        <div v-show="savedModelsTab === 'progress'" class="training-progress-view">
          <div class="progress-header">
            <h4>📊 Training Progress</h4>
            <button @click="closeTrainingProgress" class="btn btn-small btn-secondary">← Back to List</button>
          </div>

          <div v-if="trainingInProgress" class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            <span class="progress-text">Epoch {{ currentEpoch }} / {{ totalEpochs }}</span>
          </div>
          
          <div v-if="stoppedEarly" class="early-stop-message">
            🛑 Training stopped early due to no improvement in validation loss
          </div>

          <!-- Training Progress Tabs -->
          <div class="training-progress-tabs">
            <button
              :class="['progress-tab-button', { active: trainingProgressTab === 'metrics' }]"
              @click="trainingProgressTab = 'metrics'"
            >
              📊 Metrics
            </button>
            <button
              :class="['progress-tab-button', { active: trainingProgressTab === 'chart' }]"
              @click="trainingProgressTab = 'chart'"
            >
              📈 Learning Curves
            </button>
          </div>

          <!-- Metrics Tab -->
          <div v-show="trainingProgressTab === 'metrics'" class="metrics-tab-content">
            <div v-if="currentMetrics" class="metrics-grid">
              <div class="metric-card">
                <div class="metric-label">Training Loss (MSE)</div>
                <div class="metric-value">{{ currentMetrics.loss.toFixed(4) }}</div>
                <div class="metric-description">Mean Squared Error on training data</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Training MAE</div>
                <div class="metric-value">{{ currentMetrics.mae !== undefined && currentMetrics.mae !== null ? currentMetrics.mae.toFixed(2) + ' W' : 'N/A' }}</div>
                <div class="metric-description">Mean Absolute Error on training data</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Validation Loss (MSE)</div>
                <div class="metric-value">{{ currentMetrics.valLoss.toFixed(4) }}</div>
                <div class="metric-description">Mean Squared Error on validation data</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Validation MAE</div>
                <div class="metric-value">{{ currentMetrics.valMae !== undefined && currentMetrics.valMae !== null ? currentMetrics.valMae.toFixed(2) + ' W' : 'N/A' }}</div>
                <div class="metric-description">Mean Absolute Error on validation data</div>
              </div>
            </div>
            <div v-else class="no-metrics-message">
              No metrics available yet. Training will start soon...
            </div>
          </div>

          <!-- Chart Tab -->
          <div v-show="trainingProgressTab === 'chart'" class="chart-tab-content">
            <div class="chart-container">
              <canvas ref="chartCanvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Statistics Tab -->
        <div v-show="savedModelsTab === 'statistics'" class="statistics-view">
          <div class="statistics-header">
            <div class="statistics-title">
              <h4>📈 Training Statistics: {{ viewingModelName }}</h4>
            </div>
            <button @click="closeStatistics" class="btn btn-small btn-secondary">← Back to List</button>
          </div>

          <!-- Statistics Tabs -->
          <div class="training-progress-tabs">
            <button
              :class="['progress-tab-button', { active: statisticsTab === 'metrics' }]"
              @click="statisticsTab = 'metrics'"
            >
              📊 Metrics
            </button>
            <button
              :class="['progress-tab-button', { active: statisticsTab === 'chart' }]"
              @click="statisticsTab = 'chart'"
            >
              📈 Learning Curves
            </button>
            <button
              :class="['progress-tab-button', { active: statisticsTab === 'config' }]"
              @click="statisticsTab = 'config'"
            >
              ⚙️ Configuration
            </button>
          </div>

          <!-- Metrics Tab -->
          <div v-show="statisticsTab === 'metrics'" class="metrics-tab-content">
            <div v-if="currentMetrics" class="metrics-grid">
              <div class="metric-card">
                <div class="metric-label">Training Loss (MSE)</div>
                <div class="metric-value">{{ currentMetrics.loss.toFixed(4) }}</div>
                <div class="metric-description">Mean Squared Error on training data</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Training MAE</div>
                <div class="metric-value">{{ currentMetrics.mae !== undefined && currentMetrics.mae !== null ? currentMetrics.mae.toFixed(2) + ' W' : 'N/A' }}</div>
                <div class="metric-description">Mean Absolute Error on training data</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Validation Loss (MSE)</div>
                <div class="metric-value">{{ currentMetrics.valLoss.toFixed(4) }}</div>
                <div class="metric-description">Mean Squared Error on validation data</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Validation MAE</div>
                <div class="metric-value">{{ currentMetrics.valMae !== undefined && currentMetrics.valMae !== null ? currentMetrics.valMae.toFixed(2) + ' W' : 'N/A' }}</div>
                <div class="metric-description">Mean Absolute Error on validation data</div>
              </div>
            </div>
            <div v-else class="no-metrics-message">
              No metrics available for this model.
            </div>
          </div>

          <!-- Chart Tab -->
          <div v-show="statisticsTab === 'chart'" class="chart-tab-content">
            <div class="chart-container">
              <canvas ref="chartCanvasStats"></canvas>
            </div>
          </div>

          <!-- Configuration Tab -->
          <div v-show="statisticsTab === 'config'" class="config-tab-content">
            <div v-if="viewingModel && viewingModel.trainingConfig" class="training-config-display">
              <div class="config-grid">
                <div class="config-item">
                  <div class="config-label">Window Length</div>
                  <div class="config-value">{{ viewingModel.trainingConfig.windowLength }} timesteps</div>
                </div>
                <div class="config-item">
                  <div class="config-label">Batch Size</div>
                  <div class="config-value">{{ viewingModel.trainingConfig.batchSize }} samples</div>
                </div>
                <div class="config-item">
                  <div class="config-label">Max Epochs</div>
                  <div class="config-value">{{ viewingModel.trainingConfig.maxEpochs }}</div>
                </div>
                <div class="config-item">
                  <div class="config-label">Actual Epochs</div>
                  <div class="config-value">{{ viewingModel.trainingConfig.actualEpochs }}</div>
                </div>
                <div class="config-item">
                  <div class="config-label">Early Stopping</div>
                  <div class="config-value">
                    {{ viewingModel.trainingConfig.earlyStoppingEnabled ? 'Enabled' : 'Disabled' }}
                  </div>
                </div>
                <div v-if="viewingModel.trainingConfig.earlyStoppingEnabled" class="config-item">
                  <div class="config-label">Patience</div>
                  <div class="config-value">{{ viewingModel.trainingConfig.patience }} epochs</div>
                </div>
                <div v-if="viewingModel.trainingConfig.earlyStoppingEnabled" class="config-item">
                  <div class="config-label">Min Delta</div>
                  <div class="config-value">{{ viewingModel.trainingConfig.minDelta }}</div>
                </div>
                <div v-if="viewingModel.datasetInfo?.dateRange" class="config-item config-item-wide">
                  <div class="config-label">Date Range</div>
                  <div class="config-value">
                    {{ viewingModel.datasetInfo.dateRange.startDate || 'Any' }} to 
                    {{ viewingModel.datasetInfo.dateRange.endDate || 'Any' }}
                  </div>
                </div>
              </div>

              <!-- Metrics Summary -->
              <div class="metrics-summary">
                <h5>Final Metrics</h5>
                <div class="metrics-grid-compact">
                  <div class="metric-item">
                    <span class="metric-label">Training Loss</span>
                    <span class="metric-value">{{ viewingModel.finalMetrics?.loss?.toFixed(4) || 'N/A' }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Training MAE</span>
                    <span class="metric-value">{{ viewingModel.finalMetrics?.mae?.toFixed(2) || 'N/A' }} W</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Validation Loss</span>
                    <span class="metric-value">{{ viewingModel.finalMetrics?.valLoss?.toFixed(4) || 'N/A' }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Validation MAE</span>
                    <span class="metric-value">{{ viewingModel.finalMetrics?.valMae?.toFixed(2) || 'N/A' }} W</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="no-config-message">
              Training configuration not available for this model.
            </div>
          </div>
        </div>
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
      toasts: [],
      activeTab: 'appliance',
      viewingModelId: null,
      viewingModelName: '',
      modelViewTab: 'history',
      savedModelsTab: 'list',
      selectedModelForConfig: null,
      trainingStep: 1,
      trainingProgressTab: 'metrics',
      statisticsTab: 'chart',
      showLogs: false,
      backendLogs: [],
      logsAutoScroll: true
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
    },
    viewingModel() {
      if (!this.viewingModelId) return null
      return this.savedModels.find(m => m.id === this.viewingModelId)
    },
    canProceed() {
      // Step 1: Must select an appliance
      if (this.trainingStep === 1) {
        return this.selectedAppliance !== null
      }
      // Steps 2, 3, 4: Can always proceed (have defaults)
      return true
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
          trainingConfig: model.metadata?.trainingConfig,
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
      // modelId is actually the appliance name for seq2point models
      const model = this.savedModels.find(m => m.id === modelId)
      if (!model) return
      
      if (!confirm(`Are you sure you want to delete the model for "${model.appliance}"?`)) {
        return
      }

      this.deletingModel = true
      this.error = null

      try {
        // Use seq2point delete endpoint
        const response = await fetch(`/api/seq2point/delete/${model.appliance}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to delete model')
        }

        // Refresh models list
        await this.loadModelsList()
        this.showToast(`Model for ${model.appliance} deleted successfully`, 'success')
        console.log('🗑️ Model deleted successfully')
      } catch (err) {
        this.error = 'Failed to delete model: ' + err.message
        this.showToast('Failed to delete model: ' + err.message, 'error')
        console.error('Delete model error:', err)
      } finally {
        this.deletingModel = false
      }
    },

    sendToLibrary(model) {
      // Emit event to parent with model data
      this.$emit('send-to-library', {
        appliance: model.appliance,
        name: model.name || model.appliance,
        modelId: model.id,
        datasetInfo: model.datasetInfo,
        finalMetrics: model.finalMetrics
      })
      this.showToast(`Sending ${model.appliance} to Library`, 'info')
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

    async viewModelHistory(modelId) {
      try {
        const model = this.savedModels.find(m => m.id === modelId)
        if (!model) return
        
        this.viewingModelId = modelId
        this.viewingModelName = model.name || model.appliance || 'Model'
        this.savedModelsTab = 'statistics' // Open statistics tab
        this.statisticsTab = 'chart' // Default to chart view
        
        // For seq2point models, training history is stored in metadata
        if (model.metadata && model.metadata.trainingHistory) {
          this.trainingHistory = model.metadata.trainingHistory
          this.totalEpochs = this.trainingHistory.length
          
          // Set metrics from last epoch
          if (this.trainingHistory.length > 0) {
            const lastEpoch = this.trainingHistory[this.trainingHistory.length - 1]
            this.currentEpoch = lastEpoch.epoch
            this.currentMetrics = {
              loss: lastEpoch.loss,
              mae: lastEpoch.power_output_mae || lastEpoch.mae || lastEpoch.meanAbsoluteError || 0,
              valLoss: lastEpoch.valLoss,
              valMae: lastEpoch.val_power_output_mae || lastEpoch.valMae || lastEpoch.val_meanAbsoluteError || 0
            }
          }
          
          // Update chart
          this.$nextTick(() => {
            const canvasRef = this.$refs.chartCanvasStats
            if (canvasRef) {
              if (this.chart) {
                this.chart.destroy()
                this.chart = null
              }
              this.createChart()
            }
          })
        } else {
          this.showToast('No training history available for this model', 'warning')
        }
      } catch (err) {
        this.showToast('Failed to load training history: ' + err.message, 'error')
        console.error('View model history error:', err)
      }
    },
    
    closeStatistics() {
      this.viewingModelId = null
      this.viewingModelName = ''
      this.trainingHistory = []
      this.currentMetrics = null
      this.savedModelsTab = 'list'
      
      // Destroy chart
      if (this.chart) {
        this.chart.destroy()
        this.chart = null
      }
    },

    viewModelConfig(model) {
      this.selectedModelForConfig = model
      this.savedModelsTab = 'config'
    },

    closeModelConfig() {
      this.savedModelsTab = 'list'
      this.selectedModelForConfig = null
    },

    openCreateModel() {
      this.savedModelsTab = 'train'
      this.selectedModelForConfig = null
      this.trainingStep = 1  // Reset to first step
    },

    closeTrainModel() {
      this.savedModelsTab = 'list'
      this.trainingStep = 1  // Reset step when closing
    },

    closeTrainingProgress() {
      this.savedModelsTab = 'list'
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
        // modelId is the appliance name for seq2point models
        const response = await fetch(`/api/seq2point/update-name/${modelId}`, {
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
        this.showToast('Model name updated successfully', 'success')
        console.log('✅ Model name updated successfully')
      } catch (err) {
        this.error = 'Failed to update model name: ' + err.message
        this.showToast('Failed to update model name', 'error')
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
      this.backendLogs = [] // Clear logs for new training session

      // Switch to progress tab to show training
      this.savedModelsTab = 'progress'
      
      // Add initial log entry
      this.addLog('info', 'Starting training process...')

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
                
                // Handle log messages from backend
                if (data.log) {
                  this.addLog(data.log, data.message)
                  continue
                }
                
                if (data.error) {
                  this.error = data.error
                  this.addLog('error', data.error)
                  this.trainingInProgress = false
                  break
                }

                if (data.done) {
                  this.trainingInProgress = false
                  this.modelTrained = true
                  this.newModelName = '' // Clear the input after successful training
                  this.addLog('success', 'Training completed successfully!')
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
                  mae: data.power_output_mae || data.mae || data.meanAbsoluteError || 0,
                  valLoss: data.valLoss,
                  valMae: data.val_power_output_mae || data.valMae || data.val_meanAbsoluteError || 0
                }
                
                // Log epoch progress
                if (data.epoch) {
                  this.addLog('epoch', `Epoch ${data.epoch}: Loss=${data.loss?.toFixed(4)}, MAE=${this.currentMetrics.mae?.toFixed(2)}W, Val Loss=${data.valLoss?.toFixed(4)}, Val MAE=${this.currentMetrics.valMae?.toFixed(2)}W`)
                }
                
                // Debug logging
                console.log('📊 Current metrics:', {
                  power_output_mae: data.power_output_mae,
                  val_power_output_mae: data.val_power_output_mae,
                  mae: data.mae,
                  valMae: data.valMae,
                  computed: this.currentMetrics
                })
                
                this.trainingHistory.push(data)
                
                // Check if early stopping occurred
                if (data.stoppedEarly) {
                  this.stoppedEarly = true
                  this.addLog('warning', 'Training stopped early due to no improvement in validation loss')
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
        this.addLog('error', 'Training failed: ' + err.message)
        this.trainingInProgress = false
        console.error('Training error:', err)
      }
    },

    toggleLogs() {
      this.showLogs = !this.showLogs
    },

    addLog(type, message) {
      const timestamp = new Date().toLocaleTimeString()
      this.backendLogs.push({ type, message, timestamp })
      
      // Auto-scroll to bottom if enabled
      if (this.logsAutoScroll) {
        this.$nextTick(() => {
          const logsBody = this.$refs.logsBody
          if (logsBody) {
            logsBody.scrollTop = logsBody.scrollHeight
          }
        })
      }
      
      // Keep only last 500 logs to prevent memory issues
      if (this.backendLogs.length > 500) {
        this.backendLogs.shift()
      }
    },

    clearLogs() {
      this.backendLogs = []
      this.addLog('info', 'Logs cleared')
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
      
      if (!this.chart) {
        console.warn('❌ Cannot update chart: chart missing')
        return
      }

      try {
        // Convert reactive arrays to plain arrays to avoid Vue reactivity issues with Chart.js
        const epochs = [...this.trainingHistory.map(h => h.epoch)]
        const losses = [...this.trainingHistory.map(h => h.loss)]
        const valLosses = [...this.trainingHistory.map(h => h.valLoss)]
        const maes = [...this.trainingHistory.map(h => h.power_output_mae || h.mae || h.meanAbsoluteError || 0)]
        const valMaes = [...this.trainingHistory.map(h => h.val_power_output_mae || h.valMae || h.val_meanAbsoluteError || 0)]


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
      // Determine which canvas to use based on context
      let canvasRef
      if (this.savedModelsTab === 'statistics') {
        canvasRef = this.$refs.chartCanvasStats
      } else {
        canvasRef = this.$refs.chartCanvas
      }
      
      if (!canvasRef) return

      if (this.chart) {
        // Update existing chart
        this.updateChartData()
      } else if (this.trainingHistory.length > 0) {
        // Create new chart
        this.createChart()
      }
    },

    createChart() {
      // Determine which canvas to use based on context
      let canvasRef
      if (this.savedModelsTab === 'statistics') {
        canvasRef = this.$refs.chartCanvasStats
      } else {
        canvasRef = this.$refs.chartCanvas
      }
      
      if (!canvasRef || this.trainingHistory.length === 0) return

      // Convert reactive arrays to plain arrays to avoid Vue reactivity issues with Chart.js
      const epochs = [...this.trainingHistory.map(h => h.epoch)]
      const losses = [...this.trainingHistory.map(h => h.loss)]
      const valLosses = [...this.trainingHistory.map(h => h.valLoss)]
      const maes = [...this.trainingHistory.map(h => h.power_output_mae || h.mae || h.meanAbsoluteError || 0)]
      const valMaes = [...this.trainingHistory.map(h => h.val_power_output_mae || h.valMae || h.val_meanAbsoluteError || 0)]

      const ctx = canvasRef.getContext('2d')
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

    nextStep() {
      if (this.canProceed && this.trainingStep < 4) {
        this.trainingStep++
      }
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
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Top Row: Saved Models (Full Width) */
.top-row {
  display: block;
}

/* Saved Models Section */
.models-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
  min-height: 600px;
}

.models-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
}

.models-section h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
}

.models-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 2px solid #e0e0e0;
}

.models-tab-button {
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  transition: all 0.3s;
  margin-bottom: -2px;
}

.models-tab-button:hover {
  background: rgba(66, 185, 131, 0.1);
  color: #42b983;
}

.models-tab-button.active {
  color: #42b983;
  border-bottom-color: #42b983;
  background: transparent;
}

.models-table-container {
  overflow-y: auto;
  flex: 1;
}

.model-config-view {
  flex: 1;
  overflow-y: auto;
  animation: fadeIn 0.3s ease-in;
}

/* Training Progress View */
.training-progress-view {
  flex: 1;
  overflow-y: auto;
  animation: fadeIn 0.3s ease-in;
}

/* Statistics View */
.statistics-view {
  flex: 1;
  overflow-y: auto;
  animation: fadeIn 0.3s ease-in;
}

.statistics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e0e0;
}

.statistics-title h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e0e0;
}

.progress-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e0e0;
}

.config-model-info h4 {
  margin: 0 0 5px 0;
  color: #2c3e50;
  font-size: 16px;
}

.config-model-date {
  font-size: 13px;
  color: #999;
}

/* Create Model Button */
.create-model-row {
  padding: 15px;
  border-top: 2px solid #e0e0e0;
  margin-top: 10px;
}

.btn-create-model {
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #42b983 0%, #35a372 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.3);
}

.btn-create-model:hover {
  background: linear-gradient(135deg, #35a372 0%, #2d8d61 100%);
  box-shadow: 0 4px 12px rgba(66, 185, 131, 0.4);
  transform: translateY(-2px);
}

.btn-create-model:active {
  transform: translateY(0);
}

.create-icon {
  font-size: 24px;
  font-weight: 700;
}

/* Train New Model View */
.model-train-view {
  flex: 1;
  overflow-y: auto;
  animation: fadeIn 0.3s ease-in;
}

.train-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e0e0;
}

.train-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
}

.train-form {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.form-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid #42b983;
}

.form-section h5 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 15px;
  font-weight: 600;
}

.section-hint {
  margin: 0 0 15px 0;
  font-size: 13px;
  color: #666;
  line-height: 1.4;
}

.appliance-selection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.appliance-radio-card {
  padding: 15px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.appliance-radio-card:hover {
  border-color: #42b983;
  background: rgba(66, 185, 131, 0.05);
}

.appliance-radio-card.selected {
  border-color: #42b983;
  background: rgba(66, 185, 131, 0.1);
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.2);
}

.appliance-radio-card input[type="radio"] {
  margin: 0;
}

.appliance-radio-card .appliance-name {
  font-weight: 500;
  color: #2c3e50;
}

.date-inputs-horizontal {
  display: flex;
  gap: 15px;
  align-items: flex-end;
}

.date-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.date-field label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.date-field input {
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
}

.date-field input:focus {
  outline: none;
  border-color: #42b983;
}

.btn-clear-dates-inline {
  padding: 10px 20px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.btn-clear-dates-inline:hover {
  background: #c82333;
}

.params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 15px;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-field label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.param-field input {
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
}

.param-field input:focus {
  outline: none;
  border-color: #42b983;
}

.field-hint {
  font-size: 12px;
  color: #999;
  font-style: italic;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
  cursor: pointer;
  margin-bottom: 15px;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.model-name-field {
  display: flex;
  gap: 10px;
  align-items: center;
}

.model-name-input-large {
  flex: 1;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
}

.model-name-input-large:focus {
  outline: none;
  border-color: #42b983;
}

.btn-use-suggestion-inline {
  padding: 10px 16px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.btn-use-suggestion-inline:hover {
  background: #5a6268;
}

.form-actions {
  display: flex;
  gap: 15px;
  padding-top: 20px;
  border-top: 2px solid #e0e0e0;
}

.btn-large {
  flex: 1;
  padding: 15px 30px;
  font-size: 16px;
  font-weight: 600;
}


/* Training Configuration Panel */
.config-panel {
  background: white;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  max-height: 600px;
}

.config-panel h3 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 18px;
}

/* Tab Navigation */
.config-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 0;
  border-bottom: 2px solid #e0e0e0;
}

.tab-button {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  transition: all 0.3s;
  margin-bottom: -2px;
}

.tab-button:hover {
  background: rgba(66, 185, 131, 0.1);
  color: #42b983;
}

.tab-button.active {
  color: #42b983;
  border-bottom-color: #42b983;
  background: transparent;
}

/* Tab Content Area */
.tab-content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 0;
}

.tab-content {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tab-content h4 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 16px;
}

.section-description {
  color: #666;
  font-size: 13px;
  margin-bottom: 15px;
  line-height: 1.5;
}

/* Progress Panel - Full Width Below */
.progress-panel {
  background: white;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  min-height: 500px;
}

.viewing-header {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding-bottom: 15px;
  margin-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.viewing-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.viewing-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
}

/* Model View Tabs */
.model-view-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: -2px;
}

.model-tab-button {
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  transition: all 0.3s;
  margin-bottom: -2px;
}

.model-tab-button:hover {
  background: rgba(66, 185, 131, 0.1);
  color: #42b983;
}

.model-tab-button.active {
  color: #42b983;
  border-bottom-color: #42b983;
  background: transparent;
}

/* Training Config Display */
.config-view-section {
  padding: 20px;
  animation: fadeIn 0.3s ease-in;
}

.training-config-display {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.config-item {
  background: white;
  padding: 15px;
  border-radius: 6px;
  border-left: 4px solid #42b983;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.config-item-wide {
  grid-column: 1 / -1;
}

.config-label {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.config-value {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.no-config-message {
  text-align: center;
  padding: 40px;
  color: #999;
  font-style: italic;
}

/* Metrics Summary */
.metrics-summary {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 2px solid #e0e0e0;
}

.metrics-summary h5 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metrics-grid-compact {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border-left: 4px solid #42b983;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.metric-item .metric-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-item .metric-value {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
}

.progress-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}

.training-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 15px;
  border-top: 1px solid #e0e0e0;
  margin-top: auto;
}

.model-name-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.btn-use-suggestion {
  padding: 8px 12px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-use-suggestion:hover:not(:disabled) {
  background: #5a6268;
}

/* Timeline Stepper */
.timeline-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 30px 0 40px 0;
  padding: 0 40px;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 2;
}

.step-number {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #e0e0e0;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  border: 3px solid #e0e0e0;
  transition: all 0.3s ease;
}

.step-item.active .step-number {
  background: #2196F3;
  color: white;
  border-color: #2196F3;
  box-shadow: 0 2px 12px rgba(33, 150, 243, 0.4);
  transform: scale(1.1);
}

.step-item.completed .step-number {
  background: #42b983;
  color: white;
  border-color: #42b983;
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.3);
}

.step-label {
  font-size: 13px;
  font-weight: 600;
  color: #999;
  text-align: center;
  max-width: 120px;
  transition: color 0.3s ease;
}

.step-item.active .step-label {
  color: #2196F3;
  font-weight: 700;
}

.step-item.completed .step-label {
  color: #42b983;
}

.step-connector {
  flex: 1;
  height: 3px;
  background: #e0e0e0;
  margin: 0 -10px;
  margin-bottom: 30px;
  transition: background 0.3s ease;
}

.step-connector.completed {
  background: #42b983;
}

/* Form Steps */
.form-step {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 25px;
  margin-bottom: 20px;
  transition: all 0.3s ease;
}

.form-step:hover {
  border-color: #42b983;
  box-shadow: 0 2px 12px rgba(66, 185, 131, 0.1);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;
}

.step-badge {
  background: #42b983;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.step-header h5 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.param-subsection {
  margin-bottom: 25px;
}

.param-subsection:last-child {
  margin-bottom: 0;
}

.param-subsection h6 {
  margin: 0 0 10px 0;
  font-size: 15px;
  color: #555;
  font-weight: 600;
}

.status-badge {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  text-align: center;
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

/* Form Navigation */
.form-navigation {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-top: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
}

.form-navigation .btn {
  padding: 12px 30px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  min-width: 140px;
}

.form-navigation .btn-secondary {
  background: #6c757d;
  color: white;
}

.form-navigation .btn-secondary:hover:not(:disabled) {
  background: #5a6268;
  transform: translateX(-2px);
}

.form-navigation .btn-primary {
  background: #2196F3;
  color: white;
  margin-left: auto;
}

.form-navigation .btn-primary:hover:not(:disabled) {
  background: #1976D2;
  transform: translateX(2px);
}

.form-navigation .btn-success {
  background: #42b983;
  color: white;
  margin-left: auto;
}

.form-navigation .btn-success:hover:not(:disabled) {
  background: #35a372;
  box-shadow: 0 4px 12px rgba(66, 185, 131, 0.3);
  transform: translateY(-2px);
}

.form-navigation .btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
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

/* Training Progress Tabs */
.training-progress-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0;
}

.progress-tab-button {
  background: transparent;
  border: none;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  color: #666;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.3s ease;
  position: relative;
  bottom: -2px;
}

.progress-tab-button:hover {
  color: #42b983;
  background: rgba(66, 185, 131, 0.05);
}

.progress-tab-button.active {
  color: #42b983;
  border-bottom-color: #42b983;
}

/* Metrics Tab Content */
.metrics-tab-content,
.chart-tab-content {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.metric-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border: 2px solid #e0e0e0;
  transition: all 0.3s ease;
}

.metric-card:hover {
  border-color: #42b983;
  box-shadow: 0 4px 12px rgba(66, 185, 131, 0.2);
  transform: translateY(-2px);
}

.metric-label {
  font-size: 13px;
  color: #666;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #42b983;
  margin-bottom: 8px;
}

.metric-description {
  font-size: 11px;
  color: #999;
  margin-top: 8px;
  font-style: italic;
}

.no-metrics-message {
  background: #f8f9fa;
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  color: #666;
  font-size: 14px;
}

.chart-container {
  flex: 1;
  background: white;
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-container canvas {
  max-height: 100%;
}

/* Additional model table styles (continuing from earlier) */
.models-table-container {
  background: white;
  border-radius: 8px;
  overflow-x: auto;
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

.btn-stats {
  background: #6c757d;
  color: white;
  font-size: 16px;
  padding: 4px 10px;
}

.btn-stats:hover:not(:disabled) {
  background: #5a6268;
}

.btn-config {
  background: #ffc107;
  color: #333;
  font-size: 16px;
  padding: 4px 10px;
}

.btn-config:hover:not(:disabled) {
  background: #e0a800;
}

.btn-config.selected {
  background: #ff9800;
  border: 2px solid #e68900;
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

.btn-library {
  background: #6f42c1;
  color: white;
}

.btn-library:hover:not(:disabled) {
  background: #5a32a3;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 6px;
  margin-top: 20px;
  border: 1px solid #f5c6cb;
}

/* Date Range Inputs */
.date-inputs {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.date-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 140px;
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
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

/* Training Configuration Section */
.training-config-params {
  display: flex;
  flex-direction: column;
  gap: 15px;
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

/* Responsive Design */
@media (max-width: 1024px) {
  .top-row {
    grid-template-columns: 1fr;
  }
  
  .config-panel {
    max-height: none;
  }
}

/* Logs Icon */
.logs-icon-button {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logs-icon-button:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
}

/* Logs Modal */
.logs-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.logs-modal-content {
  background: #1e1e1e;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  max-width: 900px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #333;
}

.logs-header h4 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.btn-close-logs {
  background: none;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.btn-close-logs:hover {
  background: #333;
  color: #fff;
}

.logs-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: #0d0d0d;
}

.no-logs {
  color: #666;
  text-align: center;
  padding: 40px;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #222;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-timestamp {
  color: #666;
  min-width: 90px;
  flex-shrink: 0;
}

.log-message {
  flex: 1;
  word-break: break-word;
}

.log-entry.info .log-message {
  color: #4a9eff;
}

.log-entry.success .log-message {
  color: #42b983;
}

.log-entry.error .log-message {
  color: #ff5555;
  font-weight: 600;
}

.log-entry.warning .log-message {
  color: #ffa500;
}

.log-entry.epoch .log-message {
  color: #bb86fc;
}

.logs-footer {
  padding: 15px 20px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .logs-icon-button {
    top: 70px;
    right: 15px;
    width: 36px;
    height: 36px;
    font-size: 18px;
  }

  .logs-modal {
    padding: 10px;
  }

  .logs-modal-content {
    max-height: 90vh;
  }

  .logs-body {
    font-size: 12px;
  }

  .ml-trainer {
    padding: 10px;
  }
  
  .top-row {
    grid-template-columns: 1fr;
  }
  
  .config-tabs {
    flex-direction: column;
  }
  
  .tab-button {
    border-bottom: none;
    border-left: 3px solid transparent;
  }
  
  .tab-button.active {
    border-left-color: #42b983;
    border-bottom-color: transparent;
  }
  
  .date-inputs {
    flex-direction: column;
  }
  
  .appliance-selection {
    grid-template-columns: 1fr;
  }
  
  .training-controls {
    flex-direction: column;
  }
  
  .models-table {
    font-size: 12px;
  }
  
  .models-table th,
  .models-table td {
    padding: 8px;
  }
}

</style>
