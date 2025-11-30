import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as tf from '@tensorflow/tfjs-node'
import { PowerTagPredictor } from './ml/model.js'
import { SlidingWindowPredictor } from './ml/slidingWindowPredictor.js'
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
let trainingMetadata = null
let currentModelId = null

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

    // Prepare training data with 1-minute step for more training samples
    const { xData, yData, uniqueTags, stats } = prepareTrainingData(
      datasets,
      5,  // numWindows (5 x 10min = 50min lookback)
      10, // windowSizeMinutes
      60, // pointsPerWindow
      1   // stepSizeMinutes (1-minute step for data augmentation)
    )
    mlTags = uniqueTags
    mlStats = stats

    // Create tensors
    const { xTrain, yTrain, xVal, yVal } = createTensors(xData, yData, 0.8)

    // Build model with multi-label classification
    mlModel = new PowerTagPredictor()
    mlModel.setTags(uniqueTags)
    mlModel.buildModel(300, 1, uniqueTags.length) // 300 = 5 windows * 60 points per window

    // Set up SSE for streaming training progress
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    // Training callback
    const onEpochEnd = async (epoch, logs) => {
      const acc = logs.binaryAccuracy || logs.acc || 0
      const valAcc = logs.val_binaryAccuracy || logs.val_acc || 0
      
      const progress = {
        epoch: epoch + 1,
        loss: logs.loss,
        accuracy: acc,
        valLoss: logs.val_loss,
        valAccuracy: valAcc
      }
      trainingHistory.push(progress)

      // Send progress via SSE
      res.write(`data: ${JSON.stringify(progress)}\n\n`)
    }

    // Train the model (more epochs for multi-label classification)
    const epochs = 30
    const batchSize = 32

    await mlModel.train(xTrain, yTrain, xVal, yVal, epochs, batchSize, onEpochEnd)

    // Save the model with unique ID
    const modelId = Date.now().toString()
    const modelsBaseDir = path.join(__dirname, 'ml', 'models')
    const modelDir = path.join(modelsBaseDir, modelId)
    
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true })
    }
    
    await mlModel.save(modelDir)

    // Calculate final metrics
    const finalMetrics = trainingHistory[trainingHistory.length - 1]

    // Save metadata
    const metadata = {
      id: modelId,
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
      }
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
    const modelsDir = path.join(__dirname, 'ml', 'models')
    
    if (!fs.existsSync(modelsDir)) {
      return res.json({ models: [] })
    }

    const modelDirs = fs.readdirSync(modelsDir).filter(item => {
      const itemPath = path.join(modelsDir, item)
      return fs.statSync(itemPath).isDirectory()
    })

    const models = []
    for (const modelId of modelDirs) {
      const metadataPath = path.join(modelsDir, modelId, 'metadata.json')
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
          models.push({
            id: modelId,
            trainedAt: metadata.trainedAt,
            uniqueTags: metadata.uniqueTags,
            datasetInfo: metadata.datasetInfo,
            finalMetrics: metadata.finalMetrics,
            isActive: modelId === currentModelId
          })
        } catch (err) {
          console.warn(`Failed to load metadata for model ${modelId}:`, err.message)
        }
      }
    }

    // Sort by trained date (newest first)
    models.sort((a, b) => new Date(b.trainedAt) - new Date(a.trainedAt))

    res.json({ models, currentModelId })
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

    const modelsDir = path.join(__dirname, 'ml', 'models')
    const modelPath = path.join(modelsDir, modelId)
    const metadataPath = path.join(modelPath, 'metadata.json')

    if (!fs.existsSync(modelPath) || !fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: 'Model not found' })
    }

    // Load metadata
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

    // Load the model
    mlModel = new PowerTagPredictor()
    await mlModel.load(modelPath)
    mlModel.setTags(metadata.uniqueTags)

    // Update state
    mlTags = metadata.uniqueTags
    mlStats = metadata.stats
    trainingHistory = metadata.trainingHistory || []
    trainingMetadata = metadata
    currentModelId = modelId

    console.log(`✅ Loaded model ${modelId} from ${metadata.trainedAt}`)

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

    const modelsDir = path.join(__dirname, 'ml', 'models')
    const modelPath = path.join(modelsDir, modelId)

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

    console.log(`Making sliding window predictions for ${date} with step size: ${stepSize} minutes`)

    // Sort and format power data
    const sortedData = powerData.map(d => ({
      timestamp: d.timestamp || d.last_changed || d.last_updated,
      value: d.value || d.state || d.power
    })).filter(d => d.timestamp && d.value).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    if (sortedData.length === 0) {
      return res.status(400).json({ error: 'No valid power data provided' })
    }

    console.log(`Power data info:`)
    console.log(`  Total points: ${sortedData.length}`)
    console.log(`  First timestamp: ${sortedData[0].timestamp}`)
    console.log(`  Last timestamp: ${sortedData[sortedData.length - 1].timestamp}`)

    // Create sliding window predictor
    const predictor = new SlidingWindowPredictor(
      mlModel.model,  // Pass the TensorFlow model
      mlTags,         // Tag names
      mlStats,        // Normalization stats
      stepSize        // Step size in minutes
    )

    // Make predictions
    const targetDate = new Date(date)
    const predictions = await predictor.predictDay(sortedData, targetDate, threshold)
    
    // Calculate statistics
    const tagStats = {}
    let totalEnergy = 0
    
    predictions.forEach(pred => {
      totalEnergy += pred.energy || 0
      
      pred.tags.forEach(t => {
        if (!tagStats[t.tag]) {
          tagStats[t.tag] = { count: 0, totalProb: 0 }
        }
        tagStats[t.tag].count++
        tagStats[t.tag].totalProb += t.probability
      })
    })

    // Calculate average probability for each tag
    Object.keys(tagStats).forEach(tag => {
      tagStats[tag].avgProb = tagStats[tag].totalProb / tagStats[tag].count
    })

    res.json({
      date,
      predictions,
      totalWindows: predictions.length,
      tags: mlTags,
      tagStats,
      totalEnergy
    })

  } catch (error) {
    console.error('Sliding window prediction error:', error)
    res.status(500).json({
      error: 'Failed to make sliding window predictions',
      message: error.message
    })
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
          const predictionTensor = mlModel.predict(inputTensor)
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

    // Calculate standby baseline power from windows tagged as "standby" only
    const standbyWindows = predictions.filter(p => p.tag === 'standby')
    let standbyBaseline = 0
    if (standbyWindows.length > 0) {
      const totalStandbyPower = standbyWindows.reduce((sum, p) => sum + p.avgPower, 0)
      standbyBaseline = totalStandbyPower / standbyWindows.length
      console.log(`📊 Calculated standby baseline: ${standbyBaseline.toFixed(2)} W from ${standbyWindows.length} windows`)
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Power Viewer API server running on http://localhost:${PORT}`)
  console.log(`📊 Ready to proxy Home Assistant requests`)
  
  // Load the most recent model from models directory
  const modelsDir = path.join(__dirname, 'ml', 'models')
  
  if (fs.existsSync(modelsDir)) {
    try {
      const modelDirs = fs.readdirSync(modelsDir).filter(item => {
        const itemPath = path.join(modelsDir, item)
        return fs.statSync(itemPath).isDirectory()
      })

      if (modelDirs.length > 0) {
        // Find the most recent model
        let latestModel = null
        let latestDate = null

        for (const modelId of modelDirs) {
          const metadataPath = path.join(modelsDir, modelId, 'metadata.json')
          if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
            const trainedDate = new Date(metadata.trainedAt)
            
            if (!latestDate || trainedDate > latestDate) {
              latestDate = trainedDate
              latestModel = { id: modelId, metadata }
            }
          }
        }

        if (latestModel) {
          currentModelId = latestModel.id
          trainingMetadata = latestModel.metadata
          mlTags = latestModel.metadata.uniqueTags || []
          mlStats = latestModel.metadata.stats || null
          trainingHistory = latestModel.metadata.trainingHistory || []
          
          console.log(`✅ Loaded latest model ${currentModelId}`)
          console.log(`   - Trained: ${latestModel.metadata.trainedAt}`)
          console.log(`   - ${latestModel.metadata.datasetInfo?.numberOfDays || 'N/A'} days of training data`)
          console.log(`   - ${mlTags.length} unique tags`)
        }
      } else {
        console.log('ℹ️ No saved models found')
      }
    } catch (err) {
      console.warn('⚠️ Failed to load model:', err.message)
    }
  }
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
