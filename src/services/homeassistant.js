/**
 * Home Assistant integration service via backend proxy
 */

// Backend API URL - configure this based on your setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let sessionId = null

/**
 * Connect to Home Assistant via backend proxy
 * @param {string} url - Home Assistant URL
 * @param {string} token - Long-lived access token
 * @param {string} entityId - Entity ID for power sensor
 */
export async function connectToHA(url, token, entityId) {
  const response = await fetch(`${API_URL}/api/ha/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, token, entityId })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to connect')
  }
  
  const data = await response.json()
  sessionId = data.sessionId
  
  // Store sessionId in localStorage
  localStorage.setItem('haSessionId', sessionId)
  
  return true
}

/**
 * Fetch history data for a specific entity
 * @param {string} url - Home Assistant URL (not used with proxy, kept for compatibility)
 * @param {string} token - Access token (not used with proxy, kept for compatibility)
 * @param {string} entityId - Entity ID to fetch history for
 * @param {Date} startTime - Start time
 * @param {Date} endTime - End time
 */
export async function fetchHistory(url, token, entityId, startTime, endTime) {
  // Use stored sessionId
  const session = sessionId || localStorage.getItem('haSessionId')
  
  if (!session) {
    throw new Error('No active session. Please reconnect.')
  }
  
  const response = await fetch(`${API_URL}/api/ha/history`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId: session,
      entityId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to fetch history')
  }
  
  const result = await response.json()
  return result.data || []
}

/**
 * Get current state of an entity
 * @param {string} url - Home Assistant URL (not used with proxy)
 * @param {string} token - Access token (not used with proxy)
 * @param {string} entityId - Entity ID
 */
export async function getState(url, token, entityId) {
  const session = sessionId || localStorage.getItem('haSessionId')
  
  if (!session) {
    throw new Error('No active session. Please reconnect.')
  }
  
  const response = await fetch(`${API_URL}/api/ha/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId: session,
      entityId
    })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to get state')
  }
  
  const result = await response.json()
  return result.data
}

/**
 * List all entities
 * @param {string} url - Home Assistant URL (not used with proxy)
 * @param {string} token - Access token (not used with proxy)
 */
export async function getEntities(url, token) {
  const session = sessionId || localStorage.getItem('haSessionId')
  
  if (!session) {
    throw new Error('No active session. Please reconnect.')
  }
  
  const response = await fetch(`${API_URL}/api/ha/entities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId: session
    })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to get entities')
  }
  
  const result = await response.json()
  return result.data
}

/**
 * Disconnect from Home Assistant
 */
export async function disconnect() {
  const session = sessionId || localStorage.getItem('haSessionId')
  
  if (session) {
    try {
      await fetch(`${API_URL}/api/ha/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: session })
      })
    } catch (error) {
      console.error('Disconnect error:', error)
    }
    
    localStorage.removeItem('haSessionId')
    sessionId = null
  }
}
