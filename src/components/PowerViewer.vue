<template>
  <div class="power-viewer">
    <!-- Login Panel -->
    <div class="login-panel" v-if="!authenticated">
      <div class="login-card">
        <div class="floating-input">
          <input 
            v-model="loginUsername" 
            type="text" 
            id="username"
            placeholder="Username"
            @keyup.enter="login"
          />
          <label for="username">Username</label>
        </div>
        <div class="floating-input">
          <input 
            v-model="loginPassword" 
            type="password" 
            id="password"
            placeholder="Password"
            @keyup.enter="login"
          />
          <label for="password">Password</label>
        </div>
        <button class="login-btn" @click="login" :disabled="!loginUsername || !loginPassword || loading">
          <span class="btn-icon">🔐</span>
          <span class="btn-text">{{ loading ? 'Connecting...' : 'Login' }}</span>
        </button>
        <p class="error" v-if="error">{{ error }}</p>
      </div>
    </div>

    <!-- Main Viewer -->
    <div v-else-if="authenticated" class="viewer-container">
      <!-- Sidebar Navigation -->
      <aside :class="['sidebar', { collapsed: sidebarCollapsed }]">
        <!-- Toggle Button -->
        <button class="sidebar-toggle" @click="toggleSidebar" title="Toggle sidebar">
          <template v-if="sidebarCollapsed">
            <span class="toggle-icon">☰</span>
          </template>
          <template v-else>
            <span class="toggle-text">menu</span>
            <span class="toggle-arrow">←</span>
          </template>
        </button>

        <!-- Menu Items -->
        <nav class="sidebar-nav">
          <button 
            :class="['sidebar-item', { active: activeTab === 'detector' }]"
            @click="activeTab = 'detector'"
            :title="sidebarCollapsed ? 'Power Detector' : ''"
          >
            <span class="sidebar-icon">🔍</span>
            <span class="sidebar-label">Power Detector</span>
          </button>
          <button 
            :class="['sidebar-item', { active: activeTab === 'libraries' }]"
            @click="activeTab = 'libraries'"
            :title="sidebarCollapsed ? 'Libraries' : ''"
          >
            <span class="sidebar-icon">📚</span>
            <span class="sidebar-label">Libraries</span>
          </button>
          <button 
            :class="['sidebar-item', { active: activeTab === 'ml' }]"
            @click="activeTab = 'ml'"
            :title="sidebarCollapsed ? 'ML Trainer' : ''"
          >
            <span class="sidebar-icon">🧠</span>
            <span class="sidebar-label">ML Trainer</span>
          </button>
          <button 
            :class="['sidebar-item', { active: activeTab === 'tagging' }]"
            @click="activeTab = 'tagging'"
            :title="sidebarCollapsed ? 'Power Tagging' : ''"
          >
            <span class="sidebar-icon">📊</span>
            <span class="sidebar-label">Power Tagging</span>
          </button>
          <button 
            :class="['sidebar-item', { active: activeTab === 'anomaly' }]"
            @click="activeTab = 'anomaly'"
            :title="sidebarCollapsed ? 'Anomaly Detector' : ''"
          >
            <span class="sidebar-icon">🔬</span>
            <span class="sidebar-label">Anomaly Detector</span>
          </button>
          <button 
            :class="['sidebar-item', { active: activeTab === 'settings' }]"
            @click="activeTab = 'settings'"
            :title="sidebarCollapsed ? 'Settings' : ''"
          >
            <span class="sidebar-icon">⚙️</span>
            <span class="sidebar-label">Settings</span>
          </button>
        </nav>

        <!-- User Info / Logout -->
        <button class="sidebar-logout" @click="logout" :title="`Logout ${loginUsername}`">
          <span class="sidebar-icon">👤</span>
          <span class="sidebar-label">{{ loginUsername }}</span>
        </button>
      </aside>

      <!-- Main Content Area -->
      <div class="main-area">
      <!-- Tagging Tab -->
      <div v-show="activeTab === 'tagging'" class="tab-content">
        <!-- Date Navigation -->
        <div class="date-navigation">
        <button @click="previousDay" class="nav-btn">← Previous Day</button>
        <div class="current-date">
          <input 
            type="date" 
            v-model="selectedDate" 
            @change="loadData"
          />
          <span>{{ formatDate(selectedDate) }}</span>
        </div>
        <button @click="nextDay" class="nav-btn">Next Day →</button>
        <button @click="exportCurrentDay" class="btn-export" :disabled="filteredTags.length === 0" title="Export current day to JSON">
          💾 Save Day
        </button>
      </div>

      <!-- Main Content: Chart Left, Tags Right -->
      <div class="main-content">
        <!-- Chart -->
        <div class="chart-section">
          <PowerChart 
            :data="chartData"
            :tags="tags"
            :selectedRange="selectedRange"
            :currentDate="selectedDate"
            @range-selected="onRangeSelected"
            @add-tag="addTag"
            @update-tag="updateTag"
          />
        </div>

        <!-- Tag Manager -->
        <div class="tags-section">
          <TagManager 
            :tags="tags"
            :selectedRange="selectedRange"
            :currentDate="selectedDate"
            @add-tag="addTag"
            @delete-tag="deleteTag"
            @clear-selection="clearSelection"
            @sensors-changed="onSensorsChanged"
            @models-changed="onModelsChanged"
          />
        </div>
      </div>

      <!-- Statistics Section Below -->
      <div class="statistics-section" v-if="filteredTags.length > 0">
        <div class="label-breakdown">
          <h3>Breakdown by Label:</h3>
          <div class="label-stats-grid">
            <div v-for="[label, count] in labelCounts" :key="label" class="label-stat">
              <span class="label-name">{{ label }}</span>
              <span class="count-badge">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- ML Trainer Tab -->
      <div v-show="activeTab === 'ml'" class="tab-content">
        <MLTrainer :powerData="powerData" @send-to-library="handleSendToLibrary" />
      </div>

      <!-- Power Detector Tab -->
      <div v-show="activeTab === 'detector'" class="tab-content">
        <PowerDetector 
          :sessionId="sessionId" 
          :detectorSettings="detectorSettings"
          @update:detectorSettings="detectorSettings = $event; saveDetectorSettings()"
        />
      </div>

      <!-- Anomaly Detector Tab -->
      <div v-show="activeTab === 'anomaly'" class="tab-content">
        <AnomalyDetector :sessionId="sessionId" />
      </div>

      <!-- Libraries Tab -->
      <div v-show="activeTab === 'libraries'" class="tab-content">
        <LibraryManager :preFillData="libraryPreFill" @data-used="libraryPreFill = null" @model-imported="handleModelImported" />
      </div>

      <!-- Settings Tab -->
      <div v-show="activeTab === 'settings'" class="tab-content">
        <div class="settings-container">
          <div class="settings-tabs">
            <button 
              :class="['settings-tab-btn', { active: settingsTab === 'general' }]"
              @click="settingsTab = 'general'"
            >
              General
            </button>
            <button 
              :class="['settings-tab-btn', { active: settingsTab === 'homeassistant' }]"
              @click="settingsTab = 'homeassistant'"
            >
              Home Assistant
            </button>
            <button 
              :class="['settings-tab-btn', { active: settingsTab === 'detector' }]"
              @click="settingsTab = 'detector'"
            >
              Detector
            </button>
            <button 
              :class="['settings-tab-btn', { active: settingsTab === 'service' }]"
              @click="settingsTab = 'service'"
            >
              Service
            </button>
          </div>

          <!-- General Settings -->
          <div v-show="settingsTab === 'general'" class="settings-content">
            <div class="settings-group">
              <div class="group-header">
                <h3>Application Preferences</h3>
                <p class="group-description">Configure default application behavior</p>
              </div>
              <div class="group-body">
                <div class="form-row">
                  <label class="form-label">Default View</label>
                  <div class="form-input-wrapper">
                    <select v-model="settings.defaultView" @change="saveSettings" class="form-input">
                      <option value="detector">Power Detector</option>
                      <option value="libraries">Libraries</option>
                      <option value="ml">ML Trainer</option>
                      <option value="tagging">Power Tagging</option>
                      <option value="anomaly">Anomaly Detector</option>
                    </select>
                    <span class="form-hint">Default tab to show when application starts</span>
                  </div>
                </div>
                <div class="form-row-check">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settings.autoLoadData" @change="saveSettings" />
                    <span class="checkbox-text">
                      <strong>Auto-connect to Home Assistant on startup</strong>
                      <span class="checkbox-hint">Automatically establish connection when application loads</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Detector Settings -->
          <div v-show="settingsTab === 'detector'" class="settings-content">
            <div class="settings-group">
              <div class="group-header">
                <h3>Detection Configuration</h3>
                <p class="group-description">Configure detection threshold and confidence levels</p>
              </div>
              <div class="group-body">
                <div class="form-row">
                  <label class="form-label">Detection Threshold</label>
                  <div class="form-input-wrapper">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                      <input 
                        type="range" 
                        id="threshold" 
                        v-model.number="detectorSettings.threshold" 
                        min="0.1" 
                        max="0.7" 
                        step="0.05"
                        @change="saveDetectorSettings"
                        style="flex: 1;"
                      />
                      <span class="config-value">{{ (detectorSettings.threshold * 100).toFixed(0) }}%</span>
                    </div>
                    <span class="form-hint">Higher values reduce false positives but may miss some detections</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="group-header">
                <h3>Disaggregation Methods</h3>
                <p class="group-description">Select energy disaggregation algorithms to use</p>
              </div>
              <div class="group-body">
                <div class="form-row-check">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="detectorSettings.useSeq2Point" @change="saveDetectorSettings" />
                    <span class="checkbox-text">
                      <strong>Enable Seq2Point energy disaggregation</strong>
                      <span class="checkbox-hint">Supervised ML - requires training per appliance</span>
                    </span>
                  </label>
                </div>
                
                <div class="form-row-check">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="detectorSettings.useGSP" @change="saveDetectorSettings" />
                    <span class="checkbox-text">
                      <strong>Enable GSP energy disaggregation</strong>
                      <span class="checkbox-hint">Training-less - auto-discovers all appliances</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div v-if="detectorSettings.useGSP" class="settings-group">
              <div class="group-header">
                <h3>GSP Advanced Configuration</h3>
                <p class="group-description">Fine-tune GSP algorithm parameters</p>
              </div>
              <div class="group-body">
                <div class="form-row">
                  <label class="form-label">Clustering Sensitivity (σ)</label>
                  <div class="form-input-wrapper">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                      <input 
                        type="range" 
                        id="gsp-sigma" 
                        v-model.number="detectorSettings.gspConfig.sigma" 
                        min="5" 
                        max="50" 
                        step="5"
                        @change="saveDetectorSettings"
                        style="flex: 1;"
                      />
                      <span class="config-value">{{ detectorSettings.gspConfig.sigma }}</span>
                    </div>
                    <span class="form-hint">Controls how appliances are grouped together</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">Min ON Power (W)</label>
                  <div class="form-input-wrapper">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                      <input 
                        type="range" 
                        id="gsp-threshold-pos" 
                        v-model.number="detectorSettings.gspConfig.T_Positive" 
                        min="10" 
                        max="100" 
                        step="10"
                        @change="saveDetectorSettings"
                        style="flex: 1;"
                      />
                      <span class="config-value">{{ detectorSettings.gspConfig.T_Positive }}</span>
                    </div>
                    <span class="form-hint">Minimum power increase to detect appliance turning on</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">Min OFF Power (W)</label>
                  <div class="form-input-wrapper">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                      <input 
                        type="range" 
                        id="gsp-threshold-neg" 
                        v-model.number="detectorSettings.gspConfig.T_Negative" 
                        min="-100" 
                        max="-10" 
                        step="10"
                        @change="saveDetectorSettings"
                        style="flex: 1;"
                      />
                      <span class="config-value">{{ detectorSettings.gspConfig.T_Negative }}</span>
                    </div>
                    <span class="form-hint">Minimum power decrease to detect appliance turning off</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">Min Activations</label>
                  <div class="form-input-wrapper">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                      <input 
                        type="range" 
                        id="gsp-instances" 
                        v-model.number="detectorSettings.gspConfig.instancelimit" 
                        min="2" 
                        max="10" 
                        step="1"
                        @change="saveDetectorSettings"
                        style="flex: 1;"
                      />
                      <span class="config-value">{{ detectorSettings.gspConfig.instancelimit }}</span>
                    </div>
                    <span class="form-hint">Minimum number of times an appliance must be detected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Service Settings -->
          <div v-show="settingsTab === 'service'" class="settings-content">
            <div class="settings-group">
              <div class="group-header">
                <h3>Background Services</h3>
                <p class="group-description">Configure automated background tasks and predictions</p>
              </div>
              <div class="group-body">
                <div class="form-row-check">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="detectorSettings.autoRunEnabled" @change="saveDetectorSettings" />
                    <span class="checkbox-text">
                      <strong>Enable automatic predictions every hour</strong>
                      <span class="checkbox-hint">Backend runs predictions and updates sensors automatically without UI interaction</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Home Assistant Settings -->
          <div v-show="settingsTab === 'homeassistant'" class="settings-content">
            
            <div v-if="!connected" class="alert-banner warning">
              <span class="alert-icon">⚠️</span>
              <div class="alert-content">
                <strong>Not Connected</strong>
                <p>Please enter your connection details below and click Connect.</p>
              </div>
            </div>
            
            <div class="settings-group">
              <div class="group-header">
                <h3>Connection Configuration</h3>
                <p class="group-description">Configure your Home Assistant connection parameters</p>
              </div>
              <div class="group-body">
                <div class="form-row">
                  <label class="form-label">Home Assistant URL</label>
                  <div class="form-input-wrapper">
                    <input 
                      v-model="settings.haUrl" 
                      type="text" 
                      class="form-input"
                      placeholder="http://homeassistant.local:8123"
                      @change="saveSettings"
                    />
                    <span class="form-hint">The base URL of your Home Assistant instance</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">Access Token</label>
                  <div class="form-input-wrapper">
                    <input 
                      v-model="settings.haToken" 
                      type="password" 
                      class="form-input"
                      placeholder="Your long-lived access token"
                      @change="saveSettings"
                    />
                    <span class="form-hint">Long-lived access token from your profile</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">Power Entity ID</label>
                  <div class="form-input-wrapper">
                    <input 
                      v-model="settings.entityId" 
                      type="text" 
                      class="form-input"
                      placeholder="sensor.power_consumption"
                      @change="saveSettings"
                    />
                    <span class="form-hint">Entity ID of your power consumption sensor</span>
                  </div>
                </div>
              </div>
              <div class="group-footer">
                <button @click="reconnect" class="btn-primary" :disabled="!settings.haUrl || !settings.haToken">
                  <span v-if="!connected">🔌 Connect</span>
                  <span v-else>🔄 Reconnect</span>
                </button>
              </div>
            </div>
            <div class="settings-group">
              <div class="group-header">
                <h3>Detector Integration</h3>
                <p class="group-description">Configure power detector synchronization with Home Assistant</p>
              </div>
              <div class="group-body">
                <div class="form-row-check">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="detectorSettings.autoSyncToHA" @change="saveDetectorSettings" />
                    <span class="checkbox-text">
                      <strong>Auto-sync predicted power to Home Assistant sensors</strong>
                      <span class="checkbox-hint">Creates p_&lt;appliance&gt; sensors with accumulated daily energy (Wh) for energy dashboard</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading/Status -->
      <div v-if="loading" class="loading">Loading data...</div>
      </div>
      <!-- End main-area -->
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
import { ref, computed } from 'vue'
import { format, parseISO, addDays, subDays } from 'date-fns'
import PowerChart from './PowerChart.vue'
import TagManager from './TagManager.vue'
import MLTrainer from './MLTrainer.vue'
import PowerDetector from './PowerDetector.vue'
import AnomalyDetector from './AnomalyDetector.vue'
import LibraryManager from './LibraryManager.vue'
import { connectToHA, fetchHistory, exportDay } from '../services/homeassistant'

// Authentication state
const authenticated = ref(false)
const sessionToken = ref(localStorage.getItem('sessionToken') || '')
const loginUsername = ref('')
const loginPassword = ref('')

// Connection state
const connected = ref(false)
const sessionId = ref(localStorage.getItem('haSessionId') || '')
const haUrl = ref(localStorage.getItem('haUrl') || '')
const haToken = ref(localStorage.getItem('haToken') || '')
const entityId = ref(localStorage.getItem('entityId') || 'sensor.power_consumption')
const error = ref('')
const loading = ref(false)

// Tab management
const activeTab = ref(localStorage.getItem('defaultView') || 'detector')
const settingsTab = ref('general')

// Settings state
const settings = ref({
  defaultView: localStorage.getItem('defaultView') || 'detector',
  autoLoadData: localStorage.getItem('autoLoadData') === 'true',
  haUrl: localStorage.getItem('haUrl') || '',
  haToken: localStorage.getItem('haToken') || '',
  entityId: localStorage.getItem('entityId') || 'sensor.power_consumption'
})

// Detector settings
const detectorSettings = ref({
  threshold: parseFloat(localStorage.getItem('detectorThreshold')) || 0.25,
  useSeq2Point: localStorage.getItem('detectorUseSeq2Point') !== 'false', // default true
  useGSP: localStorage.getItem('detectorUseGSP') === 'true', // default false
  gspConfig: {
    sigma: parseInt(localStorage.getItem('detectorGspSigma')) || 20,
    ri: 0.15,
    T_Positive: parseInt(localStorage.getItem('detectorGspTPositive')) || 20,
    T_Negative: parseInt(localStorage.getItem('detectorGspTNegative')) || -20,
    alpha: 0.5,
    beta: 0.5,
    instancelimit: parseInt(localStorage.getItem('detectorGspInstanceLimit')) || 3
  },
  autoSyncToHA: localStorage.getItem('autoSyncToHA') === 'true',
  autoRunEnabled: localStorage.getItem('autoRunEnabled') === 'true'
})

// Sidebar state
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')

// Library pre-fill state
const libraryPreFill = ref(null)

const handleSendToLibrary = (modelData) => {
  libraryPreFill.value = modelData
  activeTab.value = 'libraries'
}

const handleModelImported = (data) => {
  // Notify that a model was imported
  if (data.hasModelFiles) {
    console.log('Model imported with files, PowerDetector will refresh on next settings open')
  }
}

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed.value)
}

// Toast notification state
const toast = ref({
  show: false,
  message: '',
  type: 'success', // 'success' or 'error'
  icon: ''
})

// Date management
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))

// Data
const powerData = ref([])
const rawPowerData = ref([]) // Store original data before subtraction
const subtractedSensorIds = ref([])
const subtractedModelNames = ref([])
const tags = ref([])
const selectedRange = ref(null)

// Chart data
const chartData = computed(() => {
  return powerData.value.map(item => ({
    x: new Date(item.timestamp),
    y: item.value
  }))
})

// Filtered tags for current date
const filteredTags = computed(() => {
  return tags.value
    .filter(tag => tag.date === selectedDate.value)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
})

// Statistics
const uniqueLabels = computed(() => {
  return new Set(filteredTags.value.map(t => t.label))
})

const labelCounts = computed(() => {
  const counts = new Map()
  filteredTags.value.forEach(tag => {
    counts.set(tag.label, (counts.get(tag.label) || 0) + 1)
  })
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
})

// Load tags from localStorage
const loadTags = () => {
  const stored = localStorage.getItem('powerTags')
  if (stored) {
    tags.value = JSON.parse(stored)
  }
}

// Save tags to localStorage
const saveTags = () => {
  localStorage.setItem('powerTags', JSON.stringify(tags.value))
}

// Login function
const login = async () => {
  error.value = ''
  loading.value = true
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value,
        password: loginPassword.value
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Login failed')
    }
    
    const data = await response.json()
    sessionToken.value = data.sessionToken
    localStorage.setItem('sessionToken', data.sessionToken)
    localStorage.setItem('loggedInUser', loginUsername.value)
    
    authenticated.value = true
    console.log('✅ Login successful')
    
    // Load settings from server
    if (data.settings) {
      haUrl.value = data.settings.haUrl || ''
      haToken.value = data.settings.haToken || ''
      entityId.value = data.settings.entityId || 'sensor.power_consumption'
      settings.value.haUrl = haUrl.value
      settings.value.haToken = haToken.value
      settings.value.entityId = entityId.value
      
      // Auto-connect to Home Assistant if enabled and configured
      if (data.settings.autoConnect && haUrl.value && haToken.value) {
        console.log('🔄 Auto-connecting to Home Assistant...')
        await connect()
      } else {
        // Show settings tab if not auto-connecting
        activeTab.value = 'settings'
        settingsTab.value = 'homeassistant'
      }
    } else {
      // No settings, show settings tab
      activeTab.value = 'settings'
      settingsTab.value = 'homeassistant'
    }
  } catch (err) {
    error.value = err.message || 'Login failed'
    console.error('Login error:', err)
  } finally {
    loading.value = false
  }
}

// Logout function
const logout = async () => {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: sessionToken.value })
    })
  } catch (err) {
    console.error('Logout error:', err)
  }
  
  // Clear local state
  authenticated.value = false
  connected.value = false
  sessionToken.value = ''
  localStorage.removeItem('sessionToken')
  localStorage.removeItem('loggedInUser')
  
  // Clear form fields
  loginUsername.value = ''
  loginPassword.value = ''
  
  console.log('👋 Logged out')
}

// Connect to Home Assistant
const connect = async () => {
  error.value = ''
  loading.value = true
  
  try {
    await connectToHA(haUrl.value, haToken.value, entityId.value)
    connected.value = true
    
    // Get sessionId from localStorage (set by connectToHA)
    sessionId.value = localStorage.getItem('haSessionId')
    
    // Save credentials
    localStorage.setItem('haUrl', haUrl.value)
    localStorage.setItem('haToken', haToken.value)
    localStorage.setItem('entityId', entityId.value)
    
    // Update settings on backend
    await saveSettingsToBackend()
    
    // Show success toast
    showToast('Successfully connected to Home Assistant', 'success')
    
    // Load data
    await loadData()
    loadTags()
  } catch (err) {
    error.value = err.message || 'Failed to connect to Home Assistant'
    console.error('Connection error:', err)
  } finally {
    loading.value = false
  }
}

// Load power data for selected date
const loadData = async () => {
  loading.value = true
  error.value = ''
  
  console.log(`🔄 loadData called for date: ${selectedDate.value}`)
  
  // Try to load from cache first
  try {
    console.log(`📂 Checking for cached data for ${selectedDate.value}...`)
    const checkResponse = await fetch(`/api/data/check/${selectedDate.value}`)
    console.log(`Check response status: ${checkResponse.status}`)
    
    if (checkResponse.ok) {
      const checkData = await checkResponse.json()
      console.log('✅ Check response:', checkData)
      
      if (checkData.hasPowerData) {
        // Load cached data
        console.log('📥 Loading cached data...')
        const loadResponse = await fetch(`/api/data/load/${selectedDate.value}`)
        console.log(`Load response status: ${loadResponse.status}`)
        
        if (loadResponse.ok) {
          const cachedData = await loadResponse.json()
          console.log('✅ Cached data loaded:', { 
            powerDataPoints: cachedData.powerData?.length, 
            tagsCount: cachedData.tags?.length 
          })
          
          // Use cached power data
          rawPowerData.value = cachedData.powerData.map(item => ({
            timestamp: item.timestamp,
            value: item.power || item.value || parseFloat(item.state || 0)
          })).filter(item => !isNaN(item.value))
          
          console.log(`Mapped ${rawPowerData.value.length} power data points`)
          
          // Load cached tags if available
          if (checkData.hasTags && cachedData.tags && cachedData.tags.length > 0) {
            console.log('📋 Loading cached tags...', cachedData.tags.length)
            
            // Split comma-separated labels and merge consecutive segments with same label
            const splitTags = []
            
            // First, split comma-separated labels
            cachedData.tags.forEach(tag => {
              const labels = tag.label.split(',').map(l => l.trim())
              labels.forEach(label => {
                splitTags.push({
                  startTime: tag.startTime,
                  endTime: tag.endTime,
                  label: label
                })
              })
            })
            
            // Sort by label and start time
            splitTags.sort((a, b) => {
              if (a.label !== b.label) return a.label.localeCompare(b.label)
              return a.startTime.localeCompare(b.startTime)
            })
            
            // Merge consecutive segments with the same label
            const mergedTags = []
            let currentTag = null
            
            for (const tag of splitTags) {
              if (!currentTag || currentTag.label !== tag.label || currentTag.endTime !== tag.startTime) {
                // Start a new tag
                if (currentTag) {
                  mergedTags.push(currentTag)
                }
                currentTag = {
                  label: tag.label,
                  startTime: tag.startTime,
                  endTime: tag.endTime
                }
              } else {
                // Extend the current tag
                currentTag.endTime = tag.endTime
              }
            }
            
            // Add the last tag
            if (currentTag) {
              mergedTags.push(currentTag)
            }
            
            // Create tag objects with IDs
            const newTags = mergedTags.map(tag => ({
              id: `${selectedDate.value}-${tag.startTime}-${tag.endTime}-${tag.label}-${Date.now()}-${Math.random()}`,
              date: selectedDate.value,
              startTime: tag.startTime,
              endTime: tag.endTime,
              label: tag.label
            }))
            
            // Remove existing tags for this date before adding new ones
            tags.value = tags.value.filter(t => t.date !== selectedDate.value)
            // Add the cached tags
            tags.value = [...tags.value, ...newTags]
            saveTags()
            
            console.log(`✅ Loaded ${newTags.length} cached tags (merged from ${cachedData.tags.length} segments) for ${selectedDate.value}`)
          } else {
            console.log('ℹ️ No cached tags found for this date')
          }
          
          // Apply all subtractions (sensors and models) if any
          await applyAllSubtractions()
          
          loading.value = false
          console.log(`✅ Successfully loaded cached data for ${selectedDate.value}`)
          return
        } else {
          console.warn('⚠️ Failed to load cached data:', loadResponse.status)
        }
      } else {
        console.log('ℹ️ No cached power data found, will fetch from Home Assistant')
      }
    } else {
      console.warn('⚠️ Check API failed:', checkResponse.status)
    }
  } catch (cacheError) {
    console.error('❌ Error checking/loading cache:', cacheError)
    console.log('Will fallback to Home Assistant...')
  }
  
  // No cached data or failed to load - fetch from Home Assistant
  try {
    console.log('🏠 Fetching from Home Assistant...')
    const startDate = new Date(selectedDate.value)
    startDate.setHours(0, 0, 0, 0)
    
    const endDate = new Date(selectedDate.value)
    endDate.setHours(23, 59, 59, 999)
    
    const history = await fetchHistory(haUrl.value, haToken.value, entityId.value, startDate, endDate)
    
    rawPowerData.value = history.map(item => ({
      timestamp: item.last_changed,
      value: parseFloat(item.state)
    })).filter(item => !isNaN(item.value))
    
    console.log(`✅ Loaded ${rawPowerData.value.length} data points from Home Assistant`)
    
    // Apply all subtractions (sensors and models) if any
    await applyAllSubtractions()
    
  } catch (err) {
    error.value = 'Failed to load data: ' + err.message
    console.error('Load error:', err)
  } finally {
    loading.value = false
  }
}

// Date navigation
const previousDay = () => {
  const date = parseISO(selectedDate.value)
  selectedDate.value = format(subDays(date, 1), 'yyyy-MM-dd')
  loadData()
}

const nextDay = () => {
  const date = parseISO(selectedDate.value)
  selectedDate.value = format(addDays(date, 1), 'yyyy-MM-dd')
  loadData()
}

const formatDate = (dateStr) => {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
}

// Tag management
const onRangeSelected = (range) => {
  selectedRange.value = range
}

const addTag = (tag) => {
  tags.value.push({
    id: Date.now() + Math.random(), // Ensure unique ID for predictions
    date: selectedDate.value,
    startTime: tag.startTime,
    endTime: tag.endTime,
    label: tag.label,
    isPrediction: tag.isPrediction || false,
    confidence: tag.confidence || null
  })
  saveTags()
  if (!tag.isPrediction) {
    selectedRange.value = null
  }
}

const updateTag = (updatedTag) => {
  const index = tags.value.findIndex(t => t.id === updatedTag.id)
  if (index !== -1) {
    tags.value[index] = updatedTag
    saveTags()
  }
}

const deleteTag = (tagId) => {
  tags.value = tags.value.filter(t => t.id !== tagId)
  saveTags()
}

const clearSelection = () => {
  selectedRange.value = null
}

// Handle sensors changed event
const onSensorsChanged = async (sensorIds) => {
  console.log('🔥 onSensorsChanged called with:', sensorIds)
  console.log('Type:', typeof sensorIds, 'Is Array:', Array.isArray(sensorIds))
  console.log('Length:', sensorIds?.length)
  console.log('Contents:', JSON.stringify(sensorIds))
  subtractedSensorIds.value = sensorIds
  console.log('subtractedSensorIds.value set to:', subtractedSensorIds.value)
  await applyAllSubtractions()
}

// Handle models changed event
const onModelsChanged = async (modelNames) => {
  console.log('🔥 onModelsChanged called with:', modelNames)
  console.log('Type:', typeof modelNames, 'Is Array:', Array.isArray(modelNames))
  console.log('Length:', modelNames?.length)
  console.log('Contents:', JSON.stringify(modelNames))
  subtractedModelNames.value = modelNames
  console.log('subtractedModelNames.value set to:', subtractedModelNames.value)
  await applyAllSubtractions()
}

// Apply all subtractions (sensors and models)
const applyAllSubtractions = async () => {
  console.log('applyAllSubtractions called', {
    hasRawData: rawPowerData.value?.length > 0,
    sensorIds: subtractedSensorIds.value,
    modelNames: subtractedModelNames.value
  })
  
  if (!rawPowerData.value || rawPowerData.value.length === 0) {
    powerData.value = []
    return
  }
  
  // Start with raw data
  powerData.value = [...rawPowerData.value]
  
  // Apply sensor subtractions first
  await applySensorSubtractions()
  
  // Then apply model subtractions
  await applyModelSubtractions()
}

// Apply sensor subtractions
const applySensorSubtractions = async () => {
  console.log('applySensorSubtractions called', {
    hasData: powerData.value?.length > 0,
    sensorIds: subtractedSensorIds.value
  })
  
  // If no sensors to subtract, we're done
  if (!subtractedSensorIds.value || subtractedSensorIds.value.length === 0) {
    console.log('No sensors to subtract')
    return
  }
  
  try {
    const startDate = new Date(selectedDate.value)
    startDate.setHours(0, 0, 0, 0)
    
    const endDate = new Date(selectedDate.value)
    endDate.setHours(23, 59, 59, 999)
    
    console.log('Fetching history for sensors:', subtractedSensorIds.value)
    
    // Fetch history for each sensor
    for (const sensorId of subtractedSensorIds.value) {
      try {
        console.log(`Fetching history for ${sensorId}...`)
        const sensorHistory = await fetchHistory(haUrl.value, haToken.value, sensorId, startDate, endDate)
        
        console.log(`Got ${sensorHistory.length} data points for ${sensorId}`)
        
        const sensorData = sensorHistory.map(item => ({
          timestamp: item.last_changed,
          value: parseFloat(item.state)
        })).filter(item => !isNaN(item.value))
        
        console.log(`Processed ${sensorData.length} valid data points for ${sensorId}`)
        
        // Subtract sensor data from power data
        powerData.value = subtractSensorData(powerData.value, sensorData)
        console.log(`Subtraction complete for ${sensorId}`)
        
      } catch (err) {
        console.error(`Failed to fetch history for ${sensorId}:`, err)
        error.value = `Warning: Failed to subtract ${sensorId}: ${err.message}`
      }
    }
    
  } catch (err) {
    console.error('Error applying sensor subtractions:', err)
    error.value = 'Failed to apply sensor subtractions: ' + err.message
  }
}

// Apply model subtractions
const applyModelSubtractions = async () => {
  console.log('applyModelSubtractions called', {
    hasData: powerData.value?.length > 0,
    modelNames: subtractedModelNames.value
  })
  
  // If no models to subtract, we're done
  if (!subtractedModelNames.value || subtractedModelNames.value.length === 0) {
    console.log('No models to subtract')
    return
  }
  
  try {
    // Calculate standby power for the day (5th percentile to ignore noise)
    const sortedPower = [...powerData.value].map(d => d.value).sort((a, b) => a - b)
    const standbyIndex = Math.floor(sortedPower.length * 0.05)
    const standbyPower = sortedPower[standbyIndex] || 0
    console.log(`Calculated standby power: ${standbyPower.toFixed(2)}W (5th percentile)`)
    
    // Fetch predictions for each model
    for (const modelName of subtractedModelNames.value) {
      try {
        console.log(`Fetching predictions for model ${modelName}...`)
        
        // Call predict-day endpoint
        const response = await fetch('/api/seq2point/predict-day', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            appliance: modelName,
            date: selectedDate.value,
            powerData: rawPowerData.value.map(d => ({
              timestamp: d.timestamp,
              power: d.value
            }))
          })
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }))
          throw new Error(`Failed to get predictions: ${errorData.error || response.statusText}`)
        }
        
        const data = await response.json()
        console.log(`Got ${data.predictions.length} predictions for ${modelName}`)
        console.log('First 5 predictions:', data.predictions.slice(0, 5))
        
        // Create a map of current power data by timestamp for easy lookup
        const powerMap = new Map()
        powerData.value.forEach(d => {
          powerMap.set(new Date(d.timestamp).getTime(), d.value)
        })
        
        // Process predictions: subtract standby, cap at actual power in ON zones
        const modelData = data.predictions.map(p => {
          if (!p.isOn) {
            return { timestamp: p.timestamp, value: 0 }
          }
          
          // Subtract standby from prediction
          let adjustedPower = Math.max(0, p.predictedPower - standbyPower)
          
          // Cap prediction at actual power for this timestamp
          const actualPower = powerMap.get(new Date(p.timestamp).getTime()) || 0
          adjustedPower = Math.min(adjustedPower, actualPower)
          
          return {
            timestamp: p.timestamp,
            value: adjustedPower
          }
        })
        
        const onPredictions = modelData.filter(d => d.value > 0)
        console.log(`Subtracting model ${modelName} predictions (only when ON, after standby adjustment)...`)
        console.log('ON count:', data.predictions.filter(p => p.isOn).length)
        console.log('OFF count:', data.predictions.filter(p => !p.isOn).length)
        console.log('Total power to subtract:', onPredictions.reduce((sum, d) => sum + d.value, 0).toFixed(2) + 'W')
        
        // Subtract model predictions from power data
        powerData.value = subtractSensorData(powerData.value, modelData)
        console.log(`Model subtraction complete for ${modelName}`)
        
      } catch (err) {
        console.error(`Failed to apply model ${modelName}:`, err)
        error.value = `Warning: Failed to subtract model ${modelName}: ${err.message}`
      }
    }
    
  } catch (err) {
    console.error('Error applying model subtractions:', err)
    error.value = 'Failed to apply model subtractions: ' + err.message
  }
}

// Subtract sensor data from main power data
const subtractSensorData = (mainData, sensorData) => {
  // Create a map of sensor data by timestamp for quick lookup
  const sensorMap = new Map()
  sensorData.forEach(item => {
    const timestamp = new Date(item.timestamp).getTime()
    sensorMap.set(timestamp, item.value)
  })
  
  // Subtract sensor values from main data
  return mainData.map(item => {
    const timestamp = new Date(item.timestamp).getTime()
    
    // Find closest sensor value (within 5 minutes)
    let closestValue = 0
    let minDiff = 5 * 60 * 1000 // 5 minutes in ms
    
    for (const [sensorTime, sensorValue] of sensorMap.entries()) {
      const diff = Math.abs(timestamp - sensorTime)
      if (diff < minDiff) {
        minDiff = diff
        closestValue = sensorValue
      }
    }
    
    // Subtract and ensure non-negative
    const newValue = Math.max(0, item.value - closestValue)
    
    return {
      timestamp: item.timestamp,
      value: newValue
    }
  })
}

// Get color for a label (matches chart colors)
const getLabelColor = (label) => {
  if (chartRef.value && chartRef.value.getColorForLabel) {
    const colors = chartRef.value.getColorForLabel(label)
    return colors.border
  }
  return '#42b983' // fallback color
}

// Toast notification function
const showToast = (message, type = 'success') => {
  toast.value.message = message
  toast.value.type = type
  toast.value.icon = type === 'success' ? '✓' : '✕'
  toast.value.show = true
  
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// Settings management
const saveSettings = async () => {
  localStorage.setItem('defaultView', settings.value.defaultView)
  localStorage.setItem('autoLoadData', settings.value.autoLoadData)
  localStorage.setItem('haUrl', settings.value.haUrl)
  localStorage.setItem('haToken', settings.value.haToken)
  localStorage.setItem('entityId', settings.value.entityId)
  
  // Save to backend
  await saveSettingsToBackend()
  showToast('Settings saved', 'success')
}

const saveDetectorSettings = async () => {
  localStorage.setItem('detectorThreshold', detectorSettings.value.threshold)
  localStorage.setItem('detectorUseSeq2Point', detectorSettings.value.useSeq2Point)
  localStorage.setItem('detectorUseGSP', detectorSettings.value.useGSP)
  localStorage.setItem('detectorGspSigma', detectorSettings.value.gspConfig.sigma)
  localStorage.setItem('detectorGspTPositive', detectorSettings.value.gspConfig.T_Positive)
  localStorage.setItem('detectorGspTNegative', detectorSettings.value.gspConfig.T_Negative)
  localStorage.setItem('detectorGspInstanceLimit', detectorSettings.value.gspConfig.instancelimit)
  localStorage.setItem('autoSyncToHA', detectorSettings.value.autoSyncToHA)
  localStorage.setItem('autoRunEnabled', detectorSettings.value.autoRunEnabled)
  
  // Save to backend
  await saveSettingsToBackend()
  showToast('Detector settings saved', 'success')
}

const saveSettingsToBackend = async () => {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken.value}`
      },
      body: JSON.stringify({
        haUrl: settings.value.haUrl,
        haToken: settings.value.haToken,
        entityId: settings.value.entityId,
        autoConnect: settings.value.autoLoadData,
        defaultView: settings.value.defaultView,
        autoLoadData: settings.value.autoLoadData,
        detector: detectorSettings.value
      })
    })
  } catch (err) {
    console.error('Failed to save settings to backend:', err)
  }
}

const reconnect = async () => {
  // Update connection values from settings
  haUrl.value = settings.value.haUrl
  haToken.value = settings.value.haToken
  entityId.value = settings.value.entityId
  
  // Save to localStorage and backend first
  await saveSettings()
  
  // Disconnect and reconnect
  connected.value = false
  sessionId.value = ''
  await connect()
}

const loadSettingsFromBackend = async () => {
  try {
    const response = await fetch('/api/settings', {
      headers: { 
        'Authorization': `Bearer ${sessionToken.value}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      
      // Update general settings
      if (data.haUrl !== undefined) {
        settings.value.haUrl = data.haUrl
        haUrl.value = data.haUrl
        localStorage.setItem('haUrl', data.haUrl)
      }
      if (data.haToken !== undefined) {
        settings.value.haToken = data.haToken
        haToken.value = data.haToken
        localStorage.setItem('haToken', data.haToken)
      }
      if (data.entityId !== undefined) {
        settings.value.entityId = data.entityId
        entityId.value = data.entityId
        localStorage.setItem('entityId', data.entityId)
      }
      if (data.autoLoadData !== undefined) {
        settings.value.autoLoadData = data.autoLoadData
        localStorage.setItem('autoLoadData', data.autoLoadData)
      }
      if (data.defaultView !== undefined) {
        settings.value.defaultView = data.defaultView
        localStorage.setItem('defaultView', data.defaultView)
      }
      
      // Update detector settings
      if (data.detector) {
        if (data.detector.threshold !== undefined) {
          detectorSettings.value.threshold = data.detector.threshold
          localStorage.setItem('detectorThreshold', data.detector.threshold)
        }
        if (data.detector.useSeq2Point !== undefined) {
          detectorSettings.value.useSeq2Point = data.detector.useSeq2Point
          localStorage.setItem('detectorUseSeq2Point', data.detector.useSeq2Point)
        }
        if (data.detector.useGSP !== undefined) {
          detectorSettings.value.useGSP = data.detector.useGSP
          localStorage.setItem('detectorUseGSP', data.detector.useGSP)
        }
        if (data.detector.autoSyncToHA !== undefined) {
          detectorSettings.value.autoSyncToHA = data.detector.autoSyncToHA
          localStorage.setItem('autoSyncToHA', data.detector.autoSyncToHA)
        }
        if (data.detector.autoRunEnabled !== undefined) {
          detectorSettings.value.autoRunEnabled = data.detector.autoRunEnabled
          localStorage.setItem('autoRunEnabled', data.detector.autoRunEnabled)
        }
        if (data.detector.gspConfig) {
          if (data.detector.gspConfig.sigma !== undefined) {
            detectorSettings.value.gspConfig.sigma = data.detector.gspConfig.sigma
            localStorage.setItem('detectorGspSigma', data.detector.gspConfig.sigma)
          }
          if (data.detector.gspConfig.T_Positive !== undefined) {
            detectorSettings.value.gspConfig.T_Positive = data.detector.gspConfig.T_Positive
            localStorage.setItem('detectorGspTPositive', data.detector.gspConfig.T_Positive)
          }
          if (data.detector.gspConfig.T_Negative !== undefined) {
            detectorSettings.value.gspConfig.T_Negative = data.detector.gspConfig.T_Negative
            localStorage.setItem('detectorGspTNegative', data.detector.gspConfig.T_Negative)
          }
          if (data.detector.gspConfig.instancelimit !== undefined) {
            detectorSettings.value.gspConfig.instancelimit = data.detector.gspConfig.instancelimit
            localStorage.setItem('detectorGspInstanceLimit', data.detector.gspConfig.instancelimit)
          }
        }
      }
      
      console.log('✅ Settings loaded from backend')
      return true
    }
  } catch (err) {
    console.error('Failed to load settings from backend:', err)
  }
  return false
}

// Check for existing session on mount
if (sessionToken.value) {
  fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken: sessionToken.value })
  })
  .then(res => res.json())
  .then(async data => {
    if (data.success) {
      authenticated.value = true
      loginUsername.value = localStorage.getItem('loggedInUser') || 'User'
      
      // Load settings from backend
      const loaded = await loadSettingsFromBackend()
      
      // Fallback to data.settings if loadSettingsFromBackend failed
      if (!loaded && data.settings) {
        haUrl.value = data.settings.haUrl || ''
        haToken.value = data.settings.haToken || ''
        entityId.value = data.settings.entityId || 'sensor.power_consumption'
        settings.value.haUrl = haUrl.value
        settings.value.haToken = haToken.value
        settings.value.entityId = entityId.value
        
        // Auto-connect if enabled
        if (data.settings.autoConnect && haUrl.value && haToken.value) {
          connect()
        } else {
          // Show settings tab if not auto-connecting
          activeTab.value = 'settings'
          settingsTab.value = 'homeassistant'
        }
      } else if (loaded) {
        // Settings loaded from backend, check if auto-connect
        if (settings.value.autoLoadData && haUrl.value && haToken.value) {
          connect()
          // Apply default view after connection
          if (settings.value.defaultView) {
            activeTab.value = settings.value.defaultView
          }
        } else if (!haUrl.value || !haToken.value) {
          // Show settings tab if not configured
          activeTab.value = 'settings'
          settingsTab.value = 'homeassistant'
        } else {
          // Apply default view if configured but not auto-connecting
          if (settings.value.defaultView) {
            activeTab.value = settings.value.defaultView
          }
        }
      } else {
        // No settings, show settings tab
        activeTab.value = 'settings'
        settingsTab.value = 'homeassistant'
      }
    } else {
      // Invalid session
      localStorage.removeItem('sessionToken')
      sessionToken.value = ''
    }
  })
  .catch(() => {
    localStorage.removeItem('sessionToken')
    sessionToken.value = ''
  })
}

// Export current day data
const exportCurrentDay = async () => {
  if (filteredTags.value.length === 0) {
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    const result = await exportDay(selectedDate.value, tags.value)
    console.log(`✅ Saved ${result.entries} entries to ${result.filename}`)
    showToast(`Saved ${result.entries} entries to ${result.filename}`, 'success')
  } catch (err) {
    error.value = 'Failed to export: ' + err.message
    console.error('Export error:', err)
    showToast('Failed to export: ' + err.message, 'error')
  } finally {
    loading.value = false
  }
}

// Note: Removed auto-connect behavior - user must explicitly click "Connect" button
</script>

<style scoped>
.power-viewer {
  min-height: calc(100vh - 80px);
}

.login-panel {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%),
              url('/background_login.png') center/cover no-repeat;
  background-blend-mode: overlay;
}

.login-card {
  background: rgba(120, 129, 217, 0.15);
  padding: 3vh 2.5vw;
  border-radius: 30px;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3), 
              0 8px 40px rgba(0, 0, 0, 0.12);
  width: 22vw;
  height: 33vh;
  min-width: 280px;
  max-width: 450px;
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  margin-top: 2vh;
}

.config-panel {
  padding: 2rem;
  max-width: 500px;
  margin: 0 auto;
}

.config-panel h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.25rem;
}

.floating-input {
  position: relative;
  margin-bottom: 1.8rem;
}

.floating-input input {
  width: 100%;
  padding: 1rem 0.75rem 0.5rem;
  background: rgba(120, 129, 217, 0.25);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  font-size: 1rem;
  color: white;
  transition: all 0.3s ease;
}

.floating-input input::placeholder {
  color: transparent;
}

.floating-input input:focus {
  outline: none;
  background: rgba(120, 129, 217, 0.35);
  border-color: rgba(255, 255, 255, 0.6);
}

.floating-input label {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  transition: all 0.3s ease;
  pointer-events: none;
  background: transparent;
}

.floating-input input:focus + label,
.floating-input input:not(:placeholder-shown) + label {
  top: 0.4rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(0);
}

.login-btn {
  width: 100%;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  margin-top: 0.5rem;
}

.login-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  transform: translateY(-2px);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  background: rgba(120, 129, 217, 0.3);
  cursor: not-allowed;
  box-shadow: none;
}

.btn-icon {
  font-size: 1.2rem;
}

.btn-text {
  font-size: 1rem;
}

.error {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fee;
  color: #c33;
  border-radius: 4px;
  font-size: 0.9rem;
}

.viewer-container {
  display: flex;
  max-width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.viewer-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  pointer-events: none;
  z-index: 0;
}

.viewer-container > * {
  position: relative;
  z-index: 1;
}

/* Sidebar Styles */
.sidebar {
  width: 250px;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  position: relative;
  flex-shrink: 0;
  box-shadow: 2px 0 15px rgba(102, 126, 234, 0.3);
}

.sidebar.collapsed {
  width: 70px;
}

.sidebar-toggle {
  width: 100%;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  color: white;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.sidebar-toggle:hover {
  background: rgba(0, 0, 0, 0.3);
}

.toggle-text {
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toggle-arrow {
  font-size: 1.25rem;
  font-weight: bold;
}

.toggle-icon {
  font-size: 1.5rem;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  overflow-y: auto;
  flex: 1;
}

.sidebar-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.3s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.sidebar-item.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  border-left-color: #ffffff;
}

.sidebar-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  width: 1.5rem;
  text-align: center;
}

.sidebar-label {
  font-size: 1rem;
  font-weight: 500;
  transition: opacity 0.3s;
}

.sidebar.collapsed .sidebar-label {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

.sidebar.collapsed .sidebar-item {
  justify-content: center;
  padding: 1rem 0.5rem;
}

.sidebar-logout {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.9);
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  margin-top: auto;
}

.sidebar-logout:hover {
  background: rgba(0, 0, 0, 0.3);
  color: white;
}

.sidebar.collapsed .sidebar-logout {
  justify-content: center;
  padding: 1rem 0.5rem;
}

.sidebar.collapsed .sidebar-logout .sidebar-label {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

/* Main Content Area */
.main-area {
  flex: 1;
  padding: 0;
  overflow-y: auto;
  background: url('/background_power.png') center/cover no-repeat fixed;
  position: relative;
}

.main-area::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(4px);
  pointer-events: none;
  z-index: 0;
}

.main-area > * {
  position: relative;
  z-index: 1;
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

.date-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
  padding: 0.5rem;
  gap: 1rem;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.btn-export {
  width: auto;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  background: #28a745;
  margin-left: auto;
}

.btn-export:hover:not(:disabled) {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.btn-export:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.nav-btn {
  width: auto;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.current-date {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.current-date input[type="date"] {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.current-date span {
  font-weight: 600;
  color: #2c3e50;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.chart-section {
  background: #fafafa;
  padding: 0.75rem;
  border-radius: 8px;
  min-height: 400px;
}

.tags-section {
  background: white;
  border-radius: 8px;
  overflow-y: auto;
  max-height: 600px;
}

.statistics-section {
  margin-top: 1.5rem;
  padding: 0.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.statistics-section h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.25rem;
}

.statistics-section h3 {
  margin-bottom: 0.75rem;
  color: #2c3e50;
  font-size: 1.1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: rgba(120, 129, 217, 0.08);
  border-radius: 8px;
  border-left: 4px solid #667eea;
}

.stat-label {
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #667eea;
}

.label-breakdown {
  margin-top: 1rem;
}

.label-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.label-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.label-stat:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.label-name {
  font-weight: 600;
  color: #2c3e50;
}

.count-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  min-width: 30px;
  text-align: center;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-style: italic;
}

/* Responsive Styles */
@media (max-width: 1200px) {
  .main-content {
    grid-template-columns: 1fr;
  }
  
  .tags-section {
    max-height: none;
  }
}

@media (max-width: 768px) {
  .viewer-container {
    flex-direction: column;
  }

  .sidebar {
    width: 100% !important;
    height: auto;
    flex-direction: row;
  }

  .sidebar.collapsed {
    width: 100% !important;
  }

  .sidebar-toggle {
    display: none;
  }

  .sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0;
  }

  .sidebar-item {
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    min-width: 80px;
  }

  .sidebar.collapsed .sidebar-label {
    opacity: 1;
    width: auto;
  }

  .sidebar-label {
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .sidebar-icon {
    font-size: 1.25rem;
  }

  .main-area {
    padding: 1rem;
  }

  .date-navigation {
    flex-direction: column;
  }
  
  .nav-btn {
    width: 100%;
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

/* Toast Animation */
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

/* Settings Styles */
.settings-container {
  padding: 2rem;
  max-width: 800px;
}

.settings-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e0e0e0;
}

.settings-tab-btn {
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 1rem;
  color: #666;
  transition: all 0.2s;
}

.settings-tab-btn:hover {
  color: #667eea;
  background: rgba(120, 129, 217, 0.08);
}

.settings-tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
  font-weight: 600;
}

.settings-content {
  animation: fadeIn 0.3s;
}

.settings-content h2 {
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.info-banner {
  padding: 1rem;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  color: #856404;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.settings-section {
  margin-bottom: 2rem;
}

.settings-section h3 {
  margin-bottom: 1rem;
  color: #666;
  font-size: 1.1rem;
}

/* Professional groupbox styling */
.settings-group {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.group-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

.group-header h3 {
  margin: 0 0 0.25rem 0;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
}

.group-description {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
}

.group-body {
  padding: 1.5rem;
}

.group-footer {
  padding: 1rem 1.5rem;
  background: #f8f9fa;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.form-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 1.5rem;
  align-items: start;
  margin-bottom: 1.5rem;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-label {
  font-weight: 600;
  color: #2c3e50;
  padding-top: 0.75rem;
  text-align: right;
  font-size: 0.95rem;
}

.form-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
  transition: all 0.2s;
  background: #fff;
  color: #2c3e50;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-row-check {
  margin-bottom: 1rem;
}

.form-row-check:last-child {
  margin-bottom: 0;
}

.checkbox-label {
  display: flex;
  align-items: start;
  gap: 0.75rem;
  cursor: pointer;
  padding: 1rem;
  border-radius: 6px;
  transition: background 0.2s;
}

.checkbox-label:hover {
  background: #f8f9fa;
}

.checkbox-label input[type="checkbox"] {
  margin-top: 0.25rem;
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.checkbox-text strong {
  color: #2c3e50;
  font-weight: 600;
}

.checkbox-hint {
  color: #6c757d;
  font-size: 0.85rem;
  line-height: 1.4;
}

.alert-banner {
  padding: 1rem 1.25rem;
  border-radius: 6px;
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1rem;
  align-items: start;
}

.alert-banner.warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
}

.alert-banner.success {
  background: #d4edda;
  border: 1px solid #28a745;
}

.alert-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.alert-content {
  flex: 1;
}

.alert-content strong {
  display: block;
  margin-bottom: 0.25rem;
  color: #2c3e50;
  font-weight: 600;
}

.alert-content p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.settings-content .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  
  .form-label {
    text-align: left;
    padding-top: 0;
  }
}

.settings-content .form-group {
  margin-bottom: 1.5rem;
}

.settings-content .form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #666;
  font-weight: 500;
}

.settings-content .form-group input[type="text"],
.settings-content .form-group input[type="password"],
.settings-content .form-group select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  transition: all 0.2s;
}

.settings-content .form-group input[type="text"]:focus,
.settings-content .form-group input[type="password"]:focus,
.settings-content .form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.settings-content .form-group input[type="checkbox"] {
  margin-right: 0.5rem;
  cursor: pointer;
}

.settings-content .form-group input[type="range"] {
  width: 100%;
  cursor: pointer;
}

.settings-content .config-value {
  font-weight: 600;
  color: #3498db;
  margin-left: 0.5rem;
}

.settings-content .config-hint,
.settings-content .form-hint {
  font-size: 0.85rem;
  color: #95a5a6;
  font-style: italic;
  margin-top: 0.25rem;
}

.settings-content .gsp-config {
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  margin-top: 0.5rem;
}

.settings-content .btn-primary {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.settings-content .btn-primary:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
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
</style>
