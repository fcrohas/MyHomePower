import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { PowerTagPredictor } from './ml/model.js'
import { loadAllData, prepareTrainingData, createTensors, preparePredictionInput } from './ml/dataPreprocessing.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' })) // Increase limit for large power data arrays
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Store HA connection info (in production, use a proper session management)
let haConnections = new Map()

// ML model instance and training state
let mlModel = null
let mlStats = null
let mlTags = []
let trainingInProgress = false
let trainingHistory = []

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Power Viewer API is running' })
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

// ===== ML ENDPOINTS =====

// Train ML model
app.post('/api/ml/train', async (req, res) => {
  if (trainingInProgress) {
    return res.status(409).json({ error: 'Training already in progress' })
  }

  try {
    trainingInProgress = true
    trainingHistory = []

    console.log('🧠 Starting ML model training...')

    // Load all data from data folder
    const dataDir = path.join(__dirname, '..', 'data')
    const datasets = loadAllData(dataDir)

    if (datasets.length === 0) {
      throw new Error('No training data found in data folder')
    }

    // Prepare training data
    const { xData, yData, uniqueTags, stats } = prepareTrainingData(datasets)
    mlTags = uniqueTags
    mlStats = stats

    // Create tensors
    const { xTrain, yTrain, xVal, yVal } = createTensors(xData, yData, 0.8)

    // Build model
    mlModel = new PowerTagPredictor()
    mlModel.setTags(uniqueTags)
    mlModel.buildModel(60, 5, uniqueTags.length)

    // Set up SSE for streaming training progress
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    // Training callback
    const onEpochEnd = async (epoch, logs) => {
      const progress = {
        epoch: epoch + 1,
        loss: logs.loss,
        accuracy: logs.acc,
        valLoss: logs.val_loss,
        valAccuracy: logs.val_acc
      }
      trainingHistory.push(progress)

      // Send progress via SSE
      res.write(`data: ${JSON.stringify(progress)}\n\n`)
    }

    // Train the model
    const epochs = 20
    const batchSize = 32

    await mlModel.train(xTrain, yTrain, xVal, yVal, epochs, batchSize, onEpochEnd)

    // Save the model
    const modelDir = path.join(__dirname, 'ml', 'saved_model')
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true })
    }
    await mlModel.save(modelDir)

    // Save metadata
    const metadata = {
      uniqueTags: mlTags,
      stats: mlStats,
      trainedAt: new Date().toISOString(),
      trainingHistory: trainingHistory
    }
    fs.writeFileSync(
      path.join(modelDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    )

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
    historyLength: trainingHistory.length
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

// Predict tags for next 10 minutes
app.post('/api/ml/predict', async (req, res) => {
  try {
    const { powerData } = req.body

    if (!powerData || !Array.isArray(powerData)) {
      return res.status(400).json({ error: 'Missing or invalid powerData array' })
    }

    // Load model if not in memory
    if (!mlModel) {
      const modelDir = path.join(__dirname, 'ml', 'saved_model')
      const metadataPath = path.join(modelDir, 'metadata.json')

      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: 'No trained model found. Please train the model first.' })
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      mlTags = metadata.uniqueTags
      mlStats = metadata.stats

      mlModel = new PowerTagPredictor()
      mlModel.setTags(mlTags)
      await mlModel.load(modelDir)

      console.log('✅ ML model loaded from disk')
    }

    // Prepare input (last 50 minutes of data)
    const inputTensor = preparePredictionInput(powerData, mlStats)

    // Make prediction
    const predictions = mlModel.predict(inputTensor)
    const predictionArray = await predictions.array()

    // Get probabilities for each tag
    const tagProbabilities = mlTags.map((tag, idx) => ({
      tag,
      probability: predictionArray[0][idx]
    }))

    // Sort by probability
    tagProbabilities.sort((a, b) => b.probability - a.probability)

    // Get predicted tag (highest probability)
    const predictedTag = tagProbabilities[0].tag
    const confidence = tagProbabilities[0].probability

    // Clean up
    inputTensor.dispose()
    predictions.dispose()

    res.json({
      predictedTag,
      confidence,
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Power Viewer API server running on http://localhost:${PORT}`)
  console.log(`📊 Ready to proxy Home Assistant requests`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully')
  process.exit(0)
})
