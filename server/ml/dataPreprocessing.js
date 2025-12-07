import * as tf from '@tensorflow/tfjs-node'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Data preprocessing utilities for power usage and tag data
 */

/**
 * Load all power data and tag files from the data folder
 * @param {string} dataDir - Path to data directory
 * @param {string} startDate - Optional start date (YYYY-MM-DD)
 * @param {string} endDate - Optional end date (YYYY-MM-DD)
 * @returns {Array} Array of {powerData, tagData, date}
 */
export function loadAllData(dataDir, startDate = null, endDate = null) {
  const files = fs.readdirSync(dataDir)
  const powerFiles = files.filter(f => f.startsWith('power-data-'))
  const tagFiles = files.filter(f => f.startsWith('power-tags-'))

  const datasets = []

  for (const powerFile of powerFiles) {
    const date = powerFile.match(/power-data-(\d{4}-\d{2}-\d{2})\.json/)[1]
    
    // Filter by date range if provided
    if (startDate && date < startDate) continue
    if (endDate && date > endDate) continue
    
    const tagFile = `power-tags-${date}.json`

    if (tagFiles.includes(tagFile)) {
      const powerPath = path.join(dataDir, powerFile)
      const tagPath = path.join(dataDir, tagFile)

      const powerData = JSON.parse(fs.readFileSync(powerPath, 'utf-8'))
      const tagData = JSON.parse(fs.readFileSync(tagPath, 'utf-8'))

      datasets.push({ powerData, tagData, date })
    }
  }

  if (startDate || endDate) {
    console.log(`Loaded ${datasets.length} days of data (filtered: ${startDate || 'any'} to ${endDate || 'any'})`)
  } else {
    console.log(`Loaded ${datasets.length} days of data`)
  }
  return datasets
}

/**
 * Parse time string (HH:MM) to minutes from midnight
 * @param {string} timeStr - Time string like "14:30"
 * @returns {number} Minutes from midnight
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Get tag for a specific timestamp (supports multi-label)
 * @param {string} timestamp - ISO timestamp
 * @param {Array} tagEntries - Array of tag entries
 * @returns {Array<string>} Array of tag labels (can be multiple), or ['standby'] if none
 */
function getTagsForTimestamp(timestamp, tagEntries) {
  const date = new Date(timestamp)
  const timeMinutes = date.getHours() * 60 + date.getMinutes()

  const tags = []
  for (const entry of tagEntries) {
    const startMinutes = timeToMinutes(entry.startTime)
    const endMinutes = timeToMinutes(entry.endTime)

    if (timeMinutes >= startMinutes && timeMinutes <= endMinutes) {
      // Split comma-separated tags and trim whitespace
      const entryTags = entry.label.split(',').map(tag => tag.trim())
      tags.push(...entryTags)
    }
  }

  return tags.length > 0 ? tags : ['standby']
}

/**
 * Create time windows of power data
 * @param {Array} dataPoints - Power data points
 * @param {number} windowSizeMinutes - Size of each window in minutes
 * @param {number} stepSizeMinutes - Step size between windows in minutes
 * @returns {Array} Array of windows, each containing data points
 */
function createWindows(dataPoints, windowSizeMinutes = 10, stepSizeMinutes = 10) {
  const windows = []
  const windowSizeMs = windowSizeMinutes * 60 * 1000

  if (dataPoints.length === 0) return windows

  const startTime = new Date(dataPoints[0].timestamp).getTime()
  const endTime = new Date(dataPoints[dataPoints.length - 1].timestamp).getTime()

  let currentTime = startTime
  while (currentTime + windowSizeMs <= endTime) {
    const windowEnd = currentTime + windowSizeMs

    const windowData = dataPoints.filter(dp => {
      const dpTime = new Date(dp.timestamp).getTime()
      return dpTime >= currentTime && dpTime < windowEnd
    })

    if (windowData.length > 0) {
      windows.push({
        start: new Date(currentTime),
        end: new Date(windowEnd),
        data: windowData
      })
    }

    currentTime += stepSizeMinutes * 60 * 1000
  }

  return windows
}

/**
 * Resample window data to fixed number of points
 * @param {Array} windowData - Data points in a window
 * @param {number} targetPoints - Target number of points
 * @returns {Array} Resampled power values
 */
function resampleWindow(windowData, targetPoints = 60) {
  if (windowData.length === 0) {
    return new Array(targetPoints).fill(0)
  }

  const powers = windowData.map(dp => dp.power)

  // If we have exactly the right number of points, return them
  if (powers.length === targetPoints) {
    return powers
  }

  // Linear interpolation/downsampling
  const resampled = []
  for (let i = 0; i < targetPoints; i++) {
    const position = (i / (targetPoints - 1)) * (powers.length - 1)
    const lowerIndex = Math.floor(position)
    const upperIndex = Math.min(Math.ceil(position), powers.length - 1)
    const fraction = position - lowerIndex

    const value = powers[lowerIndex] * (1 - fraction) + powers[upperIndex] * fraction
    resampled.push(value)
  }

  return resampled
}

/**
 * Normalize power values (min-max normalization)
 * @param {Array} values - Power values
 * @param {number} min - Min value (if known)
 * @param {number} max - Max value (if known)
 * @returns {Object} {normalized, min, max}
 */
function normalize(values, min = null, max = null) {
  // Safety checks for invalid min/max
  if (min == null || !isFinite(min)) {
    min = Math.min(...values)
  }
  if (max == null || !isFinite(max)) {
    max = Math.max(...values)
  }

  const range = max - min || 1 // Avoid division by zero

  const normalized = values.map(v => (v - min) / range)
  return { normalized, min, max }
}

/**
 * Prepare training data from all datasets
 * @param {Array} datasets - Array of {powerData, tagData, date}
 * @param {number} numWindows - Number of input windows (5 for 50 minutes)
 * @param {number} windowSizeMinutes - Size of each window
 * @param {number} pointsPerWindow - Number of points per window after resampling
 * @param {number} stepSizeMinutes - Step size between samples for data augmentation (default 1 minute)
 * @returns {Object} {xData, yData, uniqueTags, stats}
 */
export function prepareTrainingData(
  datasets,
  numWindows = 5,
  windowSizeMinutes = 10,
  pointsPerWindow = 60,
  stepSizeMinutes = 1,
  selectedTags = null
) {
  console.log('Preparing training data...')
  console.log(`Using sliding window with step size: ${stepSizeMinutes} minutes`)

  const allSamples = []
  const allTags = new Set()

  // Collect all power values for normalization
  const allPowerValues = []

  for (const { powerData, tagData } of datasets) {
    const dataPoints = powerData.data
    const validPowers = dataPoints.map(dp => dp.power).filter(p => p != null && !isNaN(p))
    allPowerValues.push(...validPowers)
    console.log(`  Date ${powerData.date || 'unknown'}: ${dataPoints.length} points, ${validPowers.length} valid powers`)

    // Create windows with smaller step size for data augmentation
    const windows = createWindows(dataPoints, windowSizeMinutes, stepSizeMinutes)

    // Create samples: each sample uses numWindows windows to predict next window's tag
    // We need numWindows consecutive windows plus 1 target window
    // Since windows now overlap, we create more training samples
    for (let i = 0; i <= windows.length - numWindows - 1; i++) {
      const inputWindows = windows.slice(i, i + numWindows)
      const targetWindow = windows[i + numWindows]

      // Get the tags for the target window (middle of the window) - supports multi-label
      const targetTimestamp = new Date(
        (targetWindow.start.getTime() + targetWindow.end.getTime()) / 2
      ).toISOString()
      const tags = getTagsForTimestamp(targetTimestamp, tagData.entries)

      // If selectedTags filter is provided, include samples with selected tags OR standby
      if (selectedTags && selectedTags.length > 0) {
        const hasSelectedTag = tags.some(tag => selectedTags.includes(tag))
        
        let finalTags
        if (!hasSelectedTag) {
          finalTags = ['standby']
          allTags.add('standby')
        } else {
          finalTags = tags.filter(tag => selectedTags.includes(tag))
          if (finalTags.length === 0) {
            finalTags = ['standby']
          }
          finalTags.forEach(tag => allTags.add(tag))
        }
        
        allSamples.push({
          inputWindows,
          targetTags: finalTags
        })
      } else {
        // Add all tags to the set
        tags.forEach(tag => allTags.add(tag))
        allSamples.push({
          inputWindows,
          targetTags: tags
        })
      }
    }
  }

  console.log(`Created ${allSamples.length} training samples`)
  console.log(`Unique tags: ${allTags.size}`)
  console.log(`Total power values collected: ${allPowerValues.length}`)
  
  // Check for class imbalance
  const tagCounts = {}
  for (const sample of allSamples) {
    for (const tag of sample.targetTags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
  }
  
  console.log('Tag distribution:')
  Array.from(allTags).sort().forEach(tag => {
    const count = tagCounts[tag] || 0
    const percentage = ((count / allSamples.length) * 100).toFixed(1)
    console.log(`  ${tag}: ${count} samples (${percentage}%)`)
  })

  // Calculate normalization parameters without spread operator to avoid stack overflow
  let minPower = Infinity
  let maxPower = -Infinity
  for (const power of allPowerValues) {
    if (power != null && !isNaN(power)) {
      if (power < minPower) minPower = power
      if (power > maxPower) maxPower = power
    }
  }
  
  // Safety check: if no valid power values found, use sensible defaults
  if (!isFinite(minPower) || !isFinite(maxPower)) {
    console.warn(`⚠️  Warning: Could not calculate power range from data. Using defaults.`)
    minPower = 0
    maxPower = 10000
  }
  
  console.log(`Power range: ${minPower}W - ${maxPower}W`)

  // Convert tags to array and create encoding map
  const uniqueTags = Array.from(allTags).sort()
  const tagToIndex = {}
  uniqueTags.forEach((tag, idx) => {
    tagToIndex[tag] = idx
  })

  // Prepare X and Y data
  const xData = []
  const yData = []

  for (const sample of allSamples) {
    // Process input windows
    const windowsData = []
    for (const window of sample.inputWindows) {
      const resampled = resampleWindow(window.data, pointsPerWindow)
      const { normalized } = normalize(resampled, minPower, maxPower)
      windowsData.push(normalized)
    }
    xData.push(windowsData)

    // Multi-hot encode target tags (multi-label encoding)
    const multiHot = new Array(uniqueTags.length).fill(0)
    for (const tag of sample.targetTags) {
      const tagIndex = tagToIndex[tag]
      if (tagIndex !== undefined) {
        multiHot[tagIndex] = 1
      }
    }
    yData.push(multiHot)
  }

  console.log(`X shape: [${xData.length}, ${numWindows}, ${pointsPerWindow}]`)
  console.log(`Y shape: [${yData.length}, ${uniqueTags.length}]`)

  return {
    xData,
    yData,
    uniqueTags,
    stats: { minPower, maxPower }
  }
}

/**
 * Convert prepared data to TensorFlow tensors
 * @param {Array} xData - Input data
 * @param {Array} yData - Output data
 * @param {number} trainSplit - Fraction of data to use for training (rest for validation)
 * @returns {Object} {xTrain, yTrain, xVal, yVal}
 */
export function createTensors(xData, yData, trainSplit = 0.8) {
  const numSamples = xData.length
  const splitIndex = Math.floor(numSamples * trainSplit)

  // Shuffle data
  const indices = Array.from({ length: numSamples }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  const xShuffled = indices.map(i => xData[i])
  const yShuffled = indices.map(i => yData[i])

  // Split into train and validation
  const xTrainData = xShuffled.slice(0, splitIndex)
  const yTrainData = yShuffled.slice(0, splitIndex)
  const xValData = xShuffled.slice(splitIndex)
  const yValData = yShuffled.slice(splitIndex)

  console.log(`Split: ${xTrainData.length} training, ${xValData.length} validation samples`)
  
  // Flatten windows: [numSamples, numWindows, pointsPerWindow] -> [numSamples, numWindows * pointsPerWindow]
  const flattenWindows = (data) => {
    return data.map(sample => sample.flat())
  }
  
  const xTrainFlat = flattenWindows(xTrainData)
  const xValFlat = flattenWindows(xValData)

  // Create tensors and add channel dimension
  // Shape: [batch, totalTimeSteps] -> [batch, totalTimeSteps, 1]
  const xTrain = tf.tensor(xTrainFlat).expandDims(-1)
  const yTrain = tf.tensor(yTrainData)
  const xVal = tf.tensor(xValFlat).expandDims(-1)
  const yVal = tf.tensor(yValData)

  console.log('Tensors created:')
  console.log(`  xTrain: ${xTrain.shape}`)
  console.log(`  yTrain: ${yTrain.shape}`)
  console.log(`  xVal: ${xVal.shape}`)
  console.log(`  yVal: ${yVal.shape}`)

  return { xTrain, yTrain, xVal, yVal }
}

/**
 * Prepare prediction input from power data
 * @param {Array} powerDataPoints - Array of power data points (last 50 minutes)
 * @param {Object} stats - Normalization stats {minPower, maxPower}
 * @param {number} numWindows - Number of windows
 * @param {number} pointsPerWindow - Points per window
 * @returns {tf.Tensor} Input tensor ready for prediction
 */
export function preparePredictionInput(
  powerDataPoints,
  stats,
  numWindows = 5,
  pointsPerWindow = 60
) {
  const windowSizeMinutes = 10
  const windows = createWindows(powerDataPoints, windowSizeMinutes, windowSizeMinutes)

  if (windows.length < numWindows) {
    throw new Error(`Need at least ${numWindows} windows of data (${numWindows * windowSizeMinutes} minutes)`)
  }

  // Take the last numWindows windows
  const inputWindows = windows.slice(-numWindows)

  // Process windows
  const windowsData = []
  for (const window of inputWindows) {
    const resampled = resampleWindow(window.data, pointsPerWindow)
    const { normalized } = normalize(resampled, stats.minPower, stats.maxPower)
    windowsData.push(normalized)
  }

  // Flatten all windows into a single sequence
  const flatData = windowsData.flat()

  // Create tensor with batch dimension and channel dimension
  // Shape: [1, totalTimeSteps, 1]
  return tf.tensor([flatData]).expandDims(-1)
}

export default {
  loadAllData,
  prepareTrainingData,
  createTensors,
  preparePredictionInput
}
