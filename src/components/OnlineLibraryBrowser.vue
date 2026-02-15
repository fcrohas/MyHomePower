<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content online-library-browser">
      <div class="modal-header">
        <h2>📚 Browse Online Library</h2>
        <button @click="$emit('close')" class="btn-close">✕</button>
      </div>

      <div class="browser-toolbar">
        <div class="toolbar-left">
          <select v-model="selectedRepo" class="repo-selector">
            <option value="">All Repositories</option>
            <option 
              v-for="repo in repositories.filter(r => r.enabled)" 
              :key="repo.id" 
              :value="repo.id"
            >
              {{ repo.name }}
            </option>
          </select>

          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Search models..."
            class="search-input"
          />

          <select v-model="filterDeviceType" class="filter-select">
            <option value="">All Types</option>
            <option value="air_conditioner">Air Conditioner</option>
            <option value="washing_machine">Washing Machine</option>
            <option value="dishwasher">Dishwasher</option>
            <option value="refrigerator">Refrigerator</option>
            <option value="dryer">Dryer</option>
            <option value="oven">Oven</option>
            <option value="microwave">Microwave</option>
            <option value="water_heater">Water Heater</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div class="toolbar-right">
          <button 
            @click="refreshRepositories" 
            class="btn-icon-text"
            :disabled="refreshing"
          >
            <span :class="{ 'spinning': refreshing }">🔄</span>
            Refresh
          </button>
          <button @click="showRepoManager = true" class="btn-secondary">
            ⚙️ Manage Repositories
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading models from repositories...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Failed to Load Models</h3>
        <p>{{ error }}</p>
        <button @click="loadOnlineModels" class="btn-primary">Try Again</button>
      </div>

      <!-- Model Cards Grid -->
      <div v-else-if="filteredModels.length > 0" class="models-grid">
        <div 
          v-for="model in filteredModels" 
          :key="`${model.repositoryId}-${model.id}`"
          class="model-card"
          :class="{ 'already-downloaded': isDownloaded(model) }"
        >
          <div class="model-card-header">
            <div class="model-header-title">
              <h3>{{ model.name }}</h3>
              <span v-if="isDownloaded(model)" class="downloaded-badge" title="Already in your library">
                ✅
              </span>
            </div>
            <div class="model-repository-badge">
              {{ model.repositoryName }}
            </div>
          </div>

          <div class="model-card-body">
            <p class="model-description">{{ model.description || 'No description' }}</p>
            
            <div class="model-specs">
              <div class="spec-item">
                <span class="spec-label">Type:</span>
                <span class="spec-value">{{ formatDeviceType(model.deviceType) }}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">Manufacturer:</span>
                <span class="spec-value">{{ model.manufacturer || 'N/A' }}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">Model:</span>
                <span class="spec-value">{{ model.modelNumber || 'N/A' }}</span>
              </div>
            </div>

            <div class="model-properties">
              <div class="property-grid">
                <div class="property-item">
                  <span class="property-label">⚡ Power Range:</span>
                  <span class="property-value">
                    {{ model.properties.powerMin }}-{{ model.properties.powerMax }} W
                  </span>
                </div>
                <div class="property-item" v-if="model.metadata">
                  <span class="property-label">👤 Author:</span>
                  <span class="property-value">{{ model.metadata.author || 'Unknown' }}</span>
                </div>
              </div>
            </div>

            <div class="model-metadata" v-if="model.metadata">
              <div class="metadata-item" v-if="model.metadata.uploadDate">
                <span class="metadata-label">📅 Uploaded:</span>
                <span class="metadata-value">{{ formatDate(model.metadata.uploadDate) }}</span>
              </div>
              <div class="metadata-item" v-if="model.metadata.downloads">
                <span class="metadata-label">⬇️ Downloads:</span>
                <span class="metadata-value">{{ model.metadata.downloads }}</span>
              </div>
              <div class="metadata-item" v-if="model.size">
                <span class="metadata-label">💾 Size:</span>
                <span class="metadata-value">{{ formatSize(model.size) }}</span>
              </div>
            </div>

            <div class="model-footer">
              <button 
                @click="downloadModel(model)"
                class="btn-primary btn-download"
                :disabled="downloading === model.id || isDownloaded(model)"
              >
                <span v-if="downloading === model.id">⏳ Downloading...</span>
                <span v-else-if="isDownloaded(model)">✅ Downloaded</span>
                <span v-else>📥 Download</span>
              </button>
              <button 
                @click="showModelDetails(model)" 
                class="btn-secondary btn-details"
              >
                ℹ️ Details
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No Models Found</h3>
        <p v-if="searchQuery || filterDeviceType">
          Try adjusting your search or filters
        </p>
        <p v-else>
          No models available in the configured repositories
        </p>
      </div>

      <!-- Model Details Modal -->
      <div v-if="detailsModel" class="modal-overlay" @click.self="detailsModel = null">
        <div class="modal-content modal-details">
          <div class="modal-header">
            <h2>{{ detailsModel.name }}</h2>
            <button @click="detailsModel = null" class="btn-close">✕</button>
          </div>
          
          <div class="details-content">
            <div class="details-section">
              <h3>Description</h3>
              <p>{{ detailsModel.description || 'No description available' }}</p>
            </div>

            <div class="details-section">
              <h3>Technical Specifications</h3>
              <table class="details-table">
                <tr>
                  <td class="label">Device Type:</td>
                  <td>{{ formatDeviceType(detailsModel.deviceType) }}</td>
                </tr>
                <tr>
                  <td class="label">Manufacturer:</td>
                  <td>{{ detailsModel.manufacturer || 'N/A' }}</td>
                </tr>
                <tr>
                  <td class="label">Model Number:</td>
                  <td>{{ detailsModel.modelNumber || 'N/A' }}</td>
                </tr>
                <tr>
                  <td class="label">Power Min:</td>
                  <td>{{ detailsModel.properties.powerMin }} W</td>
                </tr>
                <tr>
                  <td class="label">Power Max:</td>
                  <td>{{ detailsModel.properties.powerMax }} W</td>
                </tr>
                <tr>
                  <td class="label">On/Off States:</td>
                  <td>{{ detailsModel.properties.hasOnOff ? 'Yes' : 'No' }}</td>
                </tr>
              </table>
            </div>

            <div class="details-section" v-if="detailsModel.metadata">
              <h3>Model Information</h3>
              <table class="details-table">
                <tr v-if="detailsModel.metadata.author">
                  <td class="label">Author:</td>
                  <td>{{ detailsModel.metadata.author }}</td>
                </tr>
                <tr v-if="detailsModel.metadata.version">
                  <td class="label">Version:</td>
                  <td>{{ detailsModel.metadata.version }}</td>
                </tr>
                <tr v-if="detailsModel.metadata.uploadDate">
                  <td class="label">Upload Date:</td>
                  <td>{{ formatDate(detailsModel.metadata.uploadDate) }}</td>
                </tr>
                <tr v-if="detailsModel.metadata.trainingInfo">
                  <td class="label">Training Samples:</td>
                  <td>{{ detailsModel.metadata.trainingInfo.samples || 'N/A' }}</td>
                </tr>
                <tr v-if="detailsModel.metadata.trainingInfo">
                  <td class="label">Training Days:</td>
                  <td>{{ detailsModel.metadata.trainingInfo.days || 'N/A' }}</td>
                </tr>
                <tr v-if="detailsModel.metadata.trainingInfo">
                  <td class="label">Accuracy:</td>
                  <td>{{ (detailsModel.metadata.trainingInfo.accuracy * 100).toFixed(1) || 'N/A' }}%</td>
                </tr>
              </table>
            </div>

            <div class="details-section">
              <h3>Repository</h3>
              <p><strong>{{ detailsModel.repositoryName }}</strong></p>
              <p class="repo-url">{{ detailsModel.repositoryUrl }}</p>
            </div>

            <div class="details-footer">
              <button 
                @click="downloadModel(detailsModel); detailsModel = null" 
                class="btn-primary"
                :disabled="isDownloaded(detailsModel)"
              >
                <span v-if="isDownloaded(detailsModel)">✅ Already Downloaded</span>
                <span v-else>📥 Download Model</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Repository Manager Modal -->
      <RepositoryManager 
        v-if="showRepoManager" 
        @close="showRepoManager = false; loadRepositories(); loadOnlineModels()"
      />
    </div>
  </div>

  <!-- Toast Notification -->
  <transition name="toast">
    <div v-if="toast.show" :class="['toast', toast.type]">
      <span class="toast-icon">{{ toast.icon }}</span>
      <span class="toast-message">{{ toast.message }}</span>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import RepositoryManager from './RepositoryManager.vue'

const emit = defineEmits(['close', 'modelDownloaded'])

// Toast notification state
const toast = ref({
  show: false,
  message: '',
  type: 'success',
  icon: ''
})

// Toast notification function
const showToast = (message, type = 'success') => {
  toast.value.message = message
  toast.value.type = type
  toast.value.icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')
  toast.value.show = true
  
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// State
const repositories = ref([])
const onlineModels = ref([])
const localModels = ref([])
const selectedRepo = ref('')
const searchQuery = ref('')
const filterDeviceType = ref('')
const loading = ref(true)
const refreshing = ref(false)
const error = ref(null)
const downloading = ref(null)
const detailsModel = ref(null)
const showRepoManager = ref(false)

// Computed
const filteredModels = computed(() => {
  let filtered = onlineModels.value

  // Filter by repository
  if (selectedRepo.value) {
    filtered = filtered.filter(m => m.repositoryId === selectedRepo.value)
  }

  // Filter by device type
  if (filterDeviceType.value) {
    filtered = filtered.filter(m => m.deviceType === filterDeviceType.value)
  }

  // Search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(m => 
      m.name.toLowerCase().includes(query) ||
      (m.description && m.description.toLowerCase().includes(query)) ||
      (m.manufacturer && m.manufacturer.toLowerCase().includes(query)) ||
      (m.modelNumber && m.modelNumber.toLowerCase().includes(query))
    )
  }

  return filtered
})

// Methods
async function loadRepositories() {
  try {
    const response = await fetch('http://localhost:3001/api/library/repositories')
    if (!response.ok) throw new Error('Failed to load repositories')
    repositories.value = await response.json()
  } catch (err) {
    console.error('Error loading repositories:', err)
  }
}

async function loadOnlineModels() {
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch('http://localhost:3001/api/library/online')
    if (!response.ok) throw new Error('Failed to load online models')
    onlineModels.value = await response.json()
  } catch (err) {
    console.error('Error loading online models:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadLocalModels() {
  try {
    const response = await fetch('http://localhost:3001/api/library/models')
    if (!response.ok) throw new Error('Failed to load local models')
    localModels.value = await response.json()
  } catch (err) {
    console.error('Error loading local models:', err)
  }
}

async function refreshRepositories() {
  refreshing.value = true
  
  try {
    const response = await fetch('http://localhost:3001/api/library/repositories/refresh-all', {
      method: 'POST'
    })
    if (!response.ok) throw new Error('Failed to refresh repositories')
    await loadOnlineModels()
  } catch (err) {
    console.error('Error refreshing repositories:', err)
    showToast('Failed to refresh repositories: ' + err.message, 'error')
  } finally {
    refreshing.value = false
  }
}

async function downloadModel(model) {
  if (downloading.value || isDownloaded(model)) return
  
  downloading.value = model.id
  
  try {
    const response = await fetch(
      `http://localhost:3001/api/library/online/${model.repositoryId}/${model.id}/download`,
      { method: 'POST' }
    )
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to download model')
    }
    
    const result = await response.json()
    
    // Reload local models to update downloaded status
    await loadLocalModels()
    
    // Emit event
    emit('modelDownloaded', result.model)
    
    showToast(`Successfully downloaded ${model.name}!`, 'success')
  } catch (err) {
    console.error('Error downloading model:', err)
    showToast('Failed to download model: ' + err.message, 'error')
  } finally {
    downloading.value = null
  }
}

function showModelDetails(model) {
  detailsModel.value = model
}

function isDownloaded(model) {
  return localModels.value.some(m => 
    m.name === model.name && 
    m.manufacturer === model.manufacturer && 
    m.modelNumber === model.modelNumber
  )
}

function formatDeviceType(type) {
  if (!type) return 'N/A'
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  })
}

function formatSize(bytes) {
  if (!bytes) return 'N/A'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Lifecycle
onMounted(async () => {
  await loadRepositories()
  await loadLocalModels()
  await loadOnlineModels()
})
</script>

<style scoped>
.online-library-browser {
  max-width: 1400px;
  width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

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
  padding: 2rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e1e8ed;
  background: #f8f9fa;
}

.modal-header h2 {
  margin: 0;
  color: #2c3e50;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-close:hover {
  background: #e1e8ed;
}

.browser-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e1e8ed;
  background: white;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  min-width: 300px;
}

.toolbar-right {
  display: flex;
  gap: 0.75rem;
}

.repo-selector,
.filter-select {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  color: #2c3e50;
  font-size: 0.9rem;
  cursor: pointer;
}

.search-input {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  color: #2c3e50;
  font-size: 0.9rem;
}

.search-input::placeholder {
  color: #95a5a6;
}

.btn-icon-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-icon-text:hover:not(:disabled) {
  background: #f8f9fa;
  border-color: #3498db;
}

.btn-icon-text:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-primary {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-primary:disabled {
  background: #95a5a6;
  cursor: not-allowed;
}

.btn-secondary {
  background: white;
  color: #3498db;
  border: 1px solid #3498db;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #3498db;
  color: white;
}

/* Models Grid */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;
  overflow-y: auto;
  max-height: calc(90vh - 200px);
}

.model-card {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.model-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.model-card.already-downloaded {
  background: #f0f9ff;
  border-color: #3498db;
}

.model-card-header {
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.model-header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.model-header-title h3 {
  margin: 0;
  font-size: 1.1rem;
}

.downloaded-badge {
  font-size: 1.2rem;
}

.model-repository-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.model-card-body {
  padding: 1rem;
}

.model-description {
  color: #555;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  line-height: 1.4;
  min-height: 2.8rem;
}

.model-specs {
  margin-bottom: 1rem;
}

.spec-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 0.85rem;
}

.spec-label {
  color: #7f8c8d;
  font-weight: 600;
}

.spec-value {
  color: #2c3e50;
}

.model-properties {
  margin-bottom: 1rem;
}

.property-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.property-item {
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 0.85rem;
}

.property-label {
  color: #7f8c8d;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

.property-value {
  color: #2c3e50;
  font-weight: 600;
}

.model-metadata {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
}

.metadata-label {
  color: #7f8c8d;
  font-size: 0.7rem;
  margin-bottom: 0.25rem;
}

.metadata-value {
  color: #2c3e50;
  font-weight: 600;
}

.model-footer {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.btn-download,
.btn-details {
  flex: 1;
  padding: 0.75rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-download {
  flex: 2;
}

/* States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.error-icon,
.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.loading-state p,
.error-state p,
.empty-state p {
  color: #7f8c8d;
  margin-bottom: 1rem;
}

/* Details Modal */
.modal-details {
  max-width: 700px;
}

.details-content {
  padding: 1.5rem;
  max-height: 70vh;
  overflow-y: auto;
}

.details-section {
  margin-bottom: 2rem;
}

.details-section h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.details-table {
  width: 100%;
  border-collapse: collapse;
}

.details-table tr {
  border-bottom: 1px solid #e1e8ed;
}

.details-table td {
  padding: 0.75rem 0;
}

.details-table td.label {
  color: #7f8c8d;
  font-weight: 600;
  width: 40%;
}

.repo-url {
  font-family: monospace;
  font-size: 0.85rem;
  color: #7f8c8d;
  word-break: break-all;
}

.details-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid #e1e8ed;
}

/* Responsive */
@media (max-width: 768px) {
  .browser-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-left,
  .toolbar-right {
    flex-direction: column;
    width: 100%;
  }

  .models-grid {
    grid-template-columns: 1fr;
  }

  .property-grid {
    grid-template-columns: 1fr;
  }
}

/* Toast notification styles */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1rem 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 10000;
  min-width: 250px;
  max-width: 400px;
  animation: toast-in 0.3s ease-out;
}

.toast.success {
  border-left: 4px solid #27ae60;
}

.toast.error {
  border-left: 4px solid #e74c3c;
}

.toast.info {
  border-left: 4px solid #3498db;
}

.toast-icon {
  font-size: 1.25rem;
  font-weight: bold;
  flex-shrink: 0;
}

.toast.success .toast-icon {
  color: #27ae60;
}

.toast.error .toast-icon {
  color: #e74c3c;
}

.toast.info .toast-icon {
  color: #3498db;
}

.toast-message {
  flex: 1;
  color: #2c3e50;
  font-size: 0.95rem;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100px);
  }
}

</style>
