<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content share-wizard">
      <div class="modal-header">
        <h2>📤 Share Model to Repository</h2>
        <button @click="$emit('close')" class="btn-close">✕</button>
      </div>

      <div class="wizard-content">
        <!-- Steps Indicator -->
        <div class="steps-indicator">
          <div 
            v-for="(step, index) in steps" 
            :key="index"
            class="step-item"
            :class="{ 
              'active': currentStep === index + 1,
              'completed': currentStep > index + 1
            }"
          >
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-label">{{ step }}</div>
          </div>
        </div>

        <!-- Step 1: Select Model -->
        <div v-if="currentStep === 1" class="step-content">
          <h3>Select Model to Share</h3>
          <p class="step-description">
            Choose a model from your local library that you want to share with the community.
          </p>

          <div v-if="models.length === 0" class="empty-state">
            <p>No models available in your library</p>
            <button @click="$emit('close')" class="btn-secondary">
              Close
            </button>
          </div>

          <div v-else class="model-selector">
            <div 
              v-for="model in models" 
              :key="model.id"
              class="model-option"
              :class="{ 'selected': selectedModel?.id === model.id }"
              @click="selectedModel = model"
            >
              <div class="model-option-header">
                <h4>{{ model.name }}</h4>
                <span v-if="model.hasTrainedModel" class="badge trained">
                  ✅ Trained
                </span>
                <span v-else class="badge untrained">
                  ⏳ Metadata Only
                </span>
              </div>
              <p class="model-option-desc">{{ model.description || 'No description' }}</p>
              <div class="model-option-info">
                <span>{{ formatDeviceType(model.deviceType) }}</span>
                <span>•</span>
                <span>{{ model.manufacturer }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 2: Edit Metadata -->
        <div v-if="currentStep === 2" class="step-content">
          <h3>Review & Edit Metadata</h3>
          <p class="step-description">
            Ensure your model information is accurate and complete before sharing.
          </p>

          <form class="metadata-form">
            <div class="form-group">
              <label>Model Name *</label>
              <input 
                v-model="shareData.name" 
                type="text" 
                required
                placeholder="e.g., Samsung WF45 Washing Machine"
              />
            </div>

            <div class="form-group">
              <label>Description *</label>
              <textarea 
                v-model="shareData.description" 
                rows="3"
                required
                placeholder="Describe the model, usage patterns, and any special characteristics..."
              ></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Author Name *</label>
                <input 
                  v-model="shareData.author" 
                  type="text" 
                  required
                  placeholder="Your name or username"
                />
              </div>

              <div class="form-group">
                <label>Version</label>
                <input 
                  v-model="shareData.version" 
                  type="text" 
                  placeholder="e.g., 1.0.0"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Device Type</label>
                <select v-model="shareData.deviceType">
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

              <div class="form-group">
                <label>Manufacturer</label>
                <input 
                  v-model="shareData.manufacturer" 
                  type="text" 
                  placeholder="e.g., Samsung"
                />
              </div>
            </div>

            <div class="form-group">
              <label>Model Number</label>
              <input 
                v-model="shareData.modelNumber" 
                type="text" 
                placeholder="e.g., WF45T6000AW"
              />
            </div>
          </form>
        </div>

        <!-- Step 3: Set Visibility -->
        <div v-if="currentStep === 3" class="step-content">
          <h3>Set Visibility</h3>
          <p class="step-description">
            Choose who can see and download your model from the repository.
          </p>

          <div class="visibility-options">
            <div 
              class="visibility-option"
              :class="{ 'selected': shareData.visibility === 'public' }"
              @click="shareData.visibility = 'public'"
            >
              <div class="visibility-icon">🌐</div>
              <h4>Public</h4>
              <p>Anyone can browse, download, and use this model</p>
              <div class="visibility-badge">Recommended</div>
            </div>

            <div 
              class="visibility-option"
              :class="{ 'selected': shareData.visibility === 'private' }"
              @click="shareData.visibility = 'private'"
            >
              <div class="visibility-icon">🔒</div>
              <h4>Private</h4>
              <p>Only you and people you explicitly share with can access</p>
            </div>
          </div>

          <div class="info-box">
            <strong>ℹ️ Note:</strong> Public models help build the community library and allow others 
            to benefit from your work. You'll be credited as the author.
          </div>
        </div>

        <!-- Step 4: Export & Instructions -->
        <div v-if="currentStep === 4" class="step-content">
          <h3>Export & Share Instructions</h3>
          
          <div v-if="!exported" class="export-section">
            <p class="step-description">
              Click the button below to export your model in the repository format.
            </p>
            
            <button 
              @click="exportModel" 
              class="btn-primary btn-large"
              :disabled="exporting"
            >
              <span v-if="exporting">⏳ Exporting...</span>
              <span v-else>📦 Export Model Files</span>
            </button>
          </div>

          <div v-else class="instructions-section">
            <div class="success-message">
              <div class="success-icon">✅</div>
              <h4>Model Exported Successfully!</h4>
              <p>Your model has been packaged and is ready to share.</p>
            </div>

            <div class="instructions">
              <h4>📋 How to Share Your Model</h4>
              
              <div class="instruction-step">
                <div class="instruction-number">1</div>
                <div class="instruction-content">
                  <h5>Fork the Official Repository</h5>
                  <p>Go to the official repository and create your own fork:</p>
                  <div class="code-block">
                    <a href="https://github.com/fcrohas/MyHomePower-Models" target="_blank">
                      https://github.com/fcrohas/MyHomePower-Models
                    </a>
                  </div>
                  <button @click="openGitHub" class="btn-secondary btn-small">
                    🔗 Open GitHub
                  </button>
                </div>
              </div>

              <div class="instruction-step">
                <div class="instruction-number">2</div>
                <div class="instruction-content">
                  <h5>Clone Your Fork</h5>
                  <p>Clone your forked repository to your local machine:</p>
                  <div class="code-block">
                    <code>git clone https://github.com/YOUR_USERNAME/MyHomePower-Models.git</code>
                    <button @click="copyToClipboard('git clone https://github.com/YOUR_USERNAME/MyHomePower-Models.git')" class="btn-copy">
                      📋
                    </button>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="instruction-number">3</div>
                <div class="instruction-content">
                  <h5>Extract & Place Files</h5>
                  <p>Extract the downloaded ZIP file into the appropriate directory:</p>
                  <div class="code-block">
                    <code>models/{{ shareData.deviceType }}/{{ sanitizeName(shareData.name) }}/</code>
                  </div>
                  <p class="small-note">
                    The ZIP contains: metadata.json, model files (if available), and index-entry.json
                  </p>
                </div>
              </div>

              <div class="instruction-step">
                <div class="instruction-number">4</div>
                <div class="instruction-content">
                  <h5>Update index.json</h5>
                  <p>Add the contents of <code>index-entry.json</code> to the repository's <code>index.json</code> file in the "models" array.</p>
                </div>
              </div>

              <div class="instruction-step">
                <div class="instruction-number">5</div>
                <div class="instruction-content">
                  <h5>Commit & Push</h5>
                  <p>Commit your changes and push to your fork:</p>
                  <div class="code-block">
                    <code>git add .</code><br>
                    <code>git commit -m "Add {{ shareData.name }} model"</code><br>
                    <code>git push origin main</code>
                    <button @click="copyToClipboard(`git add .\ngit commit -m 'Add model'\ngit push origin main`)" class="btn-copy">
                      📋
                    </button>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="instruction-number">6</div>
                <div class="instruction-content">
                  <h5>Create Pull Request</h5>
                  <p>Go to GitHub and create a Pull Request from your fork to the official repository.</p>
                  <p class="small-note">
                    Your model will be reviewed and merged into the official library!
                  </p>
                </div>
              </div>
            </div>

            <div class="info-box">
              <strong>💡 Need Help?</strong> Check the 
              <a href="https://github.com/fcrohas/MyHomePower-Models#contributing" target="_blank">
                Contributing Guide
              </a> 
              for detailed instructions with screenshots.
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <div class="wizard-footer">
          <button 
            v-if="currentStep > 1" 
            @click="previousStep" 
            class="btn-secondary"
          >
            ← Back
          </button>

          <div class="spacer"></div>

          <button 
            v-if="currentStep < 4"
            @click="nextStep" 
            class="btn-primary"
            :disabled="!canProceed"
          >
            Next →
          </button>

          <button 
            v-if="currentStep === 4 && exported"
            @click="$emit('close')" 
            class="btn-primary"
          >
            ✅ Done
          </button>
        </div>
      </div>
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

const emit = defineEmits(['close'])

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
const models = ref([])
const selectedModel = ref(null)
const currentStep = ref(1)
const exporting = ref(false)
const exported = ref(false)

const steps = ['Select Model', 'Edit Metadata', 'Set Visibility', 'Export & Share']

const shareData = ref({
  name: '',
  description: '',
  author: '',
  version: '1.0.0',
  deviceType: '',
  manufacturer: '',
  modelNumber: '',
  visibility: 'public'
})

// Computed
const canProceed = computed(() => {
  if (currentStep.value === 1) {
    return selectedModel.value !== null
  }
  if (currentStep.value === 2) {
    return shareData.value.name && 
           shareData.value.description && 
           shareData.value.author
  }
  if (currentStep.value === 3) {
    return shareData.value.visibility !== ''
  }
  return true
})

// Methods
async function loadModels() {
  try {
    const response = await fetch('http://localhost:3001/api/library/models')
    if (!response.ok) throw new Error('Failed to load models')
    models.value = await response.json()
  } catch (err) {
    console.error('Error loading models:', err)
    showToast('Failed to load models: ' + err.message, 'error')
  }
}

function nextStep() {
  if (!canProceed.value) return
  
  // When moving from step 1 to 2, populate form with model data
  if (currentStep.value === 1 && selectedModel.value) {
    shareData.value = {
      name: selectedModel.value.name,
      description: selectedModel.value.description || '',
      author: shareData.value.author || '', // Keep author if already set
      version: '1.0.0',
      deviceType: selectedModel.value.deviceType || 'other',
      manufacturer: selectedModel.value.manufacturer || '',
      modelNumber: selectedModel.value.modelNumber || '',
      visibility: 'public'
    }
  }
  
  currentStep.value++
}

function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

async function exportModel() {
  if (!selectedModel.value) return
  
  exporting.value = true
  
  try {
    console.log('🔄 Exporting model:', selectedModel.value)
    console.log('Request URL:', `http://localhost:3001/api/library/export-for-git/${selectedModel.value.id}`)
    
    const response = await fetch(
      `http://localhost:3001/api/library/export-for-git/${selectedModel.value.id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: shareData.value.author,
          version: shareData.value.version,
          visibility: shareData.value.visibility
        })
      }
    )
    
    console.log('Response status:', response.status)
    console.log('Response headers:', response.headers)
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type')
      let errorMessage = 'Failed to export model'
      
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json()
        errorMessage = error.message || error.error || errorMessage
        console.error('Error response:', error)
      } else {
        const text = await response.text()
        errorMessage = text || errorMessage
        console.error('Error response (text):', text)
      }
      
      throw new Error(errorMessage)
    }
    
    console.log('✅ Response OK, downloading blob...')
    
    // Download the file
    const blob = await response.blob()
    console.log('Blob size:', blob.size, 'bytes')
    
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeName(shareData.value.name)}_git_export.zip`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    
    console.log('✅ Export complete!')
    exported.value = true
  } catch (err) {
    console.error('Error exporting model:', err)
    console.error('Error stack:', err.stack)
    showToast('Failed to export model: ' + err.message, 'error')
  } finally {
    exporting.value = false
  }
}

function openGitHub() {
  window.open('https://github.com/fcrohas/MyHomePower-Models', '_blank')
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success')
  }).catch(err => {
    console.error('Failed to copy:', err)
    showToast('Failed to copy to clipboard', 'error')
  })
}

function sanitizeName(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
}

function formatDeviceType(type) {
  if (!type) return 'N/A'
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

// Lifecycle
onMounted(() => {
  loadModels()
})
</script>

<style scoped>
.share-wizard {
  max-width: 900px;
  width: 90vw;
  max-height: 90vh;
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
  display: flex;
  flex-direction: column;
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

.wizard-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

/* Steps Indicator */
.steps-indicator {
  display: flex;
  justify-content: space-between;
  padding: 2rem;
  border-bottom: 1px solid #e1e8ed;
  background: white;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
  opacity: 0.5;
}

.step-item.active,
.step-item.completed {
  opacity: 1;
}

.step-item:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 1.25rem;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e1e8ed;
  z-index: 0;
}

.step-item.completed:not(:last-child)::after {
  background: #3498db;
}

.step-number {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: #e1e8ed;
  color: #7f8c8d;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  z-index: 1;
  margin-bottom: 0.5rem;
}

.step-item.active .step-number {
  background: #3498db;
  color: white;
}

.step-item.completed .step-number {
  background: #27ae60;
  color: white;
}

.step-label {
  font-size: 0.85rem;
  color: #2c3e50;
  text-align: center;
  font-weight: 600;
}

/* Step Content */
.step-content {
  padding: 2rem;
  overflow-y: auto;
  flex: 1;
}

.step-content h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.step-description {
  color: #7f8c8d;
  margin-bottom: 1.5rem;
}

/* Model Selector */
.model-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.model-option {
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.model-option:hover {
  border-color: #3498db;
  background: #f8f9fa;
}

.model-option.selected {
  border-color: #3498db;
  background: #e7f3ff;
}

.model-option-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.model-option-header h4 {
  margin: 0;
  flex: 1;
  color: #2c3e50;
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge.trained {
  background: #d4edda;
  color: #155724;
}

.badge.untrained {
  background: #fff3cd;
  color: #856404;
}

.model-option-desc {
  color: #555;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.model-option-info {
  display: flex;
  gap: 0.5rem;
  color: #7f8c8d;
  font-size: 0.85rem;
}

/* Metadata Form */
.metadata-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  color: #2c3e50;
  font-size: 0.9rem;
  font-family: inherit;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: #95a5a6;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #3498db;
}

/* Visibility Options */
.visibility-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.visibility-option {
  border: 2px solid #e1e8ed;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.visibility-option:hover {
  border-color: #3498db;
  background: #f8f9fa;
}

.visibility-option.selected {
  border-color: #3498db;
  background: #e7f3ff;
}

.visibility-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.visibility-option h4 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.visibility-option p {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin: 0;
}

.visibility-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: #27ae60;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* Export Section */
.export-section {
  text-align: center;
  padding: 2rem;
}

.btn-large {
  font-size: 1.1rem;
  padding: 1rem 2rem;
}

/* Instructions */
.success-message {
  text-align: center;
  padding: 2rem;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.success-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.success-message h4 {
  color: #155724;
  margin: 0 0 0.5rem 0;
}

.success-message p {
  color: #155724;
  margin: 0;
}

.instructions h4 {
  color: #2c3e50;
  margin-bottom: 1.5rem;
}

.instruction-step {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.instruction-number {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: #3498db;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.instruction-content {
  flex: 1;
}

.instruction-content h5 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.instruction-content p {
  color: #555;
  margin-bottom: 0.75rem;
}

.code-block {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  padding: 1rem;
  font-family: monospace;
  font-size: 0.9rem;
  margin: 0.5rem 0;
  position: relative;
  word-break: break-all;
}

.btn-copy {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-copy:hover {
  background: #e1e8ed;
}

.btn-small {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.small-note {
  font-size: 0.85rem;
  color: #7f8c8d;
  font-style: italic;
}

/* Info Box */
.info-box {
  background: #e7f3ff;
  border: 1px solid #b3d9ff;
  border-radius: 8px;
  padding: 1rem;
  color: #555;
  line-height: 1.6;
}

.info-box a {
  color: #3498db;
  text-decoration: none;
  font-weight: 600;
}

.info-box a:hover {
  text-decoration: underline;
}

/* Wizard Footer */
.wizard-footer {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #e1e8ed;
  background: #f8f9fa;
}

.spacer {
  flex: 1;
}

.btn-primary {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
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
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #3498db;
  color: white;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #7f8c8d;
}

/* Responsive */
@media (max-width: 768px) {
  .steps-indicator {
    padding: 1rem;
  }

  .step-label {
    font-size: 0.7rem;
  }

  .step-number {
    width: 2rem;
    height: 2rem;
    font-size: 0.9rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .visibility-options {
    grid-template-columns: 1fr;
  }

  .instruction-step {
    flex-direction: column;
  }
}

/* Toast Notification Styles */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
  z-index: 9999;
  min-width: 300px;
  max-width: 500px;
}

.toast.success {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.toast.error {
  background: #dc3545;
  color: white;
}

.toast.info {
  background: #17a2b8;
  color: white;
}

.toast-icon {
  font-size: 1.5rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

.toast-message {
  flex: 1;
}

.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.3s ease-in;
}

@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
