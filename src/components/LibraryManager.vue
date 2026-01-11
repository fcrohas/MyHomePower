<template>
  <div class="library-manager">
    <div class="library-header">
      <div class="header-actions">
        <button @click="showAddModal = true" class="btn-primary">
          ➕ Add New Model
        </button>
        <label class="btn-secondary">
          📥 Import Model
          <input 
            type="file" 
            accept=".json,.zip" 
            @change="handleImport"
            style="display: none"
          />
        </label>
      </div>
    </div>

    <!-- Model Cards Grid -->
    <div class="models-grid" v-if="models.length > 0">
      <div 
        v-for="model in models" 
        :key="model.id"
        class="model-card"
      >
        <div class="model-card-header">
          <div class="model-header-title">
            <h3>{{ model.name }}</h3>
            <span v-if="model.linkedApplianceName" class="imported-badge" title="Imported model with trained files">
              📥
            </span>
          </div>
          <div class="model-actions">
            <button 
              @click="selectModel(model)" 
              class="btn-icon" 
              title="Edit model"
            >
              ✏️
            </button>
            <button 
              @click="exportModelHandler(model.id)" 
              class="btn-icon" 
              title="Export model"
            >
              💾
            </button>
            <button 
              @click="deleteModelHandler(model.id)" 
              class="btn-icon btn-danger" 
              title="Delete model"
            >
              🗑️
            </button>
          </div>
        </div>

        <div class="model-card-body">
          <p class="model-description">{{ model.description || 'No description' }}</p>
          
          <div class="model-specs">
            <h4>Technical Specifications</h4>
            <div class="spec-item">
              <span class="spec-label">Device Type:</span>
              <span class="spec-value">{{ model.deviceType || 'N/A' }}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Manufacturer:</span>
              <span class="spec-value">{{ model.manufacturer || 'N/A' }}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Model Number:</span>
              <span class="spec-value">{{ model.modelNumber || 'N/A' }}</span>
            </div>
          </div>

          <div class="model-properties">
            <h4>Power Properties</h4>
            <div class="property-grid">
              <div class="property-item">
                <span class="property-label">⚡ Power Min:</span>
                <span class="property-value">{{ model.properties.powerMin }} W</span>
              </div>
              <div class="property-item">
                <span class="property-label">⚡ Power Max:</span>
                <span class="property-value">{{ model.properties.powerMax }} W</span>
              </div>
              <div class="property-item">
                <span class="property-label">🔌 On/Off States:</span>
                <span class="property-value">{{ model.properties.hasOnOff ? 'Yes' : 'No' }}</span>
              </div>
              <div class="property-item">
                <span class="property-label">📊 Annual Power:</span>
                <span class="property-value">{{ formatPower(model.properties.annualPowerWh) }}</span>
              </div>
            </div>
          </div>

          <div class="model-footer">
            <span class="model-status" :class="model.hasTrainedModel ? 'trained' : 'untrained'">
              {{ model.hasTrainedModel ? '✅ Trained Model' : '⏳ No Trained Model' }}
            </span>
            <span class="model-date">Created: {{ formatDate(model.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="empty-icon">📚</div>
      <h3>No Models Yet</h3>
      <p>Add your first appliance model to get started</p>
      <button @click="showAddModal = true" class="btn-primary">
        ➕ Add Your First Model
      </button>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ editingModel ? 'Edit Model' : 'Add New Model' }}</h2>
          <button @click="closeModal" class="btn-close">✕</button>
        </div>

        <form @submit.prevent="saveModel" class="modal-form">
          <div class="form-section">
            <h3>Basic Information</h3>
            
            <div class="form-group">
              <label for="name">Model Name *</label>
              <input 
                id="name"
                v-model="formData.name" 
                type="text" 
                placeholder="e.g., Washing Machine - Samsung WF45"
                required
              />
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea 
                id="description"
                v-model="formData.description" 
                rows="3"
                placeholder="Describe this appliance and its typical usage patterns..."
              ></textarea>
            </div>
          </div>

          <div class="form-section">
            <h3>Technical Specifications</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label for="deviceType">Device Type</label>
                <select id="deviceType" v-model="formData.deviceType">
                  <option value="">Select type...</option>
                  <option value="washing_machine">Washing Machine</option>
                  <option value="dishwasher">Dishwasher</option>
                  <option value="refrigerator">Refrigerator</option>
                  <option value="dryer">Dryer</option>
                  <option value="oven">Oven</option>
                  <option value="microwave">Microwave</option>
                  <option value="air_conditioner">Air Conditioner</option>
                  <option value="water_heater">Water Heater</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div class="form-group">
                <label for="manufacturer">Manufacturer</label>
                <input 
                  id="manufacturer"
                  v-model="formData.manufacturer" 
                  type="text" 
                  placeholder="e.g., Samsung"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="modelNumber">Model Number</label>
              <input 
                id="modelNumber"
                v-model="formData.modelNumber" 
                type="text" 
                placeholder="e.g., WF45R6100AW"
              />
            </div>
          </div>

          <div class="form-section">
            <h3>Power Properties</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label for="powerMin">Minimum Power (W) *</label>
                <input 
                  id="powerMin"
                  v-model.number="formData.properties.powerMin" 
                  type="number" 
                  min="0"
                  step="1"
                  placeholder="0"
                  required
                />
              </div>

              <div class="form-group">
                <label for="powerMax">Maximum Power (W) *</label>
                <input 
                  id="powerMax"
                  v-model.number="formData.properties.powerMax" 
                  type="number" 
                  min="0"
                  step="1"
                  placeholder="2000"
                  required
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="annualPowerWh">Annual Power Consumption (Wh)</label>
                <input 
                  id="annualPowerWh"
                  v-model.number="formData.properties.annualPowerWh" 
                  type="number" 
                  min="0"
                  step="100"
                  placeholder="500000"
                />
                <small v-if="formData.properties.annualPowerWh">
                  ≈ {{ (formData.properties.annualPowerWh / 1000).toFixed(2) }} kWh/year
                </small>
              </div>

              <div class="form-group">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="formData.properties.hasOnOff"
                  />
                  <span>Has On/Off States</span>
                </label>
                <small>Check if this appliance has distinct on/off power states</small>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn-primary">
              {{ editingModel ? 'Update Model' : 'Create Model' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Import Progress Overlay -->
    <div v-if="importing" class="import-overlay">
      <div class="import-progress">
        <div class="spinner"></div>
        <h3>Importing Model</h3>
        <p>{{ importProgress }}</p>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: importProgressPercent + '%' }"></div>
        </div>
        <div class="progress-percent">{{ importProgressPercent }}%</div>
      </div>
    </div>

    <!-- Toast Notification -->
    <transition name="toast">
      <div v-if="toast.show" :class="['toast', toast.type]">
        <span class="toast-icon">{{ toast.icon }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { format } from 'date-fns'
import { 
  getModels, 
  createModel, 
  updateModel, 
  deleteModel, 
  exportModel, 
  importModel 
} from '../services/library'

// Props
const props = defineProps({
  preFillData: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['data-used'])

// State
const models = ref([])
const showAddModal = ref(false)
const editingModel = ref(null)
const formData = ref(getEmptyFormData())
const mlModelData = ref(null) // Store ML model data for export
const importing = ref(false)
const importProgress = ref('')
const importProgressPercent = ref(0)

// Watch for pre-fill data from ML Trainer
watch(() => props.preFillData, (newData) => {
  if (newData) {
    console.log('Received pre-fill data:', newData)
    mlModelData.value = newData // Store for later export
    formData.value = {
      name: newData.name || newData.appliance,
      description: `Trained model for ${newData.appliance}`,
      deviceType: newData.appliance,
      manufacturer: '',
      modelNumber: '',
      properties: {
        powerMin: 0,
        powerMax: 0,
        hasOnOff: true,
        annualPowerWh: 0
      }
    }
    editingModel.value = null
    showAddModal.value = true
    emit('data-used') // Notify parent that data was consumed
  }
}, { immediate: true })

// Toast notification
const toast = ref({
  show: false,
  message: '',
  type: 'success',
  icon: ''
})

// Initialize empty form data
function getEmptyFormData() {
  return {
    name: '',
    description: '',
    deviceType: '',
    manufacturer: '',
    modelNumber: '',
    properties: {
      powerMin: 0,
      powerMax: 0,
      hasOnOff: true,
      annualPowerWh: 0
    }
  }
}

// Load models on mount
onMounted(async () => {
  await loadModels()
})

// Load all models
async function loadModels() {
  try {
    models.value = await getModels()
  } catch (error) {
    showToast('Failed to load models: ' + error.message, 'error')
  }
}

// Select model for editing
function selectModel(model) {
  editingModel.value = model
  formData.value = {
    name: model.name,
    description: model.description || '',
    deviceType: model.deviceType || '',
    manufacturer: model.manufacturer || '',
    modelNumber: model.modelNumber || '',
    properties: {
      powerMin: model.properties.powerMin,
      powerMax: model.properties.powerMax,
      hasOnOff: model.properties.hasOnOff,
      annualPowerWh: model.properties.annualPowerWh || 0
    }
  }
  showAddModal.value = true
}

// Save model (create or update)
async function saveModel() {
  try {
    if (editingModel.value) {
      await updateModel(editingModel.value.id, formData.value)
      showToast('Model updated successfully!', 'success')
    } else {
      const createdModel = await createModel(formData.value)
      showToast('Model created successfully!', 'success')
      
      // If this came from ML Trainer, create ZIP export
      if (mlModelData.value) {
        try {
          await createModelExport(mlModelData.value.appliance, createdModel)
          showToast('Model exported to library folder!', 'success')
        } catch (exportError) {
          console.error('Export error:', exportError)
          showToast('Model saved but export failed: ' + exportError.message, 'warning')
        }
        mlModelData.value = null // Clear after use
      }
    }
    
    await loadModels()
    closeModal()
  } catch (error) {
    showToast(error.message, 'error')
  }
}

// Create model export with ZIP
async function createModelExport(appliance, libraryModel) {
  const response = await fetch('/api/library/export-model', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      appliance,
      libraryModelId: libraryModel.id,
      libraryData: libraryModel
    })
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to create export')
  }
  
  const result = await response.json()
  console.log('Export created:', result.exportPath)
}

// Delete model
async function deleteModelHandler(modelId) {
  if (!confirm('Are you sure you want to delete this model?')) {
    return
  }

  try {
    await deleteModel(modelId)
    showToast('Model deleted successfully!', 'success')
    await loadModels()
  } catch (error) {
    showToast('Failed to delete model: ' + error.message, 'error')
  }
}

// Export model
async function exportModelHandler(modelId) {
  try {
    await exportModel(modelId)
    showToast('Model exported successfully!', 'success')
  } catch (error) {
    showToast('Failed to export model: ' + error.message, 'error')
  }
}

// Import model
async function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return

  importing.value = true
  importProgressPercent.value = 0
  const isZip = file.name.endsWith('.zip')
  
  try {
    // Step 1: Start upload
    importProgress.value = isZip ? 'Uploading ZIP file...' : 'Uploading model...'
    importProgressPercent.value = 10
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Step 2: Upload in progress
    importProgressPercent.value = 30
    const result = await importModel(file)
    importProgressPercent.value = 50
    
    if (isZip && result.hasModelFiles) {
      // Step 3: Extract files
      importProgress.value = 'Extracting model files...'
      importProgressPercent.value = 60
      await new Promise(resolve => setTimeout(resolve, 300))
      
      importProgress.value = 'Installing model files...'
      importProgressPercent.value = 75
      await new Promise(resolve => setTimeout(resolve, 300))
    } else {
      importProgressPercent.value = 70
    }
    
    // Step 4: Load models
    importProgress.value = 'Loading models...'
    importProgressPercent.value = 85
    await loadModels()
    
    // Step 5: Complete
    importProgress.value = 'Import complete!'
    importProgressPercent.value = 100
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const message = isZip && result.hasModelFiles 
      ? 'Model imported with trained files! Ready for predictions.' 
      : 'Model metadata imported successfully!'
    
    showToast(message, 'success')
    
    // Emit event to notify parent that a model was imported
    emit('model-imported', { hasModelFiles: isZip && result.hasModelFiles })
  } catch (error) {
    showToast('Failed to import model: ' + error.message, 'error')
  } finally {
    importing.value = false
    importProgress.value = ''
    importProgressPercent.value = 0
    // Reset file input
    event.target.value = ''
  }
}

// Close modal
function closeModal() {
  showAddModal.value = false
  editingModel.value = null
  mlModelData.value = null
  formData.value = getEmptyFormData()
}

// Show toast notification
function showToast(message, type = 'success') {
  toast.value = {
    show: true,
    message,
    type,
    icon: type === 'success' ? '✅' : '❌'
  }

  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// Format power value
function formatPower(wh) {
  if (!wh) return '0 Wh'
  if (wh >= 1000000) {
    return `${(wh / 1000000).toFixed(2)} MWh`
  }
  if (wh >= 1000) {
    return `${(wh / 1000).toFixed(2)} kWh`
  }
  return `${wh.toFixed(0)} Wh`
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return format(new Date(dateString), 'MMM d, yyyy')
}
</script>

<style scoped>
.library-manager {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.library-header {
  margin-bottom: 2rem;
}

.library-header h2 {
  font-size: 2rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #7f8c8d;
  margin-bottom: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.btn-primary {
  background: #42b983;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #35966d;
}

.btn-secondary {
  background: white;
  color: #42b983;
  border: 2px solid #42b983;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f0f8f5;
}

/* Model Cards Grid */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.model-card {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.model-card:hover {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.model-card-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.model-header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.model-card-header h3 {
  font-size: 1.25rem;
  margin: 0;
  font-weight: 600;
}

.imported-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
  backdrop-filter: blur(10px);
}

.model-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-danger:hover {
  background: rgba(231, 76, 60, 0.8);
}

.model-card-body {
  padding: 1.25rem;
}

.model-description {
  color: #555;
  margin-bottom: 1rem;
  line-height: 1.5;
  min-height: 3rem;
}

.model-specs,
.model-properties {
  margin-bottom: 1rem;
}

.model-specs h4,
.model-properties h4 {
  font-size: 0.9rem;
  color: #42b983;
  margin-bottom: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.spec-item {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0;
  border-bottom: 1px solid #f0f0f0;
}

.spec-label {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.spec-value {
  color: #2c3e50;
  font-weight: 500;
}

.property-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.property-item {
  background: #f8f9fa;
  padding: 0.75rem;
  border-radius: 6px;
}

.property-label {
  display: block;
  font-size: 0.8rem;
  color: #7f8c8d;
  margin-bottom: 0.25rem;
}

.property-value {
  display: block;
  font-size: 1rem;
  color: #2c3e50;
  font-weight: 600;
}

.model-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e1e8ed;
}

.model-status {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.model-status.trained {
  background: #d4edda;
  color: #155724;
}

.model-status.untrained {
  background: #fff3cd;
  color: #856404;
}

.model-date {
  color: #95a5a6;
  font-size: 0.85rem;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: #7f8c8d;
  margin-bottom: 1.5rem;
}

/* Modal */
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
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e1e8ed;
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
  background: #f0f0f0;
}

.modal-form {
  padding: 1.5rem;
}

.form-section {
  margin-bottom: 2rem;
}

.form-section h3 {
  font-size: 1.1rem;
  color: #42b983;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #42b983;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #2c3e50;
  font-weight: 600;
  font-size: 0.9rem;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  transition: border 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #42b983;
}

.form-group textarea {
  resize: vertical;
  font-family: inherit;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #7f8c8d;
  font-size: 0.85rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e1e8ed;
}

/* Toast Notification */
.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  background: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 2000;
  max-width: 400px;
}

.toast.success {
  border-left: 4px solid #42b983;
}

.toast.error {
  border-left: 4px solid #e74c3c;
}

.toast-icon {
  font-size: 1.25rem;
}

.toast-message {
  color: #2c3e50;
  font-weight: 500;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* Import Progress Overlay */
.import-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.3s;
}

.import-progress {
  background: white;
  padding: 3rem;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  text-align: center;
  min-width: 300px;
}

.import-progress h3 {
  margin: 1rem 0 0.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.import-progress p {
  color: #666;
  font-size: 1rem;
  margin: 0.5rem 0 1rem 0;
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin: 1rem 0 0.5rem 0;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #42b983 0%, #35a372 100%);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.progress-percent {
  color: #42b983;
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 0.5rem;
}

.spinner {
  width: 50px;
  height: 50px;
  margin: 0 auto;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #42b983;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Responsive */
@media (max-width: 768px) {
  .library-manager {
    padding: 1rem;
  }

  .models-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .modal-overlay {
    padding: 1rem;
  }

  .property-grid {
    grid-template-columns: 1fr;
  }
}
</style>
