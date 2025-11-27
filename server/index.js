import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Store HA connection info (in production, use a proper session management)
let haConnections = new Map()

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
