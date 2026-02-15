<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content repository-manager">
      <div class="modal-header">
        <h2>⚙️ Manage Repositories</h2>
        <button @click="$emit('close')" class="btn-close">✕</button>
      </div>

      <div class="repo-content">
        <!-- Repository List -->
        <div class="repo-list">
          <div class="list-header">
            <h3>Configured Repositories</h3>
            <button @click="showAddForm = true" class="btn-primary">
              ➕ Add Repository
            </button>
          </div>

          <div v-if="repositories.length === 0" class="empty-state">
            <p>No repositories configured</p>
          </div>

          <div v-else class="repo-items">
            <div 
              v-for="repo in repositories" 
              :key="repo.id"
              class="repo-item"
              :class="{ 'disabled': !repo.enabled }"
            >
              <div class="repo-item-header">
                <div class="repo-info">
                  <div class="repo-name">
                    <span class="repo-type-badge" :class="repo.type">
                      {{ repo.type === 'official' ? '⭐' : '📦' }}
                    </span>
                    <h4>{{ repo.name }}</h4>
                  </div>
                  <div class="repo-url">{{ repo.url }}</div>
                </div>
                
                <div class="repo-actions">
                  <label class="toggle-switch">
                    <input 
                      type="checkbox" 
                      v-model="repo.enabled"
                      @change="toggleRepository(repo)"
                    />
                    <span class="slider"></span>
                  </label>
                  
                  <button 
                    @click="refreshRepository(repo.id)" 
                    class="btn-icon"
                    :disabled="refreshing === repo.id"
                    title="Refresh repository"
                  >
                    <span :class="{ 'spinning': refreshing === repo.id }">🔄</span>
                  </button>
                  
                  <button 
                    v-if="repo.type !== 'official'"
                    @click="deleteRepository(repo.id)" 
                    class="btn-icon btn-danger"
                    title="Remove repository"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div class="repo-item-footer">
                <span class="repo-status" :class="repo.enabled ? 'enabled' : 'disabled'">
                  {{ repo.enabled ? '✅ Enabled' : '⏸️ Disabled' }}
                </span>
                <span class="repo-sync" v-if="repo.lastSync">
                  Last synced: {{ formatDate(repo.lastSync) }}
                </span>
                <span class="repo-sync" v-else>
                  Never synced
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Repository Form -->
        <div v-if="showAddForm" class="add-form-section">
          <div class="form-header">
            <h3>Add New Repository</h3>
            <button @click="cancelAddForm" class="btn-close-small">✕</button>
          </div>

          <form @submit.prevent="addRepository" class="add-form">
            <div class="form-group">
              <label for="repo-name">Repository Name *</label>
              <input 
                id="repo-name"
                v-model="newRepo.name" 
                type="text" 
                placeholder="e.g., Community Models"
                required
              />
            </div>

            <div class="form-group">
              <label for="repo-url">Repository URL *</label>
              <input 
                id="repo-url"
                v-model="newRepo.url" 
                type="url" 
                placeholder="https://raw.githubusercontent.com/username/repo/main"
                required
              />
              <small class="form-help">
                Enter the raw GitHub URL to the repository root (ending with /main or /master)
              </small>
            </div>

            <div class="form-actions">
              <button 
                type="button" 
                @click="testConnection" 
                class="btn-secondary"
                :disabled="testing || !newRepo.url"
              >
                <span v-if="testing">⏳ Testing...</span>
                <span v-else>🔍 Test Connection</span>
              </button>
              
              <div class="form-actions-right">
                <button type="button" @click="cancelAddForm" class="btn-cancel">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  class="btn-primary"
                  :disabled="adding || !newRepo.name || !newRepo.url"
                >
                  <span v-if="adding">⏳ Adding...</span>
                  <span v-else>➕ Add Repository</span>
                </button>
              </div>
            </div>

            <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
              <span v-if="testResult.success">
                ✅ Connection successful! Found {{ testResult.modelCount }} models.
              </span>
              <span v-else>
                ❌ {{ testResult.error }}
              </span>
            </div>
          </form>
        </div>

        <!-- Info Section -->
        <div class="info-section">
          <h3>ℹ️ About Repositories</h3>
          <p>
            Repositories are Git-based collections of power consumption models that you can browse and download.
          </p>
          <ul>
            <li><strong>Official Repository:</strong> Managed by MyHomePower, contains verified models</li>
            <li><strong>Custom Repositories:</strong> Community or personal repositories you can add</li>
            <li><strong>Repository Format:</strong> Must contain an index.json file with model metadata</li>
          </ul>
          <p>
            To create your own repository, fork the 
            <a href="https://github.com/fcrohas/MyHomePower-Models" target="_blank">
              official repository
            </a> 
            and add your models.
          </p>
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
import { ref, onMounted } from 'vue'

const emit = defineEmits(['close', 'model-added'])

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
const showAddForm = ref(false)
const refreshing = ref(null)
const testing = ref(false)
const adding = ref(false)
const testResult = ref(null)
const newRepo = ref({
  name: '',
  url: ''
})

// Methods
async function loadRepositories() {
  try {
    const response = await fetch('http://localhost:3001/api/library/repositories')
    if (!response.ok) throw new Error('Failed to load repositories')
    repositories.value = await response.json()
  } catch (err) {
    console.error('Error loading repositories:', err)
    showToast('Failed to load repositories: ' + err.message, 'error')
  }
}

async function toggleRepository(repo) {
  try {
    const response = await fetch(`http://localhost:3001/api/library/repositories/${repo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: repo.enabled })
    })
    
    if (!response.ok) throw new Error('Failed to update repository')
    
    console.log(`Repository ${repo.name} ${repo.enabled ? 'enabled' : 'disabled'}`)
  } catch (err) {
    console.error('Error updating repository:', err)
    showToast('Failed to update repository: ' + err.message, 'error')
    // Revert the toggle
    repo.enabled = !repo.enabled
  }
}

async function refreshRepository(id) {
  refreshing.value = id
  
  try {
    const response = await fetch(`http://localhost:3001/api/library/repositories/${id}/refresh`, {
      method: 'POST'
    })
    
    if (!response.ok) throw new Error('Failed to refresh repository')
    
    const result = await response.json()
    
    if (result.success) {
      // Update last sync time
      const repo = repositories.value.find(r => r.id === id)
      if (repo) {
        repo.lastSync = new Date().toISOString()
      }
      showToast(`Repository refreshed successfully! Found ${result.modelCount} models.`, 'success')
    } else {
      showToast('Failed to refresh repository: ' + result.error, 'error')
    }
  } catch (err) {
    console.error('Error refreshing repository:', err)
    showToast('Failed to refresh repository: ' + err.message, 'error')
  } finally {
    refreshing.value = null
  }
}

async function deleteRepository(id) {
  const repo = repositories.value.find(r => r.id === id)
  if (!repo) return
  
  if (!confirm(`Are you sure you want to remove "${repo.name}"?`)) {
    return
  }
  
  try {
    const response = await fetch(`http://localhost:3001/api/library/repositories/${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) throw new Error('Failed to delete repository')
    
    // Remove from list
    repositories.value = repositories.value.filter(r => r.id !== id)
    
    showToast('Repository removed successfully', 'success')
  } catch (err) {
    console.error('Error deleting repository:', err)
    showToast('Failed to delete repository: ' + err.message, 'error')
  }
}

async function testConnection() {
  if (!newRepo.value.url) return
  
  testing.value = true
  testResult.value = null
  
  try {
    // Try to fetch index.json
    const indexUrl = `${newRepo.value.url}/index.json`
    const response = await fetch(indexUrl)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Unable to fetch index.json from this URL`)
    }
    
    const data = await response.json()
    
    if (!data.models || !Array.isArray(data.models)) {
      throw new Error('Invalid repository structure: missing models array in index.json')
    }
    
    testResult.value = {
      success: true,
      modelCount: data.models.length
    }
  } catch (err) {
    console.error('Connection test failed:', err)
    testResult.value = {
      success: false,
      error: err.message
    }
  } finally {
    testing.value = false
  }
}

async function addRepository() {
  if (!newRepo.value.name || !newRepo.value.url) return
  
  adding.value = true
  
  try {
    const response = await fetch('http://localhost:3001/api/library/repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRepo.value.name,
        url: newRepo.value.url
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to add repository')
    }
    
    const repo = await response.json()
    
    // Add to list
    repositories.value.push(repo)
    
    // Reset form
    cancelAddForm()
    
    showToast(`Repository "${repo.name}" added successfully!`, 'success')
  } catch (err) {
    console.error('Error adding repository:', err)
    showToast('Failed to add repository: ' + err.message, 'error')
  } finally {
    adding.value = false
  }
}

function cancelAddForm() {
  showAddForm.value = false
  newRepo.value = { name: '', url: '' }
  testResult.value = null
}

function formatDate(dateString) {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`
  
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  })
}

// Lifecycle
onMounted(() => {
  loadRepositories()
})
</script>

<style scoped>
.repository-manager {
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
  z-index: 1001;
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

.repo-content {
  padding: 1.5rem;
  overflow-y: auto;
  max-height: calc(90vh - 100px);
}

/* Repository List */
.repo-list {
  margin-bottom: 2rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.list-header h3 {
  margin: 0;
  color: #2c3e50;
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

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #7f8c8d;
}

.repo-items {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.repo-item {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.2s;
}

.repo-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.repo-item.disabled {
  opacity: 0.6;
  background: #f8f9fa;
}

.repo-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.repo-info {
  flex: 1;
}

.repo-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.repo-name h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 1rem;
}

.repo-type-badge {
  font-size: 1.2rem;
}

.repo-type-badge.official {
  filter: drop-shadow(0 0 2px gold);
}

.repo-url {
  font-family: monospace;
  font-size: 0.85rem;
  color: #7f8c8d;
  word-break: break-all;
}

.repo-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #3498db;
}

input:checked + .slider:before {
  transform: translateX(24px);
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-icon:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon.btn-danger:hover:not(:disabled) {
  background: #ffe5e5;
  color: #e74c3c;
}

.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.repo-item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e1e8ed;
}

.repo-status {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-weight: 600;
}

.repo-status.enabled {
  background: #d4edda;
  color: #155724;
}

.repo-status.disabled {
  background: #f8d7da;
  color: #721c24;
}

.repo-sync {
  color: #7f8c8d;
}

/* Add Form */
.add-form-section {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.form-header h3 {
  margin: 0;
  color: #2c3e50;
}

.btn-close-small {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #7f8c8d;
  padding: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-close-small:hover {
  background: #e1e8ed;
}

.add-form {
  display: flex;
  flex-direction: column;
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

.form-group input {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  color: #2c3e50;
  font-size: 0.9rem;
}

.form-group input::placeholder {
  color: #95a5a6;
}

.form-group input:focus {
  outline: none;
  border-color: #3498db;
}

.form-help {
  color: #7f8c8d;
  font-size: 0.8rem;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.form-actions-right {
  display: flex;
  gap: 0.5rem;
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

.btn-secondary:hover:not(:disabled) {
  background: #3498db;
  color: white;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background: white;
  color: #7f8c8d;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f8f9fa;
  border-color: #95a5a6;
}

.test-result {
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
}

.test-result.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.test-result.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* Info Section */
.info-section {
  background: #e7f3ff;
  border: 1px solid #b3d9ff;
  border-radius: 8px;
  padding: 1.5rem;
}

.info-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #2c3e50;
}

.info-section p {
  color: #555;
  margin-bottom: 0.75rem;
  line-height: 1.5;
}

.info-section ul {
  margin: 1rem 0;
  padding-left: 1.5rem;
  color: #555;
  line-height: 1.6;
}

.info-section a {
  color: #3498db;
  text-decoration: none;
  font-weight: 600;
}

.info-section a:hover {
  text-decoration: underline;
}

/* Responsive */
@media (max-width: 768px) {
  .repo-item-header {
    flex-direction: column;
    gap: 1rem;
  }

  .repo-actions {
    align-self: flex-start;
  }

  .form-actions {
    flex-direction: column;
    gap: 1rem;
  }

  .form-actions-right {
    width: 100%;
  }

  .form-actions-right button {
    flex: 1;
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
