/**
 * Auto-predictor service for frontend
 */

// Backend API URL
const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * Start the auto-predictor
 * @param {string} sessionId - Home Assistant session ID
 * @param {Object} config - Configuration options
 */
export async function startAutoPredictor(sessionId, config = {}) {
  const response = await fetch(`${API_URL}/api/auto-predictor/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId,
      ...config
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to start auto-predictor')
  }

  return await response.json()
}

/**
 * Stop the auto-predictor
 */
export async function stopAutoPredictor() {
  const response = await fetch(`${API_URL}/api/auto-predictor/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to stop auto-predictor')
  }

  return await response.json()
}

/**
 * Get auto-predictor status
 */
export async function getAutoPredictorStatus() {
  const response = await fetch(`${API_URL}/api/auto-predictor/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to get status')
  }

  return await response.json()
}

/**
 * Trigger a manual prediction run
 */
export async function triggerManualRun() {
  const response = await fetch(`${API_URL}/api/auto-predictor/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to trigger run')
  }

  return await response.json()
}
