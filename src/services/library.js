/**
 * Library Service
 * Handles API calls for managing appliance model libraries
 */

const API_BASE = 'http://localhost:3001/api'

/**
 * Get all models from the library
 */
export async function getModels() {
  const response = await fetch(`${API_BASE}/library/models`)
  if (!response.ok) {
    throw new Error('Failed to fetch models')
  }
  return await response.json()
}

/**
 * Create a new model in the library
 */
export async function createModel(modelData) {
  const response = await fetch(`${API_BASE}/library/models`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(modelData)
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to create model')
  }
  
  return await response.json()
}

/**
 * Update an existing model
 */
export async function updateModel(modelId, modelData) {
  const response = await fetch(`${API_BASE}/library/models/${modelId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(modelData)
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to update model')
  }
  
  return await response.json()
}

/**
 * Delete a model from the library
 */
export async function deleteModel(modelId) {
  const response = await fetch(`${API_BASE}/library/models/${modelId}`, {
    method: 'DELETE'
  })
  
  if (!response.ok) {
    throw new Error('Failed to delete model')
  }
  
  return await response.json()
}

/**
 * Export a model as a JSON file
 */
export async function exportModel(modelId) {
  const response = await fetch(`${API_BASE}/library/export/${modelId}`)
  
  if (!response.ok) {
    throw new Error('Failed to export model')
  }
  
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `model-${modelId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

/**
 * Import a model from a JSON file
 */
export async function importModel(file) {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await fetch(`${API_BASE}/library/import`, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to import model')
  }
  
  return await response.json()
}

/**
 * Link a trained TensorFlow model to a library model
 */
export async function linkTFModel(modelId, applianceName) {
  const response = await fetch(`${API_BASE}/library/models/${modelId}/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ applianceName })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to link TensorFlow model')
  }
  
  return await response.json()
}
