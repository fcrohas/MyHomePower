import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import archiver from 'archiver'
import * as ort from 'onnxruntime-node'
import tf from './ml/tf-provider.js'
import { PowerTagPredictor } from './ml/model.js'
import { MSDCPredictor } from './ml/model-msdc.js'
import { SlidingWindowPredictor } from './ml/slidingWindowPredictor.js'
import { PowerAutoencoder } from './ml/autoencoder.js'
import { loadAllData, prepareTrainingData, createTensors, preparePredictionInput } from './ml/dataPreprocessing.js'
import { prepareSeq2PointInput, denormalizePower } from './ml/seq2pointPreprocessing.js'
import { disaggregatePower } from './ml/gspDisaggregator.js'
import AutoPredictor from './auto-predictor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' })) // Increase limit for large power data arrays
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Serve static files from the dist directory (production build)
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  console.log('📦 Serving frontend from:', distPath)
  app.use(express.static(distPath))
}

// Store HA connection info (in production, use a proper session management)
let haConnections = new Map()
let activeSessions = new Map() // Store authenticated user sessions

// Load settings from settings.json
let appSettings = {
  haUrl: '',
  haToken: '',
  entityId: 'sensor.power_consumption',
  autoConnect: false,
  defaultView: 'detector',
  autoLoadData: false,
  detector: {
    threshold: 0.25,
    useSeq2Point: true,
    useGSP: false,
    gspConfig: {
      sigma: 20,
      ri: 0.15,
      T_Positive: 20,
      T_Negative: -20,
      alpha: 0.5,
      beta: 0.5,
      instancelimit: 3
    },
    autoSyncToHA: false,
    autoRunEnabled: false
  }
}

const settingsPath = path.join(__dirname, '..', 'settings.json')
if (fs.existsSync(settingsPath)) {
  try {
    appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    console.log('📋 Loaded settings from settings.json')
  } catch (err) {
    console.error('⚠️ Failed to load settings:', err)
  }
}

// Save settings function
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2))
    console.log('💾 Settings saved')
  } catch (err) {
    console.error('⚠️ Failed to save settings:', err)
  }
}

// Model selection: 'PowerTagPredictor' or 'MSDCPredictor'
// Can be set via environment variable MODEL_TYPE or changed here
const MODEL_TYPE = process.env.MODEL_TYPE || 'PowerTagPredictor'
const MSDC_ARCHITECTURE = process.env.MSDC_ARCHITECTURE || 'S2P_on' // S2P_on, S2P_State, S2P_State2
const MSDC_LITE = process.env.MSDC_LITE === 'true' || false // Use lite version (50% fewer filters, 50% smaller dense layers)

// Factory function to create the appropriate model
function createModel() {
  const liteInfo = (MODEL_TYPE === 'MSDCPredictor' && MSDC_LITE) ? ' [LITE]' : ''
  console.log(`🔧 Creating model: ${MODEL_TYPE}${MODEL_TYPE === 'MSDCPredictor' ? ` (${MSDC_ARCHITECTURE})` : ''}${liteInfo}`)
  
  if (MODEL_TYPE === 'MSDCPredictor') {
    return new MSDCPredictor()
  } else {
    return new PowerTagPredictor()
  }
}

// ML model instance and training state
let mlModel = null
let mlStats = null
let mlTags = []
let trainingInProgress = false
let trainingHistory = []
let trainingMetadata = null
let currentModelId = null

// Autoencoder for anomaly detection
let autoencoderModels = new Map() // Map of tag -> autoencoder model

// Helper function to sanitize appliance names for file system usage
function sanitizeApplianceName(appliance) {
  // Replace spaces and special characters with underscores
  return appliance.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_')
}

// Track which models should use ONNX inference
const useOnnxForModel = new Map() // Map of appliance -> boolean

let autoencoderTraining = new Map() // Map of tag -> training status

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Power Viewer API is running' })
})

// Get current model configuration
app.get('/api/model/info', (req, res) => {
  res.json({
    modelType: MODEL_TYPE,
    architecture: MODEL_TYPE === 'MSDCPredictor' ? MSDC_ARCHITECTURE : 'seq2point',
    isLoaded: mlModel !== null,
    availableModels: [
      { type: 'PowerTagPredictor', description: 'Conv2D-based seq2point model' },
      { type: 'MSDCPredictor', architectures: ['S2P_on', 'S2P_State', 'S2P_State2'], description: 'Conv1D-based multi-scale NILM' }
    ]
  })
})

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body

  const validUsername = process.env.APP_USERNAME || 'admin'
  const validPassword = process.env.APP_PASSWORD || 'admin'

  if (username === validUsername && password === validPassword) {
    const sessionToken = Date.now().toString() + Math.random().toString(36).substring(7)
    activeSessions.set(sessionToken, { username, loginTime: new Date() })
    
    console.log(`✅ User logged in: ${username}`)
    
    res.json({ 
      success: true, 
      sessionToken,
      settings: appSettings
    })
  } else {
    console.log(`❌ Login failed for user: ${username}`)
    res.status(401).json({ error: 'Invalid credentials' })
  }
})

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const { sessionToken } = req.body
  if (sessionToken) {
    activeSessions.delete(sessionToken)
    console.log('👋 User logged out')
  }
  res.json({ success: true })
})

// Verify session endpoint
app.post('/api/auth/verify', (req, res) => {
  const { sessionToken } = req.body
  
  if (!sessionToken || !activeSessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Invalid session' })
  }
  
  res.json({ 
    success: true,
    settings: appSettings
  })
})

// Get settings endpoint
app.get('/api/settings', (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '')
  
  if (!sessionToken || !activeSessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  res.json(appSettings)
})

// Update settings endpoint
app.post('/api/settings', (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '')
  
  if (!sessionToken || !activeSessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  const { haUrl, haToken, entityId, autoConnect, defaultView, autoLoadData, detector } = req.body
  
  if (haUrl !== undefined) appSettings.haUrl = haUrl
  if (haToken !== undefined) appSettings.haToken = haToken
  if (entityId !== undefined) appSettings.entityId = entityId
  if (autoConnect !== undefined) appSettings.autoConnect = autoConnect
  if (defaultView !== undefined) appSettings.defaultView = defaultView
  if (autoLoadData !== undefined) appSettings.autoLoadData = autoLoadData
  if (detector !== undefined) appSettings.detector = detector
  
  saveSettings()
  
  res.json({ success: true, settings: appSettings })
})

// Test Home Assistant connection
app.post('/api/ha/connect', async (req, res) => {
  const { url, token, entityId } = req.body

  if (!url || !token) {
    return res.status(400).json({ error: 'Missing url or token' })
  }

  try {
    console.log(`Attempting to connect to Home Assistant at: ${url}`)
    
    // Test connection by fetching config
    const response = await fetch(`${url}/api/config`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`HA connection failed (${response.status}):`, errorText)
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`)
    }

    const config = await response.json()
    console.log(`✅ Connected to Home Assistant: ${config.location_name || 'Unknown'}`)

    // Store connection (use session ID in production)
    const sessionId = Date.now().toString()
    haConnections.set(sessionId, { url, token, entityId })
    
    console.log(`Session created: ${sessionId}, Entity: ${entityId || 'not specified'}`)

    res.json({ 
      success: true, 
      sessionId,
      homeAssistant: config.location_name || 'Connected'
    })
  } catch (error) {
    console.error('HA Connection error:', error)
    res.status(500).json({ 
      error: 'Failed to connect to Home Assistant',
      message: error.message 
    })
  }
})

// Fetch history data
app.post('/api/ha/history', async (req, res) => {
  const { sessionId, entityId, startTime, endTime } = req.body

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' })
  }

  const connection = haConnections.get(sessionId)
  if (!connection) {
    return res.status(401).json({ error: 'Invalid session. Please reconnect.' })
  }

  const { url, token } = connection
  const entity = entityId || connection.entityId

  if (!entity) {
    return res.status(400).json({ error: 'Missing entityId' })
  }

  try {
    const startISO = new Date(startTime).toISOString()
    const endISO = new Date(endTime).toISOString()
    
    // Home Assistant history API format: /api/history/period/START_TIME?filter_entity_id=ENTITY&end_time=END_TIME
    // Some HA versions prefer timestamp format without the Z
    const historyUrl = `${url}/api/history/period/${startISO}?filter_entity_id=${entity}&end_time=${endISO}&minimal_response`
    
    console.log(`Fetching history from: ${url}/api/history/period/...`)
    console.log(`Entity: ${entity}, Start: ${startISO}, End: ${endISO}`)
    
    const response = await fetch(historyUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`History API error (${response.status}):`, errorText)
      throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`History response: ${data.length} entity histories received`)
    
    // Return the history data
    const history = data.length > 0 && data[0].length > 0 ? data[0] : []
    console.log(`Returning ${history.length} history records`)
    
    res.json({ success: true, data: history })
  } catch (error) {
    console.error('History fetch error:', error)
    res.status(500).json({ 
      error: 'Failed to fetch history',
      message: error.message 
    })
  }
})

// Get entity state
app.post('/api/ha/state', async (req, res) => {
  const { sessionId, entityId } = req.body

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' })
  }

  const connection = haConnections.get(sessionId)
  if (!connection) {
    return res.status(401).json({ error: 'Invalid session. Please reconnect.' })
  }

  const { url, token } = connection
  const entity = entityId || connection.entityId

  if (!entity) {
    return res.status(400).json({ error: 'Missing entityId' })
  }

  try {
    const response = await fetch(`${url}/api/states/${entity}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to get state: ${response.statusText}`)
    }

    const state = await response.json()
    res.json({ success: true, data: state })
  } catch (error) {
    console.error('State fetch error:', error)
    res.status(500).json({ 
      error: 'Failed to get entity state',
      message: error.message 
    })
  }
})

// List all entities
app.post('/api/ha/entities', async (req, res) => {
  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' })
  }

  const connection = haConnections.get(sessionId)
  if (!connection) {
    return res.status(401).json({ error: 'Invalid session. Please reconnect.' })
  }

  const { url, token } = connection

  try {
    const response = await fetch(`${url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to get entities: ${response.statusText}`)
    }

    const entities = await response.json()
    res.json({ success: true, data: entities })
  } catch (error) {
    console.error('Entities fetch error:', error)
    res.status(500).json({ 
      error: 'Failed to get entities',
      message: error.message 
    })
  }
})

// Disconnect (clear session)
app.post('/api/ha/disconnect', (req, res) => {
  const { sessionId } = req.body
  
  if (sessionId && haConnections.has(sessionId)) {
    haConnections.delete(sessionId)
  }
  
  res.json({ success: true, message: 'Disconnected' })
})

// Update or create a sensor in Home Assistant
app.post('/api/ha/update-sensor', async (req, res) => {
  const { sessionId, entityId, state, attributes } = req.body

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' })
  }

  if (!entityId || state === undefined) {
    return res.status(400).json({ error: 'Missing entityId or state' })
  }

  const connection = haConnections.get(sessionId)
  if (!connection) {
    return res.status(401).json({ error: 'Invalid session. Please reconnect.' })
  }

  const { url, token } = connection

  try {
    // Use Home Assistant REST API to set state
    // POST /api/states/<entity_id>
    const response = await fetch(`${url}/api/states/${entityId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        state: state,
        attributes: attributes || {}
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to update sensor (${response.status}):`, errorText)
      throw new Error(`Failed to update sensor: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    console.log(`✅ Updated sensor ${entityId} with state: ${state}`)
    
    res.json({ 
      success: true, 
      entityId,
      state: result.state,
      attributes: result.attributes
    })
  } catch (error) {
    console.error('Sensor update error:', error)
    res.status(500).json({ 
      error: 'Failed to update sensor',
      message: error.message 
    })
  }
})

// Export day data with merged overlapping tags and save to data folder
app.post('/api/export/day', async (req, res) => {
  const { date, tags, sessionId } = req.body

  if (!date || !tags) {
    return res.status(400).json({ error: 'Missing date or tags' })
  }

  if (!sessionId || !haConnections.has(sessionId)) {
    return res.status(401).json({ error: 'Not connected to Home Assistant' })
  }

  try {
    console.log(`Exporting data for ${date} with ${tags.length} tags`)

    const { url, token, entityId } = haConnections.get(sessionId)

    // Fetch power history for the entire day
    const startDate = new Date(`${date}T00:00:00`)
    const endDate = new Date(`${date}T23:59:59`)
    
    const historyUrl = `${url}/api/history/period/${startDate.toISOString()}?filter_entity_id=${entityId}&end_time=${endDate.toISOString()}`
    
    const historyResponse = await fetch(historyUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!historyResponse.ok) {
      throw new Error(`History fetch failed: ${historyResponse.statusText}`)
    }

    const historyData = await historyResponse.json()
    const powerData = historyData[0] || []

    console.log(`Fetched ${powerData.length} power data points`)

    // Filter tags for the specific date
    const dateTags = tags.filter(tag => tag.date === date)

    if (dateTags.length === 0) {
      return res.status(400).json({ error: 'No tags found for this date' })
    }

    // Sort tags by start time
    const sortedTags = dateTags.sort((a, b) => a.startTime.localeCompare(b.startTime))

    // Convert time strings to minutes for easier comparison
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number)
      return hours * 60 + minutes
    }

    const minutesToTime = (minutes) => {
      const hours = Math.floor(minutes / 60).toString().padStart(2, '0')
      const mins = (minutes % 60).toString().padStart(2, '0')
      return `${hours}:${mins}`
    }

    // Convert tags to intervals with labels
    const intervals = sortedTags.map(tag => ({
      start: timeToMinutes(tag.startTime),
      end: timeToMinutes(tag.endTime),
      label: tag.label
    }))

    // Collect all unique time points (start and end times)
    const timePoints = new Set()
    intervals.forEach(interval => {
      timePoints.add(interval.start)
      timePoints.add(interval.end)
    })

    // Sort time points
    const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b)

    // For each segment between consecutive time points, find which labels are active
    const segments = []
    for (let i = 0; i < sortedTimePoints.length - 1; i++) {
      const segmentStart = sortedTimePoints[i]
      const segmentEnd = sortedTimePoints[i + 1]

      // Find all labels that cover this segment
      const activeLabels = intervals
        .filter(interval => interval.start <= segmentStart && interval.end >= segmentEnd)
        .map(interval => interval.label)

      if (activeLabels.length > 0) {
        segments.push({
          startMin: segmentStart,
          endMin: segmentEnd,
          labels: activeLabels
        })
      }
    }

    // Convert back to time format and create final output
    const tagsData = {
      date: date,
      entries: segments.map(segment => ({
        startTime: minutesToTime(segment.startMin),
        endTime: minutesToTime(segment.endMin),
        label: segment.labels.join(', ')
      }))
    }

    // Prepare power data for the whole day
    const powerExportData = {
      date: date,
      entityId: haConnections.get(sessionId).entityId,
      dataPoints: powerData.length,
      data: powerData.map(point => ({
        timestamp: point.last_changed || point.last_updated,
        power: parseFloat(point.state),
        unit: point.attributes?.unit_of_measurement || 'W'
      }))
    }

    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '..', 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Save tags file
    const tagsFilename = `power-tags-${date}.json`
    const tagsFilepath = path.join(dataDir, tagsFilename)
    fs.writeFileSync(tagsFilepath, JSON.stringify(tagsData, null, 2), 'utf8')
    
    // Save power data file
    const powerFilename = `power-data-${date}.json`
    const powerFilepath = path.join(dataDir, powerFilename)
    fs.writeFileSync(powerFilepath, JSON.stringify(powerExportData, null, 2), 'utf8')
    
    console.log(`✅ Saved ${tagsData.entries.length} segments to ${tagsFilepath}`)
    console.log(`✅ Saved ${powerExportData.dataPoints} power data points to ${powerFilepath}`)
    
    res.json({ 
      success: true, 
      message: `Data saved to ${tagsFilename} and ${powerFilename}`,
      tagsFile: tagsFilename,
      powerFile: powerFilename,
      entries: tagsData.entries.length,
      dataPoints: powerExportData.dataPoints
    })
  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({ 
      error: 'Failed to export data',
      message: error.message 
    })
  }
})

// Check if cached power data and tags exist for a date (for PowerChart/TagManager)
app.get('/api/data/check/:date', async (req, res) => {
  try {
    const { date } = req.params
    const dataDir = path.join(__dirname, '..', 'data')
    
    const powerDataFile = path.join(dataDir, `power-data-${date}.json`)
    const tagsFile = path.join(dataDir, `power-tags-${date}.json`)
    
    const hasPowerData = fs.existsSync(powerDataFile)
    const hasTags = fs.existsSync(tagsFile)
    
    console.log(`📂 Check data for ${date}: power=${hasPowerData}, tags=${hasTags}`)
    
    res.json({
      hasPowerData,
      hasTags,
      date
    })
  } catch (error) {
    console.error('Check data error:', error)
    res.status(500).json({ error: 'Failed to check data', message: error.message })
  }
})

// Load cached power data and tags for a date (for PowerChart/TagManager)
app.get('/api/data/load/:date', async (req, res) => {
  try {
    const { date } = req.params
    const dataDir = path.join(__dirname, '..', 'data')
    
    const powerDataFile = path.join(dataDir, `power-data-${date}.json`)
    const tagsFile = path.join(dataDir, `power-tags-${date}.json`)
    
    console.log(`📥 Loading data for ${date}...`)
    
    let powerData = null
    let tags = null
    
    if (fs.existsSync(powerDataFile)) {
      const fileData = JSON.parse(fs.readFileSync(powerDataFile, 'utf8'))
      powerData = fileData.data || fileData
      console.log(`   ✅ Loaded ${powerData.length} power data points`)
    }
    
    if (fs.existsSync(tagsFile)) {
      const fileData = JSON.parse(fs.readFileSync(tagsFile, 'utf8'))
      tags = fileData.entries || fileData
      console.log(`   ✅ Loaded ${tags.length} tags`)
    }
    
    if (!powerData) {
      console.log(`   ❌ No power data found for ${date}`)
      return res.status(404).json({ 
        error: 'Power data not found',
        message: 'No power data for this date'
      })
    }
    
    res.json({
      success: true,
      powerData,
      tags,
      date
    })
  } catch (error) {
    console.error('Load data error:', error)
    res.status(500).json({ error: 'Failed to load data', message: error.message })
  }
})

// Check if cached predictions and power data exist for a date
app.get('/api/predictions/check/:date', async (req, res) => {
  try {
    const { date } = req.params
    const dataDir = path.join(__dirname, '..', 'data')
    
    const predictionsFile = path.join(dataDir, `predictions-${date}.json`)
    const powerDataFile = path.join(dataDir, `power-data-${date}.json`)
    
    const hasPredictions = fs.existsSync(predictionsFile)
    const hasPowerData = fs.existsSync(powerDataFile)
    
    res.json({
      hasCachedData: hasPredictions && hasPowerData,
      hasPredictions,
      hasPowerData,
      date
    })
  } catch (error) {
    console.error('Check predictions error:', error)
    res.status(500).json({ error: 'Failed to check predictions', message: error.message })
  }
})

// Load cached predictions and power data for a date
app.get('/api/predictions/load/:date', async (req, res) => {
  try {
    const { date } = req.params
    const dataDir = path.join(__dirname, '..', 'data')
    
    const predictionsFile = path.join(dataDir, `predictions-${date}.json`)
    const powerDataFile = path.join(dataDir, `power-data-${date}.json`)
    
    if (!fs.existsSync(predictionsFile) || !fs.existsSync(powerDataFile)) {
      return res.status(404).json({ 
        error: 'Cached data not found',
        message: 'No cached predictions or power data for this date'
      })
    }
    
    const predictions = JSON.parse(fs.readFileSync(predictionsFile, 'utf8'))
    const powerData = JSON.parse(fs.readFileSync(powerDataFile, 'utf8'))
    
    res.json({
      success: true,
      predictions: predictions.predictions || predictions,
      powerData: powerData.data || powerData,
      metadata: predictions.metadata || {},
      date
    })
  } catch (error) {
    console.error('Load predictions error:', error)
    res.status(500).json({ error: 'Failed to load predictions', message: error.message })
  }
})

// Save predictions for a date
app.post('/api/predictions/save', async (req, res) => {
  try {
    const { date, predictions, powerData, metadata } = req.body
    
    if (!date || !predictions) {
      return res.status(400).json({ error: 'Missing date or predictions' })
    }
    
    const dataDir = path.join(__dirname, '..', 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    
    // Save predictions file
    const predictionsFile = path.join(dataDir, `predictions-${date}.json`)
    const predictionsData = {
      date,
      savedAt: new Date().toISOString(),
      metadata: metadata || {},
      predictions
    }
    fs.writeFileSync(predictionsFile, JSON.stringify(predictionsData, null, 2), 'utf8')
    
    // Save power data file if provided and doesn't exist
    if (powerData) {
      const powerDataFile = path.join(dataDir, `power-data-${date}.json`)
      if (!fs.existsSync(powerDataFile)) {
        const powerExportData = {
          date,
          dataPoints: powerData.length,
          data: powerData
        }
        fs.writeFileSync(powerDataFile, JSON.stringify(powerExportData, null, 2), 'utf8')
      }
    }
    
    console.log(`✅ Saved predictions for ${date} (${predictions.length} windows)`)
    
    res.json({
      success: true,
      message: `Predictions saved for ${date}`,
      predictionsCount: predictions.length
    })
  } catch (error) {
    console.error('Save predictions error:', error)
    res.status(500).json({ error: 'Failed to save predictions', message: error.message })
  }
})

// ===== ML ENDPOINTS =====

// Get available tags from all data files
app.get('/api/ml/available-tags', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, '..', 'data')
    const allTags = new Set()

    // Read all tag files
    const files = fs.readdirSync(dataDir)
    const tagFiles = files.filter(f => f.startsWith('power-tags-') && f.endsWith('.json'))

    for (const file of tagFiles) {
      const filePath = path.join(dataDir, file)
      const content = fs.readFileSync(filePath, 'utf8')
      const tagData = JSON.parse(content)

      if (tagData.entries && Array.isArray(tagData.entries)) {
        for (const entry of tagData.entries) {
          // Split comma-separated tags and trim
          const tags = entry.label.split(',').map(tag => tag.trim())
          tags.forEach(tag => allTags.add(tag))
        }
      }
    }

    const uniqueTags = Array.from(allTags).sort()
    res.json({ tags: uniqueTags })
  } catch (error) {
    console.error('Failed to get available tags:', error)
    res.status(500).json({ error: 'Failed to get available tags', message: error.message })
  }
})

// Stop ML model training
app.post('/api/ml/stop', async (req, res) => {
  if (!trainingInProgress) {
    return res.status(400).json({ error: 'No training in progress' })
  }

  if (mlModel && mlModel.model) {
    console.log('🛑 Stopping training...')
    mlModel.model.stopTraining = true
    res.json({ message: 'Training stop requested' })
  } else {
    res.status(400).json({ error: 'Model not available' })
  }
})

// Train ML model
app.post('/api/ml/train', async (req, res) => {
  if (trainingInProgress) {
    return res.status(409).json({ error: 'Training already in progress' })
  }

  try {
    trainingInProgress = true
    trainingHistory = []
    
    // Get model name, appliance (for seq2point), selected tags, date range, and early stopping config from request body
    const { name, appliance, windowLength, batchSize: reqBatchSize, selectedTags, startDate, endDate, earlyStoppingEnabled, patience, minDelta, maxEpochs } = req.body
    const modelName = name || ''
    
    // Check if this is seq2point training (appliance specified) or tag classification
    const isSeq2Point = !!appliance
    
    if (isSeq2Point) {
      // SEQ2POINT TRAINING PATH
      console.log('🧠 Starting seq2point model training...')
      console.log(`   Model name: ${modelName}`)
      console.log(`   Appliance: ${appliance}`)
      console.log(`   Window length: ${windowLength || 599}`)
      console.log(`   Batch size: ${reqBatchSize || 1000}`)
      if (startDate || endDate) {
        console.log(`   Date range: ${startDate || 'any'} to ${endDate || 'any'}`)
      }
      if (earlyStoppingEnabled) {
        console.log(`   Early stopping: enabled (patience=${patience || 5}, minDelta=${minDelta || 0.0001})`)
      }

      // Set up SSE for streaming training progress
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      // Send initial log
      res.write(`data: ${JSON.stringify({ log: 'info', message: 'Starting data preparation...' })}\n\n`)

      // Import seq2point preprocessing
      const { prepareSeq2PointDataset } = await import('./ml/seq2pointPreprocessing.js')
      
      // Load and prepare data
      const dataDir = path.join(__dirname, '..', 'data')
      res.write(`data: ${JSON.stringify({ log: 'info', message: `Loading data for appliance: ${appliance}` })}\n\n`)
      
      const dataset = await prepareSeq2PointDataset(
        dataDir,
        appliance,
        {
          windowLength: windowLength || 599,
          startDate: startDate,
          endDate: endDate
        }
      )

      if (!dataset || dataset.xTrain.shape[0] === 0) {
        throw new Error(`No training data found for appliance: ${appliance}`)
      }

      console.log(`📊 Dataset prepared:`)
      console.log(`   Training samples: ${dataset.xTrain.shape[0]}`)
      console.log(`   Validation samples: ${dataset.xVal.shape[0]}`)
      console.log(`   Mains stats: mean=${dataset.mainsStats.mean.toFixed(2)}, std=${dataset.mainsStats.std.toFixed(2)}`)
      console.log(`   Appliance stats: mean=${dataset.applianceStats.mean.toFixed(2)}, std=${dataset.applianceStats.std.toFixed(2)}`)

      // Send dataset preparation logs to frontend
      res.write(`data: ${JSON.stringify({ 
        log: 'success', 
        message: `Dataset prepared: ${dataset.xTrain.shape[0]} training samples, ${dataset.xVal.shape[0]} validation samples` 
      })}\n\n`)
      res.write(`data: ${JSON.stringify({ 
        log: 'info', 
        message: `Mains stats: mean=${dataset.mainsStats.mean.toFixed(2)}, std=${dataset.mainsStats.std.toFixed(2)}` 
      })}\n\n`)
      res.write(`data: ${JSON.stringify({ 
        log: 'info', 
        message: `Appliance stats: mean=${dataset.applianceStats.mean.toFixed(2)}, std=${dataset.applianceStats.std.toFixed(2)}` 
      })}\n\n`)
      res.write(`data: ${JSON.stringify({ log: 'info', message: 'Building neural network model...' })}\n\n`)

      // Build seq2point model
      mlModel = createModel()
      if (MODEL_TYPE === 'MSDCPredictor') {
        mlModel.buildModel(MSDC_ARCHITECTURE, windowLength || 599, 3, MSDC_LITE) // MSDC with state classification
      } else {
        mlModel.buildModel(windowLength || 599, 1) // seq2point: single output for regression
      }

      res.write(`data: ${JSON.stringify({ log: 'success', message: 'Model built successfully. Starting training...' })}\n\n`)

      // Training callback for seq2point
      const onEpochEnd = async (epoch, logs, stoppedEarly) => {
        const mae = logs.meanAbsoluteError || logs.mae || 0
        const valMae = logs.val_meanAbsoluteError || logs.val_mae || 0
        
        const progress = {
          epoch: epoch + 1,
          loss: logs.loss,
          mae: mae,
          valLoss: logs.val_loss,
          valMae: valMae,
          stoppedEarly: stoppedEarly || false
        }
        trainingHistory.push(progress)

        // Send progress via SSE
        res.write(`data: ${JSON.stringify(progress)}\n\n`)
      }

      // Train the model
      const epochs = parseInt(maxEpochs) || 30
      const batchSize = parseInt(reqBatchSize) || 1000
      
      // Configure early stopping
      const earlyStoppingConfig = earlyStoppingEnabled ? {
        patience: parseInt(patience) || 5,
        minDelta: parseFloat(minDelta) || 0.0001
      } : null

      // Prepare model directory for auto-save (seq2point models go to saved_models)
      const modelId = `seq2point_${sanitizeApplianceName(appliance)}_model`
      const modelsBaseDir = path.join(__dirname, 'ml', 'saved_models')
      const modelDir = path.join(modelsBaseDir, modelId)
      
      if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true })
      }

      // Train with auto-save enabled
      await mlModel.train(
        dataset.xTrain,
        dataset.yTrain,
        dataset.xVal,
        dataset.yVal,
        epochs,
        batchSize,
        onEpochEnd,
        earlyStoppingConfig,
        modelDir
      )

      // Calculate final metrics
      const finalMetrics = trainingHistory[trainingHistory.length - 1]

      // Detect model output type
      const hasOnOffOutput = mlModel.model && mlModel.model.outputs && mlModel.model.outputs.length === 2

      // Save metadata
      const metadata = {
        id: modelId,
        name: modelName,
        appliance: appliance,
        windowLength: windowLength || 599,
        mainsStats: dataset.mainsStats,
        applianceStats: dataset.applianceStats,
        createdAt: new Date().toISOString(),
        trainedAt: new Date().toISOString(),
        trainingHistory: trainingHistory,
        hasOnOffOutput: hasOnOffOutput,
        trainingConfig: {
          windowLength: windowLength || 599,
          batchSize: batchSize,
          maxEpochs: epochs,
          earlyStoppingEnabled: earlyStoppingEnabled || false,
          patience: patience || null,
          minDelta: minDelta || null,
          actualEpochs: trainingHistory.length
        },
        datasetInfo: {
          numberOfDays: dataset.numberOfDays,
          totalSamples: dataset.xTrain.shape[0] + dataset.xVal.shape[0],
          trainSamples: dataset.xTrain.shape[0],
          valSamples: dataset.xVal.shape[0],
          dateRange: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        },
        finalMetrics: {
          loss: finalMetrics.loss,
          mae: finalMetrics.mae,
          valLoss: finalMetrics.valLoss,
          valMae: finalMetrics.valMae
        },
        modelType: 'seq2point',
        trainSamples: dataset.xTrain.shape[0],
        valSamples: dataset.xVal.shape[0],
        valMAE: finalMetrics.valMae
      }
      
      fs.writeFileSync(
        path.join(modelDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      )

      // Set as current model
      currentModelId = modelId
      trainingMetadata = metadata

      // Clean up tensors (check if they exist and have dispose method)
      if (dataset.xTrain && typeof dataset.xTrain.dispose === 'function') {
        dataset.xTrain.dispose()
      }
      if (dataset.yTrain && typeof dataset.yTrain.dispose === 'function') {
        dataset.yTrain.dispose()
      }
      if (dataset.xVal && typeof dataset.xVal.dispose === 'function') {
        dataset.xVal.dispose()
      }
      if (dataset.yVal && typeof dataset.yVal.dispose === 'function') {
        dataset.yVal.dispose()
      }

      // Send completion message
      res.write(`data: ${JSON.stringify({ done: true, message: 'Training completed successfully' })}\n\n`)
      res.end()

      trainingInProgress = false
      console.log('✅ Seq2point model training completed')

    } else {
      // TAG CLASSIFICATION TRAINING PATH (ORIGINAL)
      const tagsToTrain = selectedTags && selectedTags.length > 0 ? selectedTags : null

      console.log('🧠 Starting ML model training...')
      if (modelName) {
        console.log(`   Model name: ${modelName}`)
      }
      if (tagsToTrain) {
        console.log(`   Selected tags (${tagsToTrain.length}): ${tagsToTrain.join(', ')}`)
      } else {
        console.log(`   Training on all available tags`)
      }
      if (startDate || endDate) {
        console.log(`   Date range: ${startDate || 'any'} to ${endDate || 'any'}`)
      }
      if (earlyStoppingEnabled) {
        console.log(`   Early stopping: enabled (patience=${patience || 5}, minDelta=${minDelta || 0.0001})`)
      }

      // Load all data from data folder with optional date filtering
      const dataDir = path.join(__dirname, '..', 'data')
      const datasets = loadAllData(dataDir, startDate, endDate)

      if (datasets.length === 0) {
        throw new Error('No training data found in data folder')
      }

      // Prepare training data with 5-minute step to reduce data leakage
      const { xData, yData, uniqueTags, stats } = prepareTrainingData(
        datasets,
        5,  // numWindows (5 x 10min = 50min lookback)
        10, // windowSizeMinutes
        60, // pointsPerWindow
        1,  // stepSizeMinutes (1-minute step to reduce overfitting)
        tagsToTrain // selectedTags filter
      )
      mlTags = uniqueTags
      mlStats = stats

      // Create tensors
      const { xTrain, yTrain, xVal, yVal } = createTensors(xData, yData, 0.8)

      // Build model with multi-label classification
      mlModel = createModel()
      mlModel.setTags(uniqueTags)
      mlModel.buildModel(300, 1, uniqueTags.length) // 300 = 5 windows * 60 points per window

      // Set up SSE for streaming training progress
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      // Training callback
      const onEpochEnd = async (epoch, logs, stoppedEarly) => {
        const acc = logs.binaryAccuracy || logs.acc || 0
        const valAcc = logs.val_binaryAccuracy || logs.val_acc || 0
        
        const progress = {
          epoch: epoch + 1,
          loss: logs.loss,
          accuracy: acc,
          valLoss: logs.val_loss,
          valAccuracy: valAcc,
          stoppedEarly: stoppedEarly || false
        }
        trainingHistory.push(progress)

        // Send progress via SSE
        res.write(`data: ${JSON.stringify(progress)}\n\n`)
      }

      // Train the model (more epochs for multi-label classification)
      const epochs = parseInt(maxEpochs) || 30
      const batchSize = 512 
      
      // Configure early stopping
      const earlyStoppingConfig = earlyStoppingEnabled ? {
        patience: parseInt(patience) || 5,
        minDelta: parseFloat(minDelta) || 0.0001
      } : null

      // Prepare model directory for auto-save
      const modelId = Date.now().toString()
      const modelsBaseDir = path.join(__dirname, 'ml', 'models')
      const modelDir = path.join(modelsBaseDir, modelId)
      
      if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true })
      }

      // Train with auto-save enabled
      await mlModel.train(xTrain, yTrain, xVal, yVal, epochs, batchSize, onEpochEnd, earlyStoppingConfig, modelDir)

      // Calculate final metrics
      const finalMetrics = trainingHistory[trainingHistory.length - 1]

      // Save metadata
      const metadata = {
        id: modelId,
        name: modelName,
        uniqueTags: mlTags,
        stats: mlStats,
        trainedAt: new Date().toISOString(),
        trainingHistory: trainingHistory,
        datasetInfo: {
          numberOfDays: datasets.length,
          dates: datasets.map(d => d.date),
          totalSamples: xData.length
        },
        finalMetrics: {
          loss: finalMetrics.loss,
          accuracy: finalMetrics.accuracy,
          valLoss: finalMetrics.valLoss,
          valAccuracy: finalMetrics.valAccuracy
        },
        modelType: 'classification'
      }
      
      fs.writeFileSync(
        path.join(modelDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      )

      // Set as current model
      currentModelId = modelId
      trainingMetadata = metadata

      // Clean up tensors
      xTrain.dispose()
      yTrain.dispose()
      xVal.dispose()
      yVal.dispose()

      // Send completion message
      res.write(`data: ${JSON.stringify({ done: true, message: 'Training completed successfully' })}\n\n`)
      res.end()

      trainingInProgress = false
      console.log('✅ ML model training completed')
    }

  } catch (error) {
    console.error('ML Training error:', error)
    trainingInProgress = false

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to train model',
        message: error.message
      })
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
      res.end()
    }
  }
})

// Get training status
app.get('/api/ml/status', (req, res) => {
  res.json({
    trainingInProgress,
    modelLoaded: mlModel !== null,
    tags: mlTags,
    historyLength: trainingHistory.length,
    metadata: trainingMetadata,
    currentModelId: currentModelId
  })
})

// Get training history
app.get('/api/ml/history', (req, res) => {
  res.json({
    history: trainingHistory,
    tags: mlTags,
    stats: mlStats
  })
})

// List all saved models
app.get('/api/ml/models', (req, res) => {
  try {
    const models = []
    
    // Check both 'models' (UI-trained) and 'saved_models' (CLI-trained seq2point) directories
    const modelsBaseDir = path.join(__dirname, 'ml', 'models')
    const savedModelsDir = path.join(__dirname, 'ml', 'saved_models')
    
    // Scan UI-trained models (classification and seq2point from UI)
    if (fs.existsSync(modelsBaseDir)) {
      const modelDirs = fs.readdirSync(modelsBaseDir).filter(item => {
        const itemPath = path.join(modelsBaseDir, item)
        return fs.statSync(itemPath).isDirectory()
      })

      for (const modelId of modelDirs) {
        const metadataPath = path.join(modelsBaseDir, modelId, 'metadata.json')
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
            models.push({
              id: modelId,
              name: metadata.name || '',
              appliance: metadata.appliance,
              trainedAt: metadata.trainedAt,
              uniqueTags: metadata.uniqueTags,
              datasetInfo: metadata.datasetInfo,
              finalMetrics: metadata.finalMetrics,
              modelType: metadata.modelType || 'classification',
              isActive: modelId === currentModelId
            })
          } catch (err) {
            console.warn(`Failed to load metadata for model ${modelId}:`, err.message)
          }
        }
      }
    }

    // Scan CLI-trained seq2point models
    if (fs.existsSync(savedModelsDir)) {
      const modelDirs = fs.readdirSync(savedModelsDir).filter(item => {
        const itemPath = path.join(savedModelsDir, item)
        return fs.statSync(itemPath).isDirectory() && item.startsWith('seq2point_')
      })

      for (const modelDir of modelDirs) {
        const metadataPath = path.join(savedModelsDir, modelDir, 'metadata.json')
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
            const appliance = metadata.appliance || modelDir.replace('seq2point_', '').replace('_model', '')
            
            models.push({
              id: modelDir,
              name: appliance.charAt(0).toUpperCase() + appliance.slice(1), // Use appliance name as model name
              appliance: appliance,
              trainedAt: metadata.createdAt || metadata.trainedAt, // Use createdAt for CLI models
              datasetInfo: {
                numberOfDays: metadata.samplesPerDay?.length || 0,
                totalSamples: metadata.trainSamples + metadata.valSamples,
                trainSamples: metadata.trainSamples,
                valSamples: metadata.valSamples
              },
              finalMetrics: {
                valMae: metadata.valMAE || metadata.val_mae
              },
              modelType: 'seq2point',
              windowLength: metadata.windowLength,
              isActive: false, // CLI models are not loaded by default
              source: 'cli' // Mark as CLI-trained
            })
          } catch (err) {
            console.warn(`Failed to load metadata for model ${modelDir}:`, err.message)
          }
        }
      }
    }

    // Sort by trained date (newest first)
    models.sort((a, b) => new Date(b.trainedAt) - new Date(a.trainedAt))

    res.json(models)
  } catch (error) {
    console.error('Error listing models:', error)
    res.status(500).json({ error: 'Failed to list models', message: error.message })
  }
})

// Load a specific model
app.post('/api/ml/models/load', async (req, res) => {
  try {
    const { modelId } = req.body

    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' })
    }

    // Check both directories
    let modelPath, metadataPath, isSeq2Point = false
    
    // First check UI-trained models
    const modelsDir = path.join(__dirname, 'ml', 'models')
    modelPath = path.join(modelsDir, modelId)
    metadataPath = path.join(modelPath, 'metadata.json')
    
    // If not found, check CLI-trained seq2point models
    if (!fs.existsSync(modelPath) || !fs.existsSync(metadataPath)) {
      const savedModelsDir = path.join(__dirname, 'ml', 'saved_models')
      modelPath = path.join(savedModelsDir, modelId)
      metadataPath = path.join(modelPath, 'metadata.json')
      isSeq2Point = true
    }

    if (!fs.existsSync(modelPath) || !fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: 'Model not found' })
    }

    // Load metadata
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

    // Load the model
    mlModel = createModel()
    await mlModel.load(modelPath)
    
    if (isSeq2Point || metadata.modelType === 'seq2point') {
      // For seq2point models, set appliance-specific normalization
      mlModel.applianceMean = metadata.applianceStats?.mean || 0
      mlModel.applianceStd = metadata.applianceStats?.std || 1
      mlModel.mainsMean = metadata.mainsStats?.mean || 0
      mlModel.mainsStd = metadata.mainsStats?.std || 1
      mlStats = {
        mainsStats: metadata.mainsStats,
        applianceStats: metadata.applianceStats
      }
      mlTags = [metadata.appliance]
    } else {
      // For classification models
      mlModel.setTags(metadata.uniqueTags)
      mlTags = metadata.uniqueTags
      mlStats = metadata.stats
    }

    // Update state
    trainingHistory = metadata.trainingHistory || []
    trainingMetadata = metadata
    currentModelId = modelId

    console.log(`✅ Loaded model ${modelId} from ${metadata.trainedAt || metadata.createdAt}`)

    res.json({ 
      success: true, 
      message: 'Model loaded successfully',
      metadata: metadata
    })
  } catch (error) {
    console.error('Error loading model:', error)
    res.status(500).json({ error: 'Failed to load model', message: error.message })
  }
})

// Update model name
app.patch('/api/ml/models/:modelId/name', (req, res) => {
  try {
    const { modelId } = req.params
    const { name } = req.body

    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' })
    }

    // Check both directories
    let modelPath, metadataPath
    
    const modelsDir = path.join(__dirname, 'ml', 'models')
    modelPath = path.join(modelsDir, modelId)
    metadataPath = path.join(modelPath, 'metadata.json')
    
    // If not found, check CLI-trained models
    if (!fs.existsSync(metadataPath)) {
      const savedModelsDir = path.join(__dirname, 'ml', 'saved_models')
      modelPath = path.join(savedModelsDir, modelId)
      metadataPath = path.join(modelPath, 'metadata.json')
    }

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: 'Model not found' })
    }

    // Load metadata
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    
    // Update name
    metadata.name = name || ''
    
    // Save updated metadata
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

    // Update in-memory metadata if this is the current model
    if (modelId === currentModelId && trainingMetadata) {
      trainingMetadata.name = name || ''
    }

    console.log(`✏️ Updated model ${modelId} name to: ${name}`)

    res.json({ success: true, message: 'Model name updated successfully', name })
  } catch (error) {
    console.error('Error updating model name:', error)
    res.status(500).json({ error: 'Failed to update model name', message: error.message })
  }
})

// Delete a model
app.delete('/api/ml/models/:modelId', (req, res) => {
  try {
    const { modelId } = req.params

    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' })
    }

    if (modelId === currentModelId) {
      return res.status(400).json({ error: 'Cannot delete the currently active model' })
    }

    // Check both directories
    let modelPath
    
    const modelsDir = path.join(__dirname, 'ml', 'models')
    modelPath = path.join(modelsDir, modelId)
    
    // If not found, check CLI-trained models
    if (!fs.existsSync(modelPath)) {
      const savedModelsDir = path.join(__dirname, 'ml', 'saved_models')
      modelPath = path.join(savedModelsDir, modelId)
    }

    if (!fs.existsSync(modelPath)) {
      return res.status(404).json({ error: 'Model not found' })
    }

    // Delete the model directory
    fs.rmSync(modelPath, { recursive: true, force: true })

    console.log(`🗑️ Deleted model ${modelId}`)

    res.json({ success: true, message: 'Model deleted successfully' })
  } catch (error) {
    console.error('Error deleting model:', error)
    res.status(500).json({ error: 'Failed to delete model', message: error.message })
  }
})

// Predict tags for next 10 minutes
app.post('/api/ml/predict', async (req, res) => {
  try {
    const { powerData } = req.body

    if (!powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing or invalid powerData array' })
    }

    // Load model if not in memory
    if (!mlModel) {
      // Use current model ID, or find most recent model
      let modelDir
      if (currentModelId) {
        modelDir = path.join(__dirname, 'ml', 'models', currentModelId)
      } else {
        // Find most recent model
        const modelsDir = path.join(__dirname, 'ml', 'models')
        if (!fs.existsSync(modelsDir)) {
          return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
        }
        
        const modelDirs = fs.readdirSync(modelsDir)
          .filter(item => fs.statSync(path.join(modelsDir, item)).isDirectory())
          .sort((a, b) => parseInt(b) - parseInt(a)) // Sort by timestamp (newest first)
        
        if (modelDirs.length === 0) {
          return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
        }
        
        currentModelId = modelDirs[0]
        modelDir = path.join(modelsDir, currentModelId)
      }
      
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      mlTags = metadata.uniqueTags
      mlStats = metadata.stats

      mlModel = createModel()
      mlModel.setTags(mlTags)
      await mlModel.load(modelDir)

      console.log(`✅ ML model loaded from disk (ID: ${currentModelId})`)
    }

    // Prepare input (last 50 minutes of data)
    const inputTensor = preparePredictionInput(powerData, mlStats)

    // Make prediction
    const predictions = await mlModel.predict(inputTensor)
    const predictionArray = await predictions.array()

    // Get probabilities for each tag
    const tagProbabilities = mlTags.map((tag, idx) => ({
      tag,
      probability: predictionArray[0][idx]
    }))

    // Sort by probability
    tagProbabilities.sort((a, b) => b.probability - a.probability)

    // Multi-label: get all tags above threshold (0.3)
    const predictedTags = tagProbabilities.filter(t => t.probability >= 0.3)
    
    // For backward compatibility, also include the top tag
    const predictedTag = tagProbabilities[0].tag
    const confidence = tagProbabilities[0].probability

    // Clean up
    inputTensor.dispose()
    predictions.dispose()

    res.json({
      predictedTag,
      confidence,
      predictedTags, // Array of all tags above threshold
      allProbabilities: tagProbabilities
    })

  } catch (error) {
    console.error('ML Prediction error:', error)
    res.status(500).json({
      error: 'Failed to make prediction',
      message: error.message
    })
  }
})

// Predict tags for entire day using sliding windows with new predictor
app.post('/api/ml/predict-day-sliding', async (req, res) => {
  try {
    const { date, powerData, stepSize = 5, threshold = 0.3 } = req.body

    if (!date || !powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing date or powerData array' })
    }

    // Check if client wants SSE (Server-Sent Events)
    const wantsSSE = req.headers.accept === 'text/event-stream'
    
    // Set up SSE if requested
    const sendProgress = wantsSSE ? (message) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`)
    } : () => {}
    
    if (wantsSSE) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
    }

    // Load model if not in memory
    if (!mlModel) {
      sendProgress('Loading ML model...')
      
      // Use current model ID, or find most recent model
      let modelDir
      if (currentModelId) {
        modelDir = path.join(__dirname, 'ml', 'models', currentModelId)
      } else {
        // Find most recent model
        const modelsDir = path.join(__dirname, 'ml', 'models')
        if (!fs.existsSync(modelsDir)) {
          if (wantsSSE) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'No trained model found. Please train the model first.' })}\n\n`)
            return res.end()
          }
          return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
        }
        
        const modelDirs = fs.readdirSync(modelsDir)
          .filter(item => fs.statSync(path.join(modelsDir, item)).isDirectory())
          .sort((a, b) => parseInt(b) - parseInt(a)) // Sort by timestamp (newest first)
        
        if (modelDirs.length === 0) {
          if (wantsSSE) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'No trained model found. Please train the model first.' })}\n\n`)
            return res.end()
          }
          return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
        }
        
        currentModelId = modelDirs[0]
        modelDir = path.join(modelsDir, currentModelId)
      }
      
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        if (wantsSSE) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'No trained model found. Please train the model first.' })}\n\n`)
          return res.end()
        }
        return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      mlTags = metadata.uniqueTags
      mlStats = metadata.stats

      mlModel = createModel()
      mlModel.setTags(mlTags)
      await mlModel.load(modelDir)

      console.log(`✅ ML model loaded from disk (ID: ${currentModelId})`)
    }

    sendProgress('Preprocessing power data...')
    console.log(`Making sliding window predictions for ${date} with step size: ${stepSize} minutes`)

    // Sort and format power data
    const sortedData = powerData.map(d => ({
      timestamp: d.timestamp || d.last_changed || d.last_updated,
      value: d.value || d.state || d.power
    })).filter(d => d.timestamp && d.value).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    if (sortedData.length === 0) {
      if (wantsSSE) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'No valid power data provided' })}\n\n`)
        return res.end()
      }
      return res.status(400).json({ error: 'No valid power data provided' })
    }

    console.log(`Power data info:`)
    console.log(`  Total points: ${sortedData.length}`)
    console.log(`  First timestamp: ${sortedData[0].timestamp}`)
    console.log(`  Last timestamp: ${sortedData[sortedData.length - 1].timestamp}`)

    sendProgress('Creating sliding window predictor...')
    
    // Create sliding window predictor
    const predictor = new SlidingWindowPredictor(
      mlModel.model,  // Pass the TensorFlow model
      mlTags,         // Tag names
      mlStats,        // Normalization stats
      stepSize        // Step size in minutes
    )

    sendProgress('Running predictions on sliding windows...')
    
    // Make predictions
    const targetDate = new Date(date)
    const predictions = await predictor.predictDay(sortedData, targetDate, threshold)
    
    sendProgress('Calculating energy statistics...')
    
    // Calculate standby baseline power as minimum power of the day
    let standbyBaseline = 0
    if (predictions.length > 0) {
      // Filter out zero/invalid values and get minimum
      const validPowers = predictions
        .map(p => p.avgPower)
        .filter(p => p != null && p > 0)
      
      if (validPowers.length > 0) {
        standbyBaseline = Math.min(...validPowers)
        console.log(`📊 Calculated standby baseline: ${standbyBaseline.toFixed(2)} W (minimum power of day from ${validPowers.length} windows)`)
      }
    }

    // Adjust energy calculations: subtract standby from appliance consumption
    // Also filter tags based on threshold
    const adjustedPredictions = predictions.map(p => {
      const isStandby = p.tag === 'standby' || (p.tags && p.tags.some(t => t.tag === 'standby'))
      
      // Filter allProbabilities based on threshold and convert to tags format
      let filteredTags = []
      if (p.allProbabilities && Array.isArray(p.allProbabilities)) {
        filteredTags = p.allProbabilities
          .filter(prob => prob.probability >= threshold)
          .map(prob => ({
            tag: prob.tag,
            probability: prob.probability,
            prob: prob.probability // Keep both for compatibility
          }))
      }
      
      if (!isStandby && standbyBaseline > 0) {
        // Keep original avgPower (total consumption)
        // But calculate appliance-only energy by subtracting standby
        const appliancePower = Math.max(0, p.avgPower - standbyBaseline)
        const applianceEnergy = appliancePower * (stepSize / 60) // Energy from appliance only
        const standbyEnergy = standbyBaseline * (stepSize / 60) // Standby energy for this window
        return {
          ...p,
          tags: filteredTags, // Filtered tags based on threshold
          energy: applianceEnergy, // This is the appliance consumption only
          standbyEnergy: standbyEnergy, // Standby consumption for this window
          totalEnergy: p.energy, // Original total energy
          appliancePower: appliancePower,
          standbyBaseline: standbyBaseline
        }
      }
      return {
        ...p,
        tags: filteredTags // Filtered tags based on threshold
      }
    })
    
    // Calculate statistics
    const tagStats = {}
    let totalEnergy = 0
    
    adjustedPredictions.forEach(pred => {
      totalEnergy += pred.energy || 0
      
      if (pred.tags) {
        pred.tags.forEach(t => {
          if (!tagStats[t.tag]) {
            tagStats[t.tag] = { count: 0, totalProb: 0 }
          }
          tagStats[t.tag].count++
          tagStats[t.tag].totalProb += t.probability
        })
      }
    })

    // Calculate average probability for each tag
    Object.keys(tagStats).forEach(tag => {
      tagStats[tag].avgProb = tagStats[tag].totalProb / tagStats[tag].count
    })

    sendProgress('Predictions complete!')
    
    const result = {
      date,
      predictions: adjustedPredictions,
      totalWindows: adjustedPredictions.length,
      tags: mlTags,
      tagStats,
      totalEnergy,
      standbyBaseline: standbyBaseline
    }

    // Send result
    if (wantsSSE) {
      res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`)
      res.end()
    } else {
      res.json(result)
    }

  } catch (error) {
    console.error('Sliding window prediction error:', error)
    
    if (wantsSSE && !res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`)
      res.end()
    } else if (wantsSSE) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`)
      res.end()
    } else {
      res.status(500).json({
        error: 'Failed to make sliding window predictions',
        message: error.message
      })
    }
  }
})

// Predict tags for entire day using sliding windows (LEGACY - kept for backward compatibility)
// NOTE: To predict from midnight (00:00), powerData must include data starting from
// 23:10 the previous day (50 minutes = 5 windows x 10 minutes lookback required)
app.post('/api/ml/predict-day', async (req, res) => {
  try {
    const { date, powerData } = req.body

    if (!date || !powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing date or powerData array' })
    }

    // Load model if not in memory
    if (!mlModel) {
      // Use current model ID, or find most recent model
      let modelDir
      if (currentModelId) {
        modelDir = path.join(__dirname, 'ml', 'models', currentModelId)
      } else {
        // Find most recent model
        const modelsDir = path.join(__dirname, 'ml', 'models')
        if (!fs.existsSync(modelsDir)) {
          return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
        }
        
        const modelDirs = fs.readdirSync(modelsDir)
          .filter(item => fs.statSync(path.join(modelsDir, item)).isDirectory())
          .sort((a, b) => parseInt(b) - parseInt(a)) // Sort by timestamp (newest first)
        
        if (modelDirs.length === 0) {
          return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
        }
        
        currentModelId = modelDirs[0]
        modelDir = path.join(modelsDir, currentModelId)
      }
      
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      mlTags = metadata.uniqueTags
      mlStats = metadata.stats

      mlModel = createModel()
      mlModel.setTags(mlTags)
      await mlModel.load(modelDir)

      console.log(`✅ ML model loaded from disk (ID: ${currentModelId})`)
    }

    console.log(`Making predictions for ${date} with ${powerData.length} data points`)

    // Debug: Check data format
    if (powerData.length > 0) {
      console.log('Sample data point:', JSON.stringify(powerData[0], null, 2))
    }

    // Create 10-minute windows with sliding approach
    const windowSizeMs = 10 * 60 * 1000 // 10 minutes
    const lookbackWindows = 5 // Need 5 previous windows for prediction
    const predictions = []

    // Sort power data by timestamp - handle different property names
    const sortedData = powerData.map(d => ({
      timestamp: d.timestamp || d.last_changed || d.last_updated,
      value: d.value || d.state || d.power
    })).filter(d => d.timestamp && d.value).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    if (sortedData.length === 0) {
      return res.status(400).json({ error: 'No valid power data provided' })
    }

    console.log(`First data point: ${sortedData[0].timestamp}`)
    console.log(`Last data point: ${sortedData[sortedData.length - 1].timestamp}`)

    const startTime = new Date(sortedData[0].timestamp).getTime()
    const endTime = new Date(sortedData[sortedData.length - 1].timestamp).getTime()
    
    const timeRangeHours = (endTime - startTime) / (1000 * 60 * 60)
    console.log(`Time range: ${timeRangeHours.toFixed(2)} hours`)

    // Parse the target date and calculate day boundaries
    const targetDate = new Date(date)
    const dayStartTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
    const dayEndTime = dayStartTime + (24 * 60 * 60 * 1000) // End of day
    
    // First prediction should be at the start of the day (00:00)
    // But we need 50 minutes of lookback data (5 windows * 10 minutes)
    const firstPredictionTime = dayStartTime
    console.log(`First prediction time: ${new Date(firstPredictionTime).toISOString()}`)
    console.log(`Day end time: ${new Date(dayEndTime).toISOString()}`)
    
    // Verify we have enough lookback data
    const requiredLookbackStart = dayStartTime - (lookbackWindows * windowSizeMs)
    const availableDataStart = startTime
    if (availableDataStart > requiredLookbackStart) {
      console.warn(`⚠️  Warning: Data starts at ${new Date(availableDataStart).toISOString()} but we need data from ${new Date(requiredLookbackStart).toISOString()} (23:10 previous day) to predict from midnight`)
    }
    
    let currentTime = firstPredictionTime
    let totalWindows = 0
    let skippedWindows = 0
    
    // Generate predictions only for the target day
    while (currentTime < dayEndTime) {
      totalWindows++
      const windowEnd = currentTime + windowSizeMs
      
      // Get data for the last 50 minutes (5 windows of 10 minutes each)
      const lookbackStart = currentTime - (lookbackWindows * windowSizeMs)
      const historyData = sortedData.filter(d => {
        const t = new Date(d.timestamp).getTime()
        return t >= lookbackStart && t < currentTime
      })

      if (historyData.length >= 10) { // Need at least some data points
        try {
          // Transform data to match expected format (with 'power' property)
          const formattedHistoryData = historyData.map(d => ({
            timestamp: d.timestamp,
            power: parseFloat(d.value)
          }))
          
          console.log(`Window ${new Date(currentTime).toISOString()}: ${formattedHistoryData.length} data points`)
          
          // Create a simplified input preparation that doesn't rely on createWindows
          // We need 5 windows x 60 points = 300 points total
          const targetPoints = 300
          const powers = formattedHistoryData.map(d => d.power)
          
          // Resample to exact number of points needed
          const resampled = []
          for (let i = 0; i < targetPoints; i++) {
            const position = (i / (targetPoints - 1)) * (powers.length - 1)
            const lowerIndex = Math.floor(position)
            const upperIndex = Math.min(Math.ceil(position), powers.length - 1)
            const fraction = position - lowerIndex
            const value = powers[lowerIndex] * (1 - fraction) + powers[upperIndex] * fraction
            resampled.push(value)
          }
          
          // Normalize
          const minPower = mlStats.minPower
          const maxPower = mlStats.maxPower
          const range = maxPower - minPower
          const normalized = resampled.map(p => range > 0 ? (p - minPower) / range : 0)
          
          // Create tensor [1, 300, 1]
          const inputTensor = tf.tensor([normalized]).expandDims(-1)

          // Make prediction
          const predictionTensor = await mlModel.predict(inputTensor)
          const predictionArray = await predictionTensor.array()

          // Get tag probabilities
          const tagProbabilities = mlTags.map((tag, idx) => ({
            tag,
            probability: predictionArray[0][idx]
          }))

          // Sort by probability
          tagProbabilities.sort((a, b) => b.probability - a.probability)

          // Multi-label: get all tags above threshold
          const predictedTags = tagProbabilities.filter(t => t.probability >= 0.3)
          
          // For backward compatibility
          const predictedTag = predictedTags.length > 0 ? predictedTags[0].tag : tagProbabilities[0].tag
          const confidence = predictedTags.length > 0 ? predictedTags[0].probability : tagProbabilities[0].probability

          // Calculate average power and energy for this window
          const windowData = sortedData.filter(d => {
            const t = new Date(d.timestamp).getTime()
            return t >= currentTime && t < windowEnd
          })

          let avgPower = 0
          let energy = 0
          if (windowData.length > 0) {
            const powers = windowData.map(d => parseFloat(d.value))
            avgPower = powers.reduce((sum, p) => sum + p, 0) / powers.length
            // Energy = Power * Time (in Wh)
            // 10 minutes = 1/6 hour
            energy = avgPower * (10 / 60)
          }

          // Format time strings
          const startDate = new Date(currentTime)
          const endDate = new Date(windowEnd)
          const startTimeStr = startDate.toTimeString().substring(0, 5)
          const endTimeStr = endDate.toTimeString().substring(0, 5)

          predictions.push({
            startTime: startTimeStr,
            endTime: endTimeStr,
            tag: predictedTag,
            tags: predictedTags, // Array of all predicted tags
            confidence: confidence,
            avgPower: avgPower,
            energy: energy,
            allProbabilities: tagProbabilities
          })

          // Clean up
          inputTensor.dispose()
          predictionTensor.dispose()

        } catch (err) {
          console.warn(`Prediction failed for window ${new Date(currentTime).toISOString()}:`, err.message)
        }
      } else {
        skippedWindows++
      }

      // Move to next window
      currentTime += windowSizeMs
    }

    console.log(`✅ Generated ${predictions.length} predictions for ${date}`)
    console.log(`Total windows processed: ${totalWindows}, Skipped (insufficient data): ${skippedWindows}`)

    // Calculate standby baseline power as minimum power of the day
    let standbyBaseline = 0
    if (predictions.length > 0) {
      // Filter out zero/invalid values and get minimum
      const validPowers = predictions
        .map(p => p.avgPower)
        .filter(p => p != null && p > 0)
      
      if (validPowers.length > 0) {
        standbyBaseline = Math.min(...validPowers)
        console.log(`📊 Calculated standby baseline: ${standbyBaseline.toFixed(2)} W (minimum power of day from ${validPowers.length} windows)`)
      }
    }

    // Adjust energy calculations: subtract standby from appliance consumption but keep total power
    const adjustedPredictions = predictions.map(p => {
      if (p.tag !== 'standby' && standbyBaseline > 0) {
        // Keep original avgPower (total consumption)
        // But calculate appliance-only energy by subtracting standby
        const appliancePower = Math.max(0, p.avgPower - standbyBaseline)
        const applianceEnergy = appliancePower * (10 / 60) // Energy from appliance only
        const standbyEnergy = standbyBaseline * (10 / 60) // Standby energy for this window
        return {
          ...p,
          energy: applianceEnergy, // This is the appliance consumption only
          standbyEnergy: standbyEnergy, // Standby consumption for this window
          totalEnergy: p.energy, // Original total energy
          appliancePower: appliancePower,
          standbyBaseline: standbyBaseline
        }
      }
      return p
    })

    res.json({
      date,
      predictions: adjustedPredictions,
      totalWindows: adjustedPredictions.length,
      tags: mlTags,
      standbyBaseline: standbyBaseline
    })

  } catch (error) {
    console.error('Day prediction error:', error)
    res.status(500).json({
      error: 'Failed to make predictions',
      message: error.message
    })
  }
})

// ============================================
// Anomaly Detection Endpoints
// ============================================

// Get available tags from predictions for anomaly detection
app.get('/api/anomaly/tags', (req, res) => {
  try {
    const dataDir = path.join(__dirname, '..', 'data')
    const allTags = new Set()

    // Read all tag files to get available tags
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir)
      const tagFiles = files.filter(f => f.startsWith('power-tags-') && f.endsWith('.json'))

      for (const file of tagFiles) {
        const filePath = path.join(dataDir, file)
        const content = fs.readFileSync(filePath, 'utf8')
        const tagData = JSON.parse(content)

        if (tagData.entries && Array.isArray(tagData.entries)) {
          for (const entry of tagData.entries) {
            // Split comma-separated tags and trim
            const tags = entry.label.split(',').map(tag => tag.trim())
            tags.forEach(tag => allTags.add(tag))
          }
        }
      }
    }

    const uniqueTags = Array.from(allTags).sort()
    
    // Check for available seq2point models with trained autoencoders
    const trainedModels = []
    const modelsDir = path.join(__dirname, 'ml', 'saved_models')
    
    if (fs.existsSync(modelsDir)) {
      const modelDirs = fs.readdirSync(modelsDir)
        .filter(name => name.startsWith('seq2point_') && name.endsWith('_model'))
      
      for (const dirName of modelDirs) {
        const modelPath = path.join(modelsDir, dirName)
        const autoencoderPath = path.join(modelPath, 'autoencoder', 'model.json')
        
        // Only include if autoencoder is trained
        if (fs.existsSync(autoencoderPath)) {
          // Extract appliance name from directory name and convert back to tag format
          // seq2point_water_heater_model -> water heater
          const appliance = dirName
            .replace('seq2point_', '')
            .replace('_model', '')
            .replace(/_/g, ' ') // Convert underscores back to spaces
          trainedModels.push(appliance)
        }
      }
    }
    
    console.log('Available tags:', uniqueTags)
    console.log('Trained models (with autoencoders):', trainedModels)
    
    res.json({
      tags: uniqueTags,
      availableModels: trainedModels
    })
  } catch (error) {
    console.error('Error fetching tags:', error)
    res.status(500).json({ error: 'Failed to fetch tags', message: error.message })
  }
})

// Get predictions for a specific tag on a given date
app.post('/api/anomaly/tag-predictions', async (req, res) => {
  const { sessionId, date, tag, entityId } = req.body

  if (!sessionId || !date || !tag) {
    return res.status(400).json({ error: 'Missing sessionId, date, or tag' })
  }

  try {
    const connection = haConnections.get(sessionId)
    if (!connection) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    // Load model if not in memory
    if (!mlModel || !mlStats || mlTags.length === 0) {
      // Use current model ID, or find most recent model
      let modelDir
      if (currentModelId) {
        modelDir = path.join(__dirname, 'ml', 'models', currentModelId)
      } else {
        // Find most recent model
        const modelsDir = path.join(__dirname, 'ml', 'models')
        if (!fs.existsSync(modelsDir)) {
          return res.status(400).json({ 
            error: 'No trained model available',
            message: 'Please train a model first in the ML Trainer tab'
          })
        }
        
        const modelDirs = fs.readdirSync(modelsDir)
          .filter(item => fs.statSync(path.join(modelsDir, item)).isDirectory())
          .sort((a, b) => parseInt(b) - parseInt(a)) // Sort by timestamp (newest first)
        
        if (modelDirs.length === 0) {
          return res.status(400).json({ 
            error: 'No trained model available',
            message: 'Please train a model first in the ML Trainer tab'
          })
        }
        
        currentModelId = modelDirs[0]
        modelDir = path.join(modelsDir, currentModelId)
      }
      
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        return res.status(400).json({ 
          error: 'No trained model available',
          message: 'Please train a model first in the ML Trainer tab'
        })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      mlTags = metadata.uniqueTags
      mlStats = metadata.stats

      mlModel = createModel()
      mlModel.setTags(mlTags)
      await mlModel.load(modelDir)

      console.log(`✅ ML model loaded from disk for tag predictions (ID: ${currentModelId})`)
    }

    console.log(`🔍 Fetching predictions for tag "${tag}" on ${date}`)

    // Parse date
    const targetDate = new Date(date)
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    // Fetch power data for the day
    const historyUrl = `${connection.url}/api/history/period/${dayStart.toISOString()}`
    const params = new URLSearchParams({
      filter_entity_id: entityId || connection.entityId,
      end_time: dayEnd.toISOString(),
      minimal_response: 'true',
      no_attributes: 'true'
    })

    const response = await fetch(`${historyUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${connection.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`)
    }

    const history = await response.json()
    
    if (!history[0] || history[0].length === 0) {
      return res.json({ tag, date, windows: [], message: 'No data available for this date' })
    }

    // Convert history to sorted data
    const sortedData = history[0]
      .filter(state => state.state !== 'unavailable' && state.state !== 'unknown')
      .map(state => ({
        timestamp: new Date(state.last_changed).getTime(),
        value: parseFloat(state.state)
      }))
      .filter(d => !isNaN(d.value))
      .sort((a, b) => a.timestamp - b.timestamp)

    // Use sliding window predictor for consistent predictions
    const slidingPredictor = new SlidingWindowPredictor(mlModel.model, mlTags, mlStats, 10)
    const predictions = await slidingPredictor.predictDay(sortedData, targetDate, 0.3)

    // Filter predictions for the selected tag
    const tagPredictions = predictions.filter(p => 
      p.tag === tag || (p.activeTags && p.activeTags.includes(tag))
    )

    // Extract power curves for each prediction window
    const windows = tagPredictions.map(pred => {
      // Convert time strings to timestamps
      const [startHour, startMin] = pred.startTime.split(':').map(Number)
      const [endHour, endMin] = pred.endTime.split(':').map(Number)
      
      const startTimestamp = new Date(dayStart.getTime() + startHour * 60 * 60 * 1000 + startMin * 60 * 1000).getTime()
      const endTimestamp = new Date(dayStart.getTime() + endHour * 60 * 60 * 1000 + endMin * 60 * 1000).getTime()
      
      const windowData = sortedData.filter(d => 
        d.timestamp >= startTimestamp && d.timestamp < endTimestamp
      )
      
      return {
        startTime: startTimestamp,
        endTime: endTimestamp,
        startTimeStr: pred.startTime,
        endTimeStr: pred.endTime,
        powerCurve: windowData.map(d => d.value),
        timestamps: windowData.map(d => d.timestamp),
        avgPower: pred.avgPower,
        probability: pred.probability,
        activeTags: pred.activeTags || [pred.tag]
      }
    })

    console.log(`✅ Found ${windows.length} windows for tag "${tag}"`)

    res.json({
      tag,
      date,
      windows,
      totalWindows: windows.length
    })

  } catch (error) {
    console.error('Tag prediction error:', error)
    res.status(500).json({
      error: 'Failed to get tag predictions',
      message: error.message
    })
  }
})

// Train autoencoder for a specific tag
app.post('/api/anomaly/train', async (req, res) => {
  const { tag, sessionId, trainingDates, entityId } = req.body

  if (!tag || !sessionId) {
    return res.status(400).json({ error: 'Missing tag or sessionId' })
  }

  if (autoencoderTraining.get(tag)) {
    return res.status(400).json({ error: `Training already in progress for tag: ${tag}` })
  }

  try {
    autoencoderTraining.set(tag, { status: 'training', progress: 0 })

    const connection = haConnections.get(sessionId)
    if (!connection) {
      autoencoderTraining.delete(tag)
      return res.status(401).json({ error: 'Invalid session' })
    }

    // Check if seq2point model exists
    const sanitizedTag = sanitizeApplianceName(tag)
    const seq2pointModelPath = path.join(__dirname, 'ml', 'saved_models', `seq2point_${sanitizedTag}_model`)
    
    if (!fs.existsSync(seq2pointModelPath)) {
      autoencoderTraining.delete(tag)
      return res.status(400).json({ 
        error: 'Seq2point model not found',
        message: `No seq2point model found for "${tag}". Please train it first in the ML Trainer tab.`
      })
    }
    
    console.log(`✅ Found seq2point model at: ${seq2pointModelPath}`)
    
    // Load seq2point model if not in memory
    if (!seq2pointModels.has(tag)) {
      console.log(`Loading seq2point model for: ${tag}`)
      const metadataPath = path.join(seq2pointModelPath, 'metadata.json')
      
      if (!fs.existsSync(metadataPath)) {
        autoencoderTraining.delete(tag)
        return res.status(400).json({ 
          error: 'Model metadata not found',
          message: `Metadata file missing for "${tag}". Please retrain the seq2point model.`
        })
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      seq2pointMetadata.set(tag, metadata)
      
      // Create PowerTagPredictor wrapper
      const model = new PowerTagPredictor()
      model.setNormalizationParams({
        mainsMean: metadata.mainsStats.mean,
        mainsStd: metadata.mainsStats.std,
        applianceMean: metadata.applianceStats.mean,
        applianceStd: metadata.applianceStats.std
      })
      
      // Check user preference for inference engine
      const useOnnx = useOnnxForModel.get(tag) === true
      const onnxPath = path.join(seq2pointModelPath, 'model.onnx')
      
      if (useOnnx && fs.existsSync(onnxPath)) {
        await model.loadONNX(onnxPath)
        console.log(`✅ Loaded seq2point ONNX model for: ${tag}`)
      } else {
        await model.load(seq2pointModelPath)
        console.log(`✅ Loaded seq2point TensorFlow model for: ${tag}`)
      }
      
      seq2pointModels.set(tag, model)
    }

    console.log(`🧠 Starting autoencoder training for tag: ${tag}`)
    console.log(`Training dates provided: ${JSON.stringify(trainingDates)}`)

    // Collect power curves from training dates using saved data files
    const powerCurves = []
    const dataDir = path.join(__dirname, '..', 'data')

    for (const dateStr of trainingDates || []) {
      try {
        console.log(`\n📅 Processing date: ${dateStr}`)
        
        // Load power data from saved file
        const powerFile = `power-data-${dateStr}.json`
        const powerPath = path.join(dataDir, powerFile)
        
        if (!fs.existsSync(powerPath)) {
          console.warn(`  ❌ No power data file: ${powerFile}`)
          continue
        }
        
        const powerData = JSON.parse(fs.readFileSync(powerPath, 'utf-8'))
        
        // Load tag data
        const tagFile = `power-tags-${dateStr}.json`
        const tagPath = path.join(dataDir, tagFile)
        
        if (!fs.existsSync(tagPath)) {
          console.warn(`  ❌ No tag data file: ${tagFile}`)
          continue
        }
        
        const tagData = JSON.parse(fs.readFileSync(tagPath, 'utf-8'))
        
        console.log(`  Loaded ${powerData.data?.length || 0} power readings and ${tagData.entries?.length || 0} tag entries`)

        if (!powerData.data || powerData.data.length === 0) {
          console.warn(`  ❌ No power data in file`)
          continue
        }

        // Process power data - already in correct format
        const sortedData = powerData.data
          .map(d => ({
            timestamp: new Date(d.timestamp).getTime(),
            power: parseFloat(d.power)
          }))
          .filter(d => !isNaN(d.power))
          .sort((a, b) => a.timestamp - b.timestamp)

        console.log(`  Valid data points: ${sortedData.length}`)

        // Use seq2point model to predict appliance power
        const model = seq2pointModels.get(tag)
        const metadata = seq2pointMetadata.get(tag)
        const windowLength = metadata.windowLength
        const offset = Math.floor(windowLength / 2)

        // Normalize power data
        const aggregatePowers = sortedData.map(d => d.power)
        const normalized = aggregatePowers.map(p => 
          (p - metadata.mainsStats.mean) / metadata.mainsStats.std
        )

        // Generate predictions with sliding window
        const predictions = []
        
        // Pad the end with last value
        const paddedNormalized = [...normalized]
        const lastValue = normalized[normalized.length - 1]
        for (let i = 0; i < windowLength - 1; i++) {
          paddedNormalized.push(lastValue)
        }

        const maxWindowStart = normalized.length - 1 - offset
        const batchSize = 100

        for (let i = 0; i <= maxWindowStart; i += batchSize) {
          const batchEnd = Math.min(i + batchSize, maxWindowStart + 1)
          const windows = []
          
          for (let j = i; j < batchEnd; j++) {
            windows.push(paddedNormalized.slice(j, j + windowLength))
          }

          const inputTensor = tf.tensor2d(windows)
          const predictionResult = await model.predict(inputTensor)
          
          let powerTensor, onoffTensor
          if (Array.isArray(predictionResult)) {
            powerTensor = predictionResult[0]
            onoffTensor = predictionResult[1]
          } else {
            powerTensor = predictionResult
            onoffTensor = null
          }
          
          const normalizedPreds = await powerTensor.data()
          const onoffProbs = onoffTensor ? await onoffTensor.data() : null

          for (let k = 0; k < normalizedPreds.length; k++) {
            const power = Math.max(0, 
              (normalizedPreds[k] * metadata.applianceStats.std) + metadata.applianceStats.mean
            )
            predictions.push({
              power: Math.round(power * 100) / 100,
              onoffProb: onoffProbs ? onoffProbs[k] : null
            })
          }

          inputTensor.dispose()
          powerTensor.dispose()
          if (onoffTensor) onoffTensor.dispose()
        }

        // Find ON periods and extract power curves
        console.log(`  Analyzing ${predictions.length} predictions for ON periods...`)
        
        let inOnPeriod = false
        let onStartIdx = -1
        let curvesFromThisDate = 0

        for (let i = 0; i < predictions.length; i++) {
          const pred = predictions[i]
          const isOn = pred.onoffProb !== null ? pred.onoffProb > 0.5 : pred.power > 50
          
          if (isOn && !inOnPeriod) {
            // Start of ON period
            inOnPeriod = true
            onStartIdx = i
          } else if (!isOn && inOnPeriod) {
            // End of ON period - extract curve
            const curve = predictions.slice(onStartIdx, i).map(p => p.power)
            
            if (curve.length >= 30) {
              const avgPower = curve.reduce((sum, v) => sum + v, 0) / curve.length
              const midpointIdx = onStartIdx + offset
              const timestamp = midpointIdx < sortedData.length ? sortedData[midpointIdx].timestamp : null
              const timeStr = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : 'N/A'
              
              console.log(`    Window ${timeStr}: ${curve.length} points, avg=${avgPower.toFixed(1)}W`)
              powerCurves.push(curve)
              curvesFromThisDate++
            }
            
            inOnPeriod = false
          }
        }

        // Handle case where appliance is still ON at end of day
        if (inOnPeriod && onStartIdx >= 0) {
          const curve = predictions.slice(onStartIdx).map(p => p.power)
          if (curve.length >= 30) {
            powerCurves.push(curve)
            curvesFromThisDate++
          }
        }

        console.log(`  ✅ Collected ${curvesFromThisDate} curves from ${dateStr}`)
      } catch (err) {
        console.error(`  ❌ Failed to process date ${dateStr}:`, err.message)
        console.error(err.stack)
      }
    }

    console.log(`\n📊 Total power curves collected: ${powerCurves.length}`)

    if (powerCurves.length < 5) {
      autoencoderTraining.delete(tag)
      return res.status(400).json({ 
        error: 'Insufficient training data',
        message: `Found only ${powerCurves.length} power curves, need at least 5`
      })
    }

    console.log(`📊 Training autoencoder with ${powerCurves.length} power curves`)

    // Create and train autoencoder
    const autoencoder = new PowerAutoencoder(60, 8) // 60-point sequences, 8-dim latent space
    
    await autoencoder.train(powerCurves, {
      epochs: 50,
      batchSize: 16,
      validationSplit: 0.2,
      callbacks: []
    })

    // Save autoencoder model alongside seq2point model (sanitizedTag already defined above)
    const autoencoderPath = path.join(seq2pointModelPath, 'autoencoder')
    if (!fs.existsSync(autoencoderPath)) {
      fs.mkdirSync(autoencoderPath, { recursive: true })
    }
    
    await autoencoder.save(autoencoderPath)
    
    // Also keep in memory for immediate use
    autoencoderModels.set(tag, autoencoder)
    autoencoderTraining.delete(tag)

    console.log(`✅ Autoencoder training complete for tag: ${tag}`)
    console.log(`💾 Saved autoencoder to: ${autoencoderPath}`)

    res.json({
      success: true,
      tag,
      trainingSamples: powerCurves.length,
      message: `Autoencoder trained successfully with ${powerCurves.length} samples`
    })

  } catch (error) {
    console.error('Autoencoder training error:', error)
    autoencoderTraining.delete(tag)
    res.status(500).json({
      error: 'Failed to train autoencoder',
      message: error.message
    })
  }
})

// Detect anomalies in a power curve
app.post('/api/anomaly/detect', async (req, res) => {
  const { tag, sessionId, date, entityId, threshold = 2.5 } = req.body

  if (!tag || !sessionId || !date) {
    return res.status(400).json({ error: 'Missing tag, sessionId, or date' })
  }

  try {
    // Check if seq2point model exists
    const sanitizedTag = sanitizeApplianceName(tag)
    const seq2pointModelPath = path.join(__dirname, 'ml', 'saved_models', `seq2point_${sanitizedTag}_model`)
    
    if (!fs.existsSync(seq2pointModelPath)) {
      return res.status(400).json({ 
        error: 'Seq2point model not found',
        message: `No seq2point model found for "${tag}". Please train it first in the ML Trainer tab.`
      })
    }
    
    // Load seq2point model if not in memory
    if (!seq2pointModels.has(sanitizedTag)) {
      console.log(`Loading seq2point model for: ${tag}`)
      const metadataPath = path.join(seq2pointModelPath, 'metadata.json')
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
        seq2pointMetadata.set(sanitizedTag, metadata)
      }
      
      const onnxPath = path.join(seq2pointModelPath, 'model.onnx')
      const tfModelPath = path.join(seq2pointModelPath, 'model.json')
      
      // Try ONNX first, fall back to TensorFlow if it fails
      let modelLoaded = false
      if (fs.existsSync(onnxPath)) {
        try {
          const stats = fs.statSync(onnxPath)
          if (stats.size > 0) {
            const session = await ort.InferenceSession.create(onnxPath, {
              executionProviders: ['cuda', 'cpu']
            })
            seq2pointModels.set(sanitizedTag, session)
            useOnnxForModel.set(sanitizedTag, true)
            console.log(`✅ Loaded seq2point ONNX model for: ${tag}`)
            modelLoaded = true
          } else {
            console.warn(`⚠️ ONNX model file is empty, falling back to TensorFlow: ${onnxPath}`)
          }
        } catch (onnxError) {
          console.warn(`⚠️ Failed to load ONNX model, falling back to TensorFlow: ${onnxError.message}`)
        }
      }
      
      if (!modelLoaded && fs.existsSync(tfModelPath)) {
        const model = await tf.loadLayersModel(`file://${tfModelPath}`)
        seq2pointModels.set(sanitizedTag, model)
        useOnnxForModel.set(sanitizedTag, false)
        console.log(`✅ Loaded seq2point TensorFlow model for: ${tag}`)
      } else if (!modelLoaded) {
        throw new Error(`No valid model found for ${tag}`)
      }
    }
    
    // Load or get autoencoder
    let autoencoder = autoencoderModels.get(sanitizedTag)
    if (!autoencoder) {
      const autoencoderPath = path.join(seq2pointModelPath, 'autoencoder')
      if (!fs.existsSync(autoencoderPath) || !fs.existsSync(path.join(autoencoderPath, 'model.json'))) {
        return res.status(400).json({ 
          error: 'No trained autoencoder for this tag',
          message: `Please train an autoencoder for "${tag}" first by clicking "Train Autoencoder" in the Anomaly Detector tab.`
        })
      }
      
      console.log(`Loading autoencoder from: ${autoencoderPath}`)
      autoencoder = new PowerAutoencoder(60, 8)
      await autoencoder.load(autoencoderPath)
      autoencoderModels.set(sanitizedTag, autoencoder)
      console.log(`✅ Loaded autoencoder for: ${tag}`)
    }


    const connection = haConnections.get(sessionId)
    if (!connection) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    console.log(`🔍 Detecting anomalies for tag "${tag}" on ${date}`)

    const targetDate = new Date(date)
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    // Fetch power data
    const historyUrl = `${connection.url}/api/history/period/${dayStart.toISOString()}`
    const params = new URLSearchParams({
      filter_entity_id: entityId || connection.entityId,
      end_time: dayEnd.toISOString(),
      minimal_response: 'true',
      no_attributes: 'true'
    })

    const response = await fetch(`${historyUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${connection.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`)
    }

    const history = await response.json()
    if (!history[0] || history[0].length === 0) {
      return res.json({ tag, date, anomalies: [], message: 'No data available' })
    }

    const sortedData = history[0]
      .filter(state => state.state !== 'unavailable' && state.state !== 'unknown')
      .map(state => ({
        timestamp: new Date(state.last_changed).getTime(),
        value: parseFloat(state.state)
      }))
      .filter(d => !isNaN(d.value))
      .sort((a, b) => a.timestamp - b.timestamp)

    console.log(`Fetched ${sortedData.length} data points for ${date}`)

    // Get metadata and model from cache
    const metadata = seq2pointMetadata.get(sanitizedTag)
    const cachedModel = seq2pointModels.get(sanitizedTag)
    const useOnnx = useOnnxForModel.get(sanitizedTag) || false
    
    // Create PowerTagPredictor wrapper with cached model
    const model = new PowerTagPredictor()
    if (useOnnx) {
      model.onnxSession = cachedModel
      // Detect if multi-task based on ONNX output names
      model.isMultiTask = cachedModel.outputNames.includes('power_output') && 
                          cachedModel.outputNames.includes('onoff_output')
      console.log(`ONNX model multi-task: ${model.isMultiTask}, outputs: ${cachedModel.outputNames.join(', ')}`)
    } else {
      model.model = cachedModel
      // TensorFlow models automatically return arrays for dual outputs
    }
    
    model.inputWindowLength = metadata.windowLength
    model.mainsMean = metadata.mainsStats.mean
    model.mainsStd = metadata.mainsStats.std
    model.applianceMean = metadata.applianceStats.mean
    model.applianceStd = metadata.applianceStats.std
    
    const windowLength = metadata.windowLength
    const offset = Math.floor(windowLength / 2)

    // Normalize power data
    const aggregatePowers = sortedData.map(d => d.value)
    const normalized = aggregatePowers.map(p => 
      (p - metadata.mainsStats.mean) / metadata.mainsStats.std
    )

    // Generate predictions with sliding window
    const predictions = []
    
    // Pad the end with last value
    const paddedNormalized = [...normalized]
    const lastValue = normalized[normalized.length - 1]
    for (let i = 0; i < windowLength - 1; i++) {
      paddedNormalized.push(lastValue)
    }

    const maxWindowStart = normalized.length - 1 - offset
    const batchSize = 100

    for (let i = 0; i <= maxWindowStart; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, maxWindowStart + 1)
      const windows = []
      
      for (let j = i; j < batchEnd; j++) {
        windows.push(paddedNormalized.slice(j, j + windowLength))
      }

      const inputTensor = tf.tensor2d(windows)
      const predictionResult = await model.predict(inputTensor)
      
      let powerTensor, onoffTensor
      if (Array.isArray(predictionResult)) {
        powerTensor = predictionResult[0]
        onoffTensor = predictionResult[1]
        
        // Log on first batch to verify model output structure
        if (i === 0) {
          console.log(`Model output structure: Array with ${predictionResult.length} tensors`)
          console.log(`  Power tensor shape: [${powerTensor.shape}]`)
          console.log(`  On/Off tensor shape: [${onoffTensor.shape}]`)
        }
      } else {
        powerTensor = predictionResult
        onoffTensor = null
        
        if (i === 0) {
          console.log(`Model output structure: Single tensor (power only)`)
          console.log(`  Power tensor shape: [${powerTensor.shape}]`)
        }
      }
      
      const normalizedPreds = await powerTensor.data()
      const onoffProbs = onoffTensor ? await onoffTensor.data() : null

      for (let k = 0; k < normalizedPreds.length; k++) {
        const power = Math.max(0, 
          (normalizedPreds[k] * metadata.applianceStats.std) + metadata.applianceStats.mean
        )
        predictions.push({
          power: Math.round(power * 100) / 100,
          onoffProb: onoffProbs ? onoffProbs[k] : null
        })
      }

      inputTensor.dispose()
      powerTensor.dispose()
      if (onoffTensor) onoffTensor.dispose()
    }

    console.log(`Generated ${predictions.length} seq2point predictions`)

    // Determine ON threshold dynamically based on predictions
    // Use the model's on/off output if available, otherwise use power threshold
    const hasOnOffModel = predictions.some(p => p.onoffProb !== null)
    const onoffCount = predictions.filter(p => p.onoffProb !== null).length
    
    console.log(`🔍 Model output analysis for ${tag}:`)
    console.log(`   Predictions with on/off: ${onoffCount}/${predictions.length} (${(onoffCount/predictions.length*100).toFixed(1)}%)`)
    console.log(`   Using on/off model: ${hasOnOffModel ? 'YES' : 'NO - using power threshold'}`)
    
    // Calculate power threshold from predictions (10% of max predicted power, min 50W)
    const maxPower = Math.max(...predictions.map(p => p.power))
    const powerThreshold = Math.max(50, maxPower * 0.1)
    
    console.log(`   Max predicted power: ${maxPower.toFixed(1)}W`)
    console.log(`   Power threshold (fallback): ${powerThreshold.toFixed(1)}W`)

    // Find ON periods and detect anomalies in each period
    const anomalies = []
    let inOnPeriod = false
    let onStartIdx = -1

    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i]
      const isOn = pred.onoffProb !== null ? pred.onoffProb > 0.5 : pred.power > powerThreshold
      
      if (isOn && !inOnPeriod) {
        // Start of ON period
        inOnPeriod = true
        onStartIdx = i
        console.log(`🟢 ON period started at index ${i} (${new Date(sortedData[i]?.timestamp).toTimeString().slice(0, 8)})`)
      } else if (!isOn && inOnPeriod) {
        // End of ON period - extract curve and detect anomaly
        const curve = predictions.slice(onStartIdx, i).map(p => p.power)
        console.log(`🔴 ON period ended at index ${i}, duration: ${curve.length} points`)
        
        if (curve.length >= 30) {
          try {
            const result = await autoencoder.detectAnomalies(curve, threshold)
            
            // Map prediction indices to data timestamps
            // predictions[idx] corresponds to the sliding window centered at data point idx
            // So for ON period from onStartIdx to i, we get timestamps for those exact indices
            const periodTimestamps = []
            for (let idx = onStartIdx; idx < i && idx < sortedData.length; idx++) {
              periodTimestamps.push(sortedData[idx].timestamp)
            }
            
            const windowStart = periodTimestamps[0] || null
            const windowEnd = periodTimestamps[periodTimestamps.length - 1] || null

            anomalies.push({
              startTime: windowStart,
              endTime: windowEnd,
              startTimeStr: windowStart ? new Date(windowStart).toTimeString().slice(0, 5) : 'N/A',
              endTimeStr: windowEnd ? new Date(windowEnd).toTimeString().slice(0, 5) : 'N/A',
              isAnomaly: result.isAnomaly,
              anomalyScore: result.anomalyScore,
              reconstructionError: result.reconstructionError,
              threshold: result.threshold,
              original: result.original,
              reconstructed: result.reconstructed,
              timestamps: periodTimestamps,
              avgPower: curve.reduce((sum, v) => sum + v, 0) / curve.length
            })
          } catch (err) {
            console.error(`Error detecting anomaly in window:`, err.message)
          }
        }
        
        inOnPeriod = false
      }
    }

    // Handle case where appliance is still ON at end of day
    if (inOnPeriod && onStartIdx >= 0) {
      const curve = predictions.slice(onStartIdx).map(p => p.power)
      if (curve.length >= 30) {
        try {
          const result = await autoencoder.detectAnomalies(curve, threshold)
          
          // Map final ON period timestamps
          const periodTimestamps = []
          for (let idx = onStartIdx; idx < predictions.length && idx < sortedData.length; idx++) {
            periodTimestamps.push(sortedData[idx].timestamp)
          }
          
          const windowStart = periodTimestamps[0] || null
          const windowEnd = periodTimestamps[periodTimestamps.length - 1] || sortedData[sortedData.length - 1].timestamp

          anomalies.push({
            startTime: windowStart,
            endTime: windowEnd,
            startTimeStr: windowStart ? new Date(windowStart).toTimeString().slice(0, 5) : 'N/A',
            endTimeStr: new Date(windowEnd).toTimeString().slice(0, 5),
            isAnomaly: result.isAnomaly,
            anomalyScore: result.anomalyScore,
            reconstructionError: result.reconstructionError,
            threshold: result.threshold,
            original: result.original,
            reconstructed: result.reconstructed,
            timestamps: periodTimestamps,
            avgPower: curve.reduce((sum, v) => sum + v, 0) / curve.length
          })
        } catch (err) {
          console.error(`Error detecting anomaly in final window:`, err.message)
        }
      }
    }
    
    console.log(`📊 Anomaly Detection Summary for ${tag}:`)
    console.log(`   Total ON periods found: ${anomalies.length}`)
    console.log(`   Anomalous periods: ${anomalies.filter(a => a.isAnomaly).length}`)
    if (anomalies.length > 0) {
      console.log(`   ON periods:`)
      anomalies.forEach((a, idx) => {
        console.log(`     ${idx + 1}. ${a.startTimeStr}-${a.endTimeStr} | Avg: ${a.avgPower.toFixed(1)}W | ${a.isAnomaly ? '⚠️ ANOMALY' : '✅ Normal'} (score: ${a.anomalyScore.toFixed(3)})`)
      })
    }
    
    const anomalyCount = anomalies.filter(a => a.isAnomaly).length

    console.log(`✅ Detected ${anomalyCount} anomalies out of ${anomalies.length} windows`)

    res.json({
      tag,
      date,
      anomalies,
      totalWindows: anomalies.length,
      anomalyCount,
      threshold
    })

  } catch (error) {
    console.error('Anomaly detection error:', error)
    res.status(500).json({
      error: 'Failed to detect anomalies',
      message: error.message
    })
  }
})

// ============================================================
// SEQ2POINT NILM ENDPOINTS
// ============================================================

// Store loaded seq2point models (appliance -> model instance)
const seq2pointModels = new Map()
const seq2pointMetadata = new Map()

// Initialize auto-predictor with shared TensorFlow instance and inference preference
const autoPredictor = new AutoPredictor(haConnections, seq2pointModels, seq2pointMetadata, tf, useOnnxForModel)

// List available seq2point models
app.get('/api/seq2point/models', (req, res) => {
  try {
    const modelsDir = path.join(__dirname, 'ml', 'saved_models')
    
    if (!fs.existsSync(modelsDir)) {
      return res.json({ models: [] })
    }

    const modelDirs = fs.readdirSync(modelsDir)
      .filter(name => name.startsWith('seq2point_') && name.endsWith('_model'))
      .filter(name => {
        const modelPath = path.join(modelsDir, name)
        return fs.statSync(modelPath).isDirectory()
      })

    const models = modelDirs.map(dirName => {
      const modelPath = path.join(modelsDir, dirName)
      const metadataPath = path.join(modelPath, 'metadata.json')
      const onnxPath = path.join(modelPath, 'model.onnx')
      
      // Extract appliance name from directory name
      const appliance = dirName.replace('seq2point_', '').replace('_model', '')
      
      let metadata = null
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      }

      return {
        appliance,
        path: modelPath,
        metadata,
        loaded: seq2pointModels.has(appliance),
        hasOnnx: fs.existsSync(onnxPath),
        useOnnx: useOnnxForModel.get(appliance) || false,
        hasOnOffOutput: metadata?.hasOnOffOutput || false
      }
    })

    res.json({ models })
  } catch (error) {
    console.error('Error listing seq2point models:', error)
    res.status(500).json({ error: 'Failed to list models', message: error.message })
  }
})

// Load a specific seq2point model
app.post('/api/seq2point/load', async (req, res) => {
  try {
    let { appliance } = req.body

    if (!appliance) {
      return res.status(400).json({ error: 'Missing appliance name' })
    }

    // Sanitize appliance name to match directory naming
    appliance = sanitizeApplianceName(appliance)

    const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
    const metadataPath = path.join(modelDir, 'metadata.json')

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    
    // Create and load model (respect inference engine preference)
    const model = new PowerTagPredictor()
    model.setNormalizationParams({
      mainsMean: metadata.mainsStats.mean,
      mainsStd: metadata.mainsStats.std,
      applianceMean: metadata.applianceStats.mean,
      applianceStd: metadata.applianceStats.std
    })
    
    // Check user preference for inference engine (default to TFJS for accuracy)
    const useOnnx = useOnnxForModel.get(appliance) === true
    const onnxPath = path.join(modelDir, 'model.onnx')
    
    if (useOnnx && fs.existsSync(onnxPath)) {
      await model.loadONNX(onnxPath)
      console.log(`✅ Loaded ONNX model for: ${appliance}`)
    } else {
      await model.load(modelDir)
      console.log(`✅ Loaded TensorFlow.js model for: ${appliance}`)
    }
    
    // Store in memory
    seq2pointModels.set(appliance, model)
    seq2pointMetadata.set(appliance, metadata)

    console.log(`✅ Loaded seq2point model for: ${appliance}`)

    res.json({
      success: true,
      appliance,
      metadata
    })
  } catch (error) {
    console.error('Error loading seq2point model:', error)
    res.status(500).json({ error: 'Failed to load model', message: error.message })
  }
})

// Convert a seq2point model to ONNX
app.post('/api/seq2point/convert-onnx', async (req, res) => {
  try {
    let { appliance } = req.body

    if (!appliance) {
      return res.status(400).json({ error: 'Missing appliance name' })
    }

    // Sanitize appliance name to match directory naming
    appliance = sanitizeApplianceName(appliance)

    let model = seq2pointModels.get(appliance)
    const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
    const onnxPath = path.join(modelDir, 'model.onnx')

    // If model not in memory, load it first
    if (!model) {
      const metadataPath = path.join(modelDir, 'metadata.json')
      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      model = new PowerTagPredictor()
      model.setNormalizationParams({
        mainsMean: metadata.mainsStats.mean,
        mainsStd: metadata.mainsStats.std,
        applianceMean: metadata.applianceStats.mean,
        applianceStd: metadata.applianceStats.std
      })
      // Always load TFJS model for conversion (not ONNX)
      await model.load(modelDir)
      // Don't store in seq2pointModels yet - conversion will reload as ONNX
    } else if (!model.model) {
      // Model is in memory but only has ONNX session, need TFJS model for conversion
      await model.load(modelDir)
    }

    // Convert to ONNX
    await model.convertToONNX(onnxPath)

    res.json({
      success: true,
      message: `Model for ${appliance} converted to ONNX successfully`,
      path: onnxPath
    })
  } catch (error) {
    console.error('Error converting model to ONNX:', error)
    res.status(500).json({ error: 'Failed to convert model', message: error.message })
  }
})

// Delete a seq2point model
app.delete('/api/seq2point/delete/:appliance', (req, res) => {
  try {
    let { appliance } = req.params

    if (!appliance) {
      return res.status(400).json({ error: 'Appliance name is required' })
    }

    // Sanitize appliance name
    appliance = sanitizeApplianceName(appliance)

    // Check if model is currently loaded
    if (seq2pointModels.has(appliance)) {
      // Unload the model from memory
      seq2pointModels.delete(appliance)
      seq2pointMetadata.delete(appliance)
      useOnnxForModel.delete(appliance)
      console.log(`Unloaded ${appliance} model from memory`)
    }

    const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)

    if (!fs.existsSync(modelDir)) {
      return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
    }

    // Delete the model directory
    fs.rmSync(modelDir, { recursive: true, force: true })

    console.log(`🗑️ Deleted seq2point model for ${appliance}`)

    res.json({ success: true, message: `Model for ${appliance} deleted successfully` })
  } catch (error) {
    console.error('Error deleting seq2point model:', error)
    res.status(500).json({ error: 'Failed to delete model', message: error.message })
  }
})

// Export seq2point model as ZIP with all files
app.get('/api/seq2point/export/:appliance', (req, res) => {
  try {
    let { appliance } = req.params

    if (!appliance) {
      return res.status(400).json({ error: 'Appliance name is required' })
    }

    // Sanitize appliance name
    appliance = sanitizeApplianceName(appliance)

    const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)

    if (!fs.existsSync(modelDir)) {
      return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
    }

    // Set response headers for ZIP download
    const zipFilename = `${appliance}_model_export_${new Date().toISOString().split('T')[0]}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`)

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    })

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err)
      res.status(500).json({ error: 'Failed to create archive', message: err.message })
    })

    // Pipe archive to response
    archive.pipe(res)

    // Add all files from model directory
    archive.directory(modelDir, false)

    // Finalize the archive
    archive.finalize()

    console.log(`📤 Exporting model as ZIP for ${appliance}`)

  } catch (error) {
    console.error('Error exporting seq2point model:', error)
    res.status(500).json({ error: 'Failed to export model', message: error.message })
  }
})

// Set inference engine preference for a model
app.post('/api/seq2point/set-inference-engine', async (req, res) => {
  try {
    let { appliance, useOnnx } = req.body

    if (!appliance) {
      return res.status(400).json({ error: 'Missing appliance name' })
    }

    // Sanitize appliance name
    appliance = sanitizeApplianceName(appliance)

    // Update preference
    useOnnxForModel.set(appliance, useOnnx)
    console.log(`Set inference engine for ${appliance}: ${useOnnx ? 'ONNX' : 'TensorFlow.js'}`)

    // If model is loaded, reload it with the new engine
    if (seq2pointModels.has(appliance)) {
      const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
      const metadataPath = path.join(modelDir, 'metadata.json')
      const onnxPath = path.join(modelDir, 'model.onnx')

      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      const model = new PowerTagPredictor()
      model.setNormalizationParams({
        mainsMean: metadata.mainsStats.mean,
        mainsStd: metadata.mainsStats.std,
        applianceMean: metadata.applianceStats.mean,
        applianceStd: metadata.applianceStats.std
      })

      // Load based on preference
      if (useOnnx && fs.existsSync(onnxPath)) {
        await model.loadONNX(onnxPath)
        console.log(`  Reloaded ${appliance} with ONNX`)
      } else {
        await model.load(modelDir)
        console.log(`  Reloaded ${appliance} with TensorFlow.js`)
      }

      // Update in memory
      seq2pointModels.set(appliance, model)
    }

    res.json({
      success: true,
      appliance,
      useOnnx
    })
  } catch (error) {
    console.error('Error setting inference engine:', error)
    res.status(500).json({ error: 'Failed to set inference engine', message: error.message })
  }
})

// Update seq2point model name
app.patch('/api/seq2point/update-name/:appliance', (req, res) => {
  try {
    let { appliance } = req.params
    const { name } = req.body

    if (!appliance) {
      return res.status(400).json({ error: 'Appliance name is required' })
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Valid name is required' })
    }

    // Sanitize appliance name
    appliance = sanitizeApplianceName(appliance)

    const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
    const metadataPath = path.join(modelDir, 'metadata.json')

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
    }

    // Read, update, and write metadata
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    metadata.name = name
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

    // Update in-memory metadata if loaded
    if (seq2pointMetadata.has(appliance)) {
      const loadedMetadata = seq2pointMetadata.get(appliance)
      loadedMetadata.name = name
    }

    console.log(`✏️ Updated name for ${appliance} model to: ${name}`)

    res.json({ success: true, appliance, name })
  } catch (error) {
    console.error('Error updating model name:', error)
    res.status(500).json({ error: 'Failed to update model name', message: error.message })
  }
})

// Predict appliance power consumption
app.post('/api/seq2point/predict', async (req, res) => {
  try {
    let { appliance, powerData } = req.body

    if (!appliance) {
      return res.status(400).json({ error: 'Missing appliance name' })
    }

    // Sanitize appliance name to match directory naming
    appliance = sanitizeApplianceName(appliance)

    if (!powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing or invalid powerData array' })
    }

    // Load model if not in memory
    if (!seq2pointModels.has(appliance)) {
      const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      
      const model = new PowerTagPredictor()
      model.setNormalizationParams({
        mainsMean: metadata.mainsStats.mean,
        mainsStd: metadata.mainsStats.std,
        applianceMean: metadata.applianceStats.mean,
        applianceStd: metadata.applianceStats.std
      })
      
      // Check user preference for inference engine (default to TFJS for accuracy)
      const useOnnx = useOnnxForModel.get(appliance) === true
      const onnxPath = path.join(modelDir, 'model.onnx')
      
      if (useOnnx && fs.existsSync(onnxPath)) {
        await model.loadONNX(onnxPath)
        console.log(`✅ Loaded ONNX model for prediction: ${appliance}`)
      } else {
        await model.load(modelDir)
        console.log(`✅ Loaded TensorFlow.js model for prediction: ${appliance}`)
      }
      
      seq2pointModels.set(appliance, model)
      seq2pointMetadata.set(appliance, metadata)

      console.log(`✅ Loaded seq2point model for: ${appliance}`)
    }

    const model = seq2pointModels.get(appliance)
    const metadata = seq2pointMetadata.get(appliance)
    const windowLength = metadata.windowLength

    // Need at least windowLength readings
    if (powerData.length < windowLength) {
      return res.status(400).json({ 
        error: `Need at least ${windowLength} power readings. Got ${powerData.length}` 
      })
    }

    // Extract power values
    const aggregatePowers = powerData.map(dp => dp.power || dp.value || 0)

    // Take last windowLength values and normalize
    const window = aggregatePowers.slice(-windowLength)
    const normalized = window.map(p => 
      (p - metadata.mainsStats.mean) / metadata.mainsStats.std
    )

    // Create tensor [1, windowLength]
    const inputTensor = tf.tensor2d([normalized])

    // Predict
    const predictionTensor = await model.predict(inputTensor)
    const normalizedPower = await predictionTensor.data()

    // Denormalize to watts
    const appliancePower = Math.max(0, 
      (normalizedPower[0] * metadata.applianceStats.std) + metadata.applianceStats.mean
    )

    // Clean up
    inputTensor.dispose()
    predictionTensor.dispose()

    res.json({
      appliance,
      predictedPower: Math.round(appliancePower * 100) / 100,
      timestamp: powerData[powerData.length - 1].timestamp,
      windowLength,
      samplesUsed: window.length
    })

  } catch (error) {
    console.error('Seq2point prediction error:', error)
    res.status(500).json({
      error: 'Failed to make prediction',
      message: error.message
    })
  }
})

// Predict for entire day with sliding window
app.post('/api/seq2point/predict-day', async (req, res) => {
  try {
    let { appliance, date, powerData } = req.body

    if (!appliance) {
      return res.status(400).json({ error: 'Missing appliance name' })
    }

    // Sanitize appliance name to match directory naming
    appliance = sanitizeApplianceName(appliance)

    if (!date) {
      return res.status(400).json({ error: 'Missing date' })
    }

    if (!powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing or invalid powerData array' })
    }

    // Load model if needed
    if (!seq2pointModels.has(appliance)) {
      const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      
      try {
        const model = new PowerTagPredictor()
        model.setNormalizationParams({
          mainsMean: metadata.mainsStats.mean,
          mainsStd: metadata.mainsStats.std,
          applianceMean: metadata.applianceStats.mean,
          applianceStd: metadata.applianceStats.std
        })
        
        // Check user preference for inference engine (default to TFJS for accuracy)
        const useOnnx = useOnnxForModel.get(appliance) === true
        const onnxPath = path.join(modelDir, 'model.onnx')
        
        if (useOnnx && fs.existsSync(onnxPath)) {
          await model.loadONNX(onnxPath)
          console.log(`✅ Loaded ONNX model for day prediction: ${appliance}`)
        } else {
          await model.load(modelDir)
          console.log(`✅ Loaded TensorFlow.js model for day prediction: ${appliance}`)
        }
        
        seq2pointModels.set(appliance, model)
        seq2pointMetadata.set(appliance, metadata)
      } catch (loadError) {
        console.error(`Failed to load seq2point model for ${appliance}:`, loadError)
        throw new Error(`Failed to load model: ${loadError.message}`)
      }
    }

    const model = seq2pointModels.get(appliance)
    const metadata = seq2pointMetadata.get(appliance)
    const windowLength = metadata.windowLength
    const offset = Math.floor(windowLength / 2)

    // Extract and normalize aggregate powers
    const aggregatePowers = powerData.map(dp => dp.power || dp.value || 0)
    const timestamps = powerData.map(dp => dp.timestamp)
    
    const normalized = aggregatePowers.map(p => 
      (p - metadata.mainsStats.mean) / metadata.mainsStats.std
    )

    // Generate predictions with sliding window
    const predictions = []
    const batchSize = 100 // Process in batches for efficiency
    
    // Pad the end with last value so we can predict up to the last timestamp
    // We need enough padding so that even when starting at the last position,
    // we can form a complete window
    const paddedNormalized = [...normalized]
    const lastValue = normalized[normalized.length - 1]
    for (let i = 0; i < windowLength - 1; i++) {
      paddedNormalized.push(lastValue)
    }
    
    // Calculate how many windows we need to cover all timestamps
    // The midpoint of window at position i is at i + offset
    // To reach the last timestamp (normalized.length - 1), we need:
    // i + offset = normalized.length - 1, so i = normalized.length - 1 - offset
    const maxWindowStart = normalized.length - 1 - offset

    for (let i = 0; i <= maxWindowStart; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, maxWindowStart + 1)
      const windows = []
      
      for (let j = i; j < batchEnd; j++) {
        windows.push(paddedNormalized.slice(j, j + windowLength))
      }

      // Batch prediction
      const inputTensor = tf.tensor2d(windows)
      const predictionResult = await model.predict(inputTensor)
      
      // Handle multi-task output (array) or single-task output (tensor)
      let powerTensor, onoffTensor
      if (Array.isArray(predictionResult)) {
        // Multi-task: [powerPredictions, onoffPredictions]
        powerTensor = predictionResult[0]
        onoffTensor = predictionResult[1]
      } else {
        // Single-task: just power
        powerTensor = predictionResult
        onoffTensor = null
      }
      
      const normalizedPreds = await powerTensor.data()
      const onoffProbs = onoffTensor ? await onoffTensor.data() : null

      // Denormalize and store both power and on/off
      for (let k = 0; k < normalizedPreds.length; k++) {
        const power = Math.max(0, 
          (normalizedPreds[k] * metadata.applianceStats.std) + metadata.applianceStats.mean
        )
        predictions.push({
          power: Math.round(power * 100) / 100,
          onoffProb: onoffProbs ? onoffProbs[k] : null
        })
      }

      inputTensor.dispose()
      powerTensor.dispose()
      if (onoffTensor) onoffTensor.dispose()
    }

    // Align predictions with timestamps (account for offset)
    const results = []
    for (let i = 0; i < predictions.length; i++) {
      const midpointIndex = i + offset
      if (midpointIndex < timestamps.length) {
        results.push({
          timestamp: timestamps[midpointIndex],
          predictedPower: predictions[i].power,
          onoffProbability: predictions[i].onoffProb,
          isOn: predictions[i].onoffProb !== null ? predictions[i].onoffProb > 0.5 : predictions[i].power > 200,
          aggregatePower: aggregatePowers[midpointIndex]
        })
      }
    }

    res.json({
      appliance,
      date,
      windowLength,
      predictions: results,
      totalPredictions: results.length
    })

  } catch (error) {
    console.error('Seq2point day prediction error:', error)
    res.status(500).json({
      error: 'Failed to predict day',
      message: error.message
    })
  }
})

// AUTO-PREDICTOR ENDPOINTS
// ============================================================

// Start auto-predictor
app.post('/api/auto-predictor/start', (req, res) => {
  try {
    const { sessionId, intervalMinutes, useSeq2Point, selectedModels, useGSP, gspConfig } = req.body

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' })
    }

    const connection = haConnections.get(sessionId)
    if (!connection) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const config = {
      sessionId,
      intervalMinutes: intervalMinutes || 60,
      useSeq2Point: useSeq2Point !== undefined ? useSeq2Point : true,
      selectedModels: selectedModels || [],
      useGSP: useGSP || false,
      gspConfig: gspConfig || {
        sigma: 20,
        ri: 0.15,
        T_Positive: 20,
        T_Negative: -20,
        alpha: 0.5,
        beta: 0.5,
        instancelimit: 3
      }
    }

    autoPredictor.start(config)

    res.json({
      success: true,
      message: 'Auto-predictor started',
      status: autoPredictor.getStatus()
    })
  } catch (error) {
    console.error('Error starting auto-predictor:', error)
    res.status(500).json({ error: 'Failed to start auto-predictor', message: error.message })
  }
})

// Stop auto-predictor
app.post('/api/auto-predictor/stop', (req, res) => {
  try {
    autoPredictor.stop()
    res.json({
      success: true,
      message: 'Auto-predictor stopped'
    })
  } catch (error) {
    console.error('Error stopping auto-predictor:', error)
    res.status(500).json({ error: 'Failed to stop auto-predictor', message: error.message })
  }
})

// Get auto-predictor status
app.get('/api/auto-predictor/status', (req, res) => {
  try {
    res.json(autoPredictor.getStatus())
  } catch (error) {
    console.error('Error getting auto-predictor status:', error)
    res.status(500).json({ error: 'Failed to get status', message: error.message })
  }
})

// Trigger manual run
app.post('/api/auto-predictor/run', async (req, res) => {
  try {
    if (!autoPredictor.config.sessionId) {
      return res.status(400).json({ error: 'Auto-predictor not configured' })
    }

    // Run prediction in background
    autoPredictor.runPrediction().catch(err => {
      console.error('Manual prediction run failed:', err)
    })

    res.json({
      success: true,
      message: 'Prediction run started in background',
      status: autoPredictor.getStatus()
    })
  } catch (error) {
    console.error('Error triggering manual run:', error)
    res.status(500).json({ error: 'Failed to trigger run', message: error.message })
  }
})

// ============================================================================
// LIBRARY MANAGEMENT API
// ============================================================================

// Get all models from library
app.get('/api/library/models', (req, res) => {
  try {
    const libraryPath = path.join(__dirname, 'library', 'models.json')
    
    if (!fs.existsSync(libraryPath)) {
      // Create empty library file if it doesn't exist
      const libraryDir = path.join(__dirname, 'library')
      if (!fs.existsSync(libraryDir)) {
        fs.mkdirSync(libraryDir, { recursive: true })
      }
      fs.writeFileSync(libraryPath, JSON.stringify({ models: [] }, null, 2))
      return res.json([])
    }
    
    const libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
    res.json(libraryData.models || [])
  } catch (error) {
    console.error('Error loading library:', error)
    res.status(500).json({ 
      error: 'Failed to load library',
      message: error.message 
    })
  }
})

// Create a new model
app.post('/api/library/models', (req, res) => {
  try {
    const { name, description, deviceType, manufacturer, modelNumber, properties } = req.body
    
    if (!name || !properties || properties.powerMin === undefined || properties.powerMax === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, properties.powerMin, properties.powerMax' 
      })
    }
    
    const libraryPath = path.join(__dirname, 'library', 'models.json')
    const libraryDir = path.join(__dirname, 'library')
    
    // Ensure directory exists
    if (!fs.existsSync(libraryDir)) {
      fs.mkdirSync(libraryDir, { recursive: true })
    }
    
    // Load existing library
    let libraryData = { models: [] }
    if (fs.existsSync(libraryPath)) {
      libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
    }
    
    // Create new model
    const newModel = {
      id: Date.now().toString(),
      name,
      description: description || '',
      deviceType: deviceType || '',
      manufacturer: manufacturer || '',
      modelNumber: modelNumber || '',
      properties: {
        powerMin: properties.powerMin,
        powerMax: properties.powerMax,
        hasOnOff: properties.hasOnOff !== undefined ? properties.hasOnOff : true,
        annualPowerWh: properties.annualPowerWh || 0
      },
      hasTrainedModel: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    libraryData.models.push(newModel)
    
    // Save library
    fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2))
    
    console.log(`✅ Created new model: ${name}`)
    res.json(newModel)
  } catch (error) {
    console.error('Error creating model:', error)
    res.status(500).json({ 
      error: 'Failed to create model',
      message: error.message 
    })
  }
})

// Update an existing model
app.put('/api/library/models/:id', (req, res) => {
  try {
    const { id } = req.params
    const { name, description, deviceType, manufacturer, modelNumber, properties } = req.body
    
    const libraryPath = path.join(__dirname, 'library', 'models.json')
    
    if (!fs.existsSync(libraryPath)) {
      return res.status(404).json({ error: 'Library not found' })
    }
    
    const libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
    const modelIndex = libraryData.models.findIndex(m => m.id === id)
    
    if (modelIndex === -1) {
      return res.status(404).json({ error: 'Model not found' })
    }
    
    // Update model
    libraryData.models[modelIndex] = {
      ...libraryData.models[modelIndex],
      name: name || libraryData.models[modelIndex].name,
      description: description !== undefined ? description : libraryData.models[modelIndex].description,
      deviceType: deviceType !== undefined ? deviceType : libraryData.models[modelIndex].deviceType,
      manufacturer: manufacturer !== undefined ? manufacturer : libraryData.models[modelIndex].manufacturer,
      modelNumber: modelNumber !== undefined ? modelNumber : libraryData.models[modelIndex].modelNumber,
      properties: properties || libraryData.models[modelIndex].properties,
      updatedAt: new Date().toISOString()
    }
    
    // Save library
    fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2))
    
    console.log(`✅ Updated model: ${libraryData.models[modelIndex].name}`)
    res.json(libraryData.models[modelIndex])
  } catch (error) {
    console.error('Error updating model:', error)
    res.status(500).json({ 
      error: 'Failed to update model',
      message: error.message 
    })
  }
})

// Delete a model
app.delete('/api/library/models/:id', (req, res) => {
  try {
    const { id } = req.params
    
    const libraryPath = path.join(__dirname, 'library', 'models.json')
    
    if (!fs.existsSync(libraryPath)) {
      return res.status(404).json({ error: 'Library not found' })
    }
    
    const libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
    const modelIndex = libraryData.models.findIndex(m => m.id === id)
    
    if (modelIndex === -1) {
      return res.status(404).json({ error: 'Model not found' })
    }
    
    const deletedModel = libraryData.models.splice(modelIndex, 1)[0]
    
    // Save library
    fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2))
    
    console.log(`🗑️ Deleted model: ${deletedModel.name}`)
    res.json({ success: true, model: deletedModel })
  } catch (error) {
    console.error('Error deleting model:', error)
    res.status(500).json({ 
      error: 'Failed to delete model',
      message: error.message 
    })
  }
})

// Export a model
app.get('/api/library/export/:id', (req, res) => {
  try {
    const { id } = req.params
    
    const libraryPath = path.join(__dirname, 'library', 'models.json')
    
    if (!fs.existsSync(libraryPath)) {
      return res.status(404).json({ error: 'Library not found' })
    }
    
    const libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
    const model = libraryData.models.find(m => m.id === id)
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${model.name.replace(/[^a-z0-9]/gi, '_')}_export.json"`)
    
    // Send model data
    res.json({
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      model: model
    })
  } catch (error) {
    console.error('Error exporting model:', error)
    res.status(500).json({ 
      error: 'Failed to export model',
      message: error.message 
    })
  }
})

// Import a model (JSON or ZIP)
app.post('/api/library/import', async (req, res) => {
  try {
    // Handle multipart form data for file upload
    const multer = await import('multer')
    const AdmZip = await import('adm-zip')
    
    const storage = multer.default.memoryStorage()
    const upload = multer.default({ storage }).single('file')
    
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: 'File upload failed', message: err.message })
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }
      
      try {
        const libraryPath = path.join(__dirname, 'library', 'models.json')
        const libraryDir = path.join(__dirname, 'library')
        
        // Ensure directory exists
        if (!fs.existsSync(libraryDir)) {
          fs.mkdirSync(libraryDir, { recursive: true })
        }
        
        // Load existing library
        let libraryData = { models: [] }
        if (fs.existsSync(libraryPath)) {
          libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
        }
        
        let importedModel
        let hasModelFiles = false
        
        // Check file type
        if (req.file.originalname.endsWith('.zip')) {
          // Handle ZIP import
          const zip = new AdmZip.default(req.file.buffer)
          const zipEntries = zip.getEntries()
          
          // Find and parse library_metadata.json
          const metadataEntry = zipEntries.find(e => e.entryName === 'library_metadata.json')
          if (!metadataEntry) {
            return res.status(400).json({ error: 'Invalid ZIP: missing library_metadata.json' })
          }
          
          const metadata = JSON.parse(metadataEntry.getData().toString('utf8'))
          const libraryInfo = metadata.libraryData
          
          if (!libraryInfo || !libraryInfo.name) {
            return res.status(400).json({ error: 'Invalid library metadata' })
          }
          
          // Extract model files to saved_models directory
          const appliance = sanitizeApplianceName(metadata.appliance || libraryInfo.deviceType || libraryInfo.name)
          const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
          
          // Create model directory
          if (fs.existsSync(modelDir)) {
            // Remove existing model
            fs.rmSync(modelDir, { recursive: true, force: true })
          }
          fs.mkdirSync(modelDir, { recursive: true })
          
          // Extract all model files
          zipEntries.forEach(entry => {
            if (entry.entryName.startsWith('model/')) {
              const fileName = entry.entryName.replace('model/', '')
              if (fileName) {
                const filePath = path.join(modelDir, fileName)
                const fileDir = path.dirname(filePath)
                if (!fs.existsSync(fileDir)) {
                  fs.mkdirSync(fileDir, { recursive: true })
                }
                fs.writeFileSync(filePath, entry.getData())
              }
            }
          })
          
          hasModelFiles = true
          
          // Create imported model
          importedModel = {
            ...libraryInfo,
            id: Date.now().toString(),
            linkedApplianceName: appliance,
            hasTrainedModel: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          
          console.log(`📥 Imported model with files: ${importedModel.name} (appliance: ${appliance})`)
          
        } else if (req.file.originalname.endsWith('.json')) {
          // Handle JSON import (metadata only)
          const jsonData = JSON.parse(req.file.buffer.toString('utf8'))
          const model = jsonData.model || jsonData
          
          if (!model || !model.name) {
            return res.status(400).json({ error: 'Invalid model data' })
          }
          
          importedModel = {
            ...model,
            id: Date.now().toString(),
            hasTrainedModel: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          
          console.log(`📥 Imported model metadata: ${importedModel.name}`)
        } else {
          return res.status(400).json({ error: 'Invalid file type. Only .json and .zip files are supported' })
        }
        
        libraryData.models.push(importedModel)
        
        // Save library
        fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2))
        
        res.json({ 
          success: true,
          model: importedModel,
          hasModelFiles 
        })
        
      } catch (innerError) {
        console.error('Error processing import:', innerError)
        res.status(500).json({ 
          error: 'Failed to process import',
          message: innerError.message 
        })
      }
    })
    
  } catch (error) {
    console.error('Error importing model:', error)
    res.status(500).json({ 
      error: 'Failed to import model',
      message: error.message 
    })
  }
})

// Link a trained TensorFlow model to a library model
app.post('/api/library/models/:id/link', (req, res) => {
  try {
    const { id } = req.params
    const { applianceName } = req.body
    
    if (!applianceName) {
      return res.status(400).json({ error: 'Missing applianceName' })
    }
    
    const libraryPath = path.join(__dirname, 'library', 'models.json')
    
    if (!fs.existsSync(libraryPath)) {
      return res.status(404).json({ error: 'Library not found' })
    }
    
    const libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
    const modelIndex = libraryData.models.findIndex(m => m.id === id)
    
    if (modelIndex === -1) {
      return res.status(404).json({ error: 'Model not found' })
    }
    
    // Check if TensorFlow model exists
    const tfModelPath = path.join(__dirname, 'models', sanitizeApplianceName(applianceName))
    const hasTrainedModel = fs.existsSync(tfModelPath)
    
    // Update model with linked appliance name
    libraryData.models[modelIndex] = {
      ...libraryData.models[modelIndex],
      linkedApplianceName: applianceName,
      hasTrainedModel: hasTrainedModel,
      updatedAt: new Date().toISOString()
    }
    
    // Save library
    fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2))
    
    res.json(libraryData.models[modelIndex])
  } catch (error) {
    console.error('Error linking model:', error)
    res.status(500).json({ 
      error: 'Failed to link model',
      message: error.message 
    })
  }
})

// Export ML model to library exports folder with library metadata
app.post('/api/library/export-model', async (req, res) => {
  try {
    const { appliance, libraryModelId, libraryData } = req.body
    
    if (!appliance || !libraryModelId || !libraryData) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    // Sanitize appliance name
    const sanitizedAppliance = sanitizeApplianceName(appliance)
    const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${sanitizedAppliance}_model`)
    
    if (!fs.existsSync(modelDir)) {
      return res.status(404).json({ error: `Model not found for appliance: ${appliance}` })
    }
    
    // Create library exports directory
    const exportsDir = path.join(__dirname, 'library', 'exports')
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true })
    }
    
    // Create ZIP file
    const zipFilename = `${sanitizedAppliance}_export_${new Date().toISOString().split('T')[0]}.zip`
    const zipPath = path.join(exportsDir, zipFilename)
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', {
      zlib: { level: 9 }
    })
    
    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err)
      return res.status(500).json({ error: 'Failed to create archive', message: err.message })
    })
    
    // Pipe archive to file
    archive.pipe(output)
    
    // Add all model files
    archive.directory(modelDir, 'model')
    
    // Add library metadata as a JSON file
    const exportMetadata = {
      exportDate: new Date().toISOString(),
      appliance: appliance,
      libraryModelId: libraryModelId,
      libraryData: libraryData,
      exportVersion: '1.0.0'
    }
    archive.append(JSON.stringify(exportMetadata, null, 2), { name: 'library_metadata.json' })
    
    // Finalize and wait for completion
    await archive.finalize()
    
    // Wait for output stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
    })
    
    console.log(`📦 Created export: ${zipPath}`)
    
    res.json({ 
      success: true, 
      exportPath: zipPath,
      filename: zipFilename,
      size: archive.pointer()
    })
    
  } catch (error) {
    console.error('Error exporting model to library:', error)
    res.status(500).json({ 
      error: 'Failed to export model',
      message: error.message 
    })
  }
})

// ============================================================================
// END LIBRARY MANAGEMENT API
// ============================================================================

// Catch-all route to serve frontend for client-side routing
// Note: This must be the LAST route defined, after all API routes
app.use((req, res, next) => {
  // Skip if this is an API route
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found', path: req.path })
  }
  
  const distPath = path.join(__dirname, '..', 'dist', 'index.html')
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath)
  } else {
    res.status(404).send('Frontend not built. Run "npm run build" first.')
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Power Viewer API server running on http://localhost:${PORT}`)
  console.log(`📊 Ready to proxy Home Assistant requests`)
  
  // Load existing model metadata if available
  const modelsDir = path.join(__dirname, 'ml', 'models')
  
  if (fs.existsSync(modelsDir)) {
    try {
      // Find most recent model
      const modelDirs = fs.readdirSync(modelsDir)
        .filter(item => fs.statSync(path.join(modelsDir, item)).isDirectory())
        .sort((a, b) => parseInt(b) - parseInt(a)) // Sort by timestamp (newest first)
      
      if (modelDirs.length > 0) {
        currentModelId = modelDirs[0]
        const modelDir = path.join(modelsDir, currentModelId)
        const metadataPath = path.join(modelDir, 'metadata.json')
        
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
          trainingMetadata = metadata
          mlTags = metadata.uniqueTags || []
          mlStats = metadata.stats || null
          trainingHistory = metadata.trainingHistory || []
          console.log(`✅ Loaded training metadata from ${metadata.trainedAt}`)
          console.log(`   - Model ID: ${currentModelId}`)
          console.log(`   - ${metadata.datasetInfo?.numberOfDays || 'N/A'} days of training data`)
          console.log(`   - ${mlTags.length} unique tags`)
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to load training metadata:', err.message)
    }
  }
})

// ============================================================
// GSP NILM ENDPOINTS
// ============================================================

// GSP Disaggregation - Analyze day
app.post('/api/gsp/analyze-day', async (req, res) => {
  try {
    const { date, powerData, config } = req.body

    if (!date) {
      return res.status(400).json({ error: 'Missing date parameter' })
    }

    if (!powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing or invalid powerData array' })
    }

    // Format power data for GSP
    const formattedData = powerData.map(dp => ({
      timestamp: dp.timestamp || dp.last_changed || dp.last_updated,
      power: parseFloat(dp.power || dp.value || dp.state || 0)
    }))

    console.log(`Running GSP disaggregation for ${date} with ${formattedData.length} data points`)

    // Run GSP disaggregation (pure JavaScript - no Python!)
    const result = disaggregatePower(formattedData, config || null)

    res.json({
      success: true,
      date,
      appliances: result.appliances,
      numAppliances: result.numAppliances,
      config: result.config,
      message: result.message
    })

  } catch (error) {
    console.error('GSP analyze-day error:', error)
    res.status(500).json({
      error: 'Failed to run GSP analysis',
      message: error.message
    })
  }
})

// Get GSP configuration info
app.get('/api/gsp/config', (req, res) => {
  res.json({
    algorithm: 'GSP (Graph Signal Processing)',
    description: 'Training-less energy disaggregation using graph signal processing',
    trainingRequired: false,
    parameters: {
      sigma: {
        default: 20,
        description: 'Gaussian kernel parameter for clustering',
        range: [5, 50]
      },
      ri: {
        default: 0.15,
        description: 'Coefficient of variation threshold',
        range: [0.05, 0.3]
      },
      T_Positive: {
        default: 20,
        description: 'Positive event threshold in Watts',
        range: [10, 100]
      },
      T_Negative: {
        default: -20,
        description: 'Negative event threshold in Watts',
        range: [-100, -10]
      },
      alpha: {
        default: 0.5,
        description: 'Weight for magnitude matching (0-1)',
        range: [0, 1]
      },
      beta: {
        default: 0.5,
        description: 'Weight for temporal matching (0-1)',
        range: [0, 1]
      },
      instancelimit: {
        default: 3,
        description: 'Minimum number of appliance ON instances',
        range: [2, 10]
      }
    }
  })
})
// ============================================================================

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  autoPredictor.stop()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully')
  autoPredictor.stop()
  process.exit(0)
})
