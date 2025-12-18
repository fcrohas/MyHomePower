import * as tf from '@tensorflow/tfjs-node'
import fs from 'fs'
import path from 'path'

/**
 * Seq2point data preprocessing utilities
 * Follows the seq2point-nilm approach for NILM
 */

/**
 * Load all power data files from data directory
 * @param {string} dataDir - Path to data directory
 * @param {string} startDate - Optional start date filter (YYYY-MM-DD)
 * @param {string} endDate - Optional end date filter (YYYY-MM-DD)
 * @returns {Array} Array of {powerData, date}
 */
export function loadPowerData(dataDir, startDate = null, endDate = null) {
  const files = fs.readdirSync(dataDir)
  const powerFiles = files.filter(f => f.startsWith('power-data-'))

  const datasets = []

  for (const powerFile of powerFiles) {
    const dateMatch = powerFile.match(/power-data-(\d{4}-\d{2}-\d{2})\.json/)
    if (!dateMatch) continue
    
    const date = dateMatch[1]
    
    // Filter by date range
    if (startDate && date < startDate) continue
    if (endDate && date > endDate) continue
    
    const powerPath = path.join(dataDir, powerFile)
    const powerData = JSON.parse(fs.readFileSync(powerPath, 'utf-8'))

    datasets.push({ powerData, date })
  }

  console.log(`Loaded ${datasets.length} days of power data`)
  return datasets
}

/**
 * Calculate normalization statistics for mains (aggregate) power
 * @param {Array} datasets - Array of {powerData, date}
 * @returns {Object} {mean, std}
 */
export function calculateMainsStats(datasets) {
  const allPowers = []
  
  for (const { powerData } of datasets) {
    const powers = powerData.data
      .map(dp => dp.power)
      .filter(p => p != null && !isNaN(p))
    allPowers.push(...powers)
  }

  if (allPowers.length === 0) {
    console.warn('⚠️  No valid power data found, using defaults')
    return { mean: 522, std: 814 }  // Defaults from paper
  }

  // Calculate mean
  const sum = allPowers.reduce((acc, val) => acc + val, 0)
  const mean = sum / allPowers.length

  // Calculate standard deviation
  const squaredDiffs = allPowers.map(val => Math.pow(val - mean, 2))
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / allPowers.length
  const std = Math.sqrt(variance)

  console.log(`Mains statistics: mean=${mean.toFixed(2)}W, std=${std.toFixed(2)}W`)
  
  return { mean, std }
}

/**
 * Calculate normalization statistics for a specific appliance/tag
 * @param {Array} datasets - Array of {powerData, tagData, date}
 * @param {string} targetTag - The appliance/tag to calculate stats for
 * @returns {Object} {mean, std, onPowerThreshold, maxOnPower}
 */
export function calculateApplianceStats(datasets, targetTag) {
  const appliancePowers = []
  
  // First, build appliance profiles for baseline subtraction
  console.log(`Building appliance profiles for statistics calculation...`)
  const applianceProfiles = {}
  
  for (const { powerData, tagData } of datasets) {
    if (!tagData) continue
    
    const dataPoints = powerData.data
    const powers = dataPoints.map(dp => dp.power || 0)
    const baselinePower = Math.min(...powers.filter(p => p > 0))
    
    for (let i = 0; i < dataPoints.length; i++) {
      const timestamp = dataPoints[i].timestamp
      const tags = getTagsForTimestamp(timestamp, tagData.entries)
      
      // Build profiles for other appliances (not target)
      if (tags.length === 1 && tags[0] !== targetTag && tags[0] !== 'standby') {
        const applianceTag = tags[0]
        const power = Math.max(0, (dataPoints[i].power || 0) - baselinePower)
        
        if (!applianceProfiles[applianceTag]) {
          applianceProfiles[applianceTag] = []
        }
        applianceProfiles[applianceTag].push(power)
      }
    }
  }
  
  // Calculate median power for each appliance
  const appliancePowers_profiles = {}
  for (const [tag, powers] of Object.entries(applianceProfiles)) {
    if (powers.length > 0) {
      powers.sort((a, b) => a - b)
      const median = powers[Math.floor(powers.length / 2)]
      appliancePowers_profiles[tag] = median
    }
  }
  
  // Now calculate stats for target appliance with baseline subtraction
  // IMPORTANT: Include BOTH on and off samples for proper normalization
  // Sample every 10th point to avoid memory issues
  for (const { powerData, tagData } of datasets) {
    if (!tagData) continue
    
    const dataPoints = powerData.data
    const powers = dataPoints.map(dp => dp.power || 0)
    const baselinePower = Math.min(...powers.filter(p => p > 0))
    
    for (let i = 0; i < dataPoints.length; i += 10) {  // Sample every 10th point
      const timestamp = dataPoints[i].timestamp
      const tags = getTagsForTimestamp(timestamp, tagData.entries)
      
      // If this timestamp has the target tag
      if (tags.includes(targetTag)) {
        const totalPower = dataPoints[i].power || 0
        let powerToSubtract = baselinePower
        
        // Subtract estimated power of other labeled appliances
        for (const tag of tags) {
          if (tag !== targetTag && tag !== 'standby' && appliancePowers_profiles[tag]) {
            powerToSubtract += appliancePowers_profiles[tag]
          }
        }
        
        const appliancePower = Math.max(0, totalPower - powerToSubtract)
        appliancePowers.push(appliancePower)
      } else {
        // Appliance is OFF - include 0 samples for proper statistics
        appliancePowers.push(0)
      }
    }
  }

  if (appliancePowers.length === 0) {
    console.warn(`⚠️  No data found for appliance: ${targetTag}`)
    return { mean: 0, std: 1, onPowerThreshold: 0, maxOnPower: 0 }
  }

  // Calculate mean and std
  const sum = appliancePowers.reduce((acc, val) => acc + val, 0)
  const mean = sum / appliancePowers.length

  const squaredDiffs = appliancePowers.map(val => Math.pow(val - mean, 2))
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / appliancePowers.length
  let std = Math.sqrt(variance)
  
  // Prevent numerical issues: std must be at least 1W
  if (std < 1.0 || isNaN(std) || !isFinite(std)) {
    console.warn(`⚠️  Invalid std (${std}), using minimum 1.0`)
    std = 1.0
  }

  // Calculate on-power threshold (mean of non-zero values)
  const nonZeroPowers = appliancePowers.filter(p => p > 0)
  const onPowerThreshold = nonZeroPowers.length > 0 
    ? Math.min(...nonZeroPowers) * 0.5 
    : 0

  const maxOnPower = Math.max(...appliancePowers)

  console.log(`Appliance "${targetTag}" statistics:`)
  console.log(`  mean=${mean.toFixed(2)}W, std=${std.toFixed(2)}W`)
  console.log(`  onPowerThreshold=${onPowerThreshold.toFixed(2)}W, maxOnPower=${maxOnPower.toFixed(2)}W`)
  
  return { mean, std, onPowerThreshold, maxOnPower }
}

/**
 * Helper: Get tags for a timestamp
 */
function getTagsForTimestamp(timestamp, tagEntries) {
  const date = new Date(timestamp)
  const timeMinutes = date.getHours() * 60 + date.getMinutes()

  const tags = []
  for (const entry of tagEntries) {
    const [startH, startM] = entry.startTime.split(':').map(Number)
    const [endH, endM] = entry.endTime.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    if (timeMinutes >= startMinutes && timeMinutes <= endMinutes) {
      const entryTags = entry.label.split(',').map(tag => tag.trim())
      tags.push(...entryTags)
    }
  }

  return tags.length > 0 ? tags : ['standby']
}

/**
 * Build appliance power profiles from periods where only one appliance is running
 */
function buildApplianceProfiles(datasets, targetTag) {
  const profiles = {}
  
  for (const { powerData, tagData, date } of datasets) {
    if (!tagData) continue
    
    const dataPoints = powerData.data
    const aggregatePowers = dataPoints.map(dp => dp.power || 0)
    const timestamps = dataPoints.map(dp => dp.timestamp)
    const baselinePower = Math.min(...aggregatePowers.filter(p => p > 0))
    
    for (let i = 0; i < timestamps.length; i++) {
      const tags = getTagsForTimestamp(timestamps[i], tagData.entries)
      
      // Only use samples where exactly ONE appliance is tagged (not including target)
      if (tags.length === 1 && tags[0] !== targetTag && tags[0] !== 'standby') {
        const applianceTag = tags[0]
        const power = Math.max(0, aggregatePowers[i] - baselinePower)
        
        if (!profiles[applianceTag]) {
          profiles[applianceTag] = []
        }
        profiles[applianceTag].push(power)
      }
    }
  }
  
  // Calculate median power for each appliance
  const appliancePowers = {}
  for (const [tag, powers] of Object.entries(profiles)) {
    if (powers.length > 0) {
      powers.sort((a, b) => a - b)
      const median = powers[Math.floor(powers.length / 2)]
      appliancePowers[tag] = median
      console.log(`  Estimated ${tag} power: ${median.toFixed(2)}W (from ${powers.length} samples)`)
    }
  }
  
  return appliancePowers
}

/**
 * Create sliding window training data for seq2point
 * @param {Array} datasets - Array of {powerData, tagData, date}
 * @param {string} targetTag - The appliance/tag to predict (e.g., 'kettle', 'microwave')
 * @param {number} windowLength - Input window length (default: 599)
 * @param {Object} mainsStats - Normalization stats for mains {mean, std}
 * @param {Object} applianceStats - Normalization stats for appliance {mean, std}
 * @returns {Object} {inputs, outputs, samplesPerDay}
 */
export function createSeq2PointTrainingData(
  datasets,
  targetTag,
  windowLength = 599,
  mainsStats,
  applianceStats
) {
  console.log(`\nCreating seq2point training data for: ${targetTag}`)
  console.log(`Window length: ${windowLength}`)
  
  // Build profiles for other appliances
  console.log(`\nBuilding appliance power profiles...`)
  const appliancePowers = buildApplianceProfiles(datasets, targetTag)
  
  const inputs = []         // Aggregate power windows
  const powerOutputs = []   // Midpoint appliance power (regression)
  const onoffOutputs = []   // Midpoint on/off state (classification)
  const offset = Math.floor(windowLength / 2)  // Midpoint offset
  
  let totalSamples = 0
  const samplesPerDay = []

  for (const { powerData, tagData, date } of datasets) {
    if (!tagData) {
      console.log(`  Skipping ${date}: no tag data`)
      continue
    }

    const dataPoints = powerData.data
    const aggregatePowers = dataPoints.map(dp => dp.power || 0)
    const timestamps = dataPoints.map(dp => dp.timestamp)
    
    // Calculate baseline power for this day (minimum power = base load)
    const baselinePower = Math.min(...aggregatePowers.filter(p => p > 0))
    console.log(`  ${date}: baseline power = ${baselinePower.toFixed(2)}W`)
    
    // Normalize aggregate power using mains stats
    const normalizedAggregate = aggregatePowers.map(p => 
      (p - mainsStats.mean) / mainsStats.std
    )

    let daySamples = 0

    // Create sliding windows
    // For each window position, we extract a window of aggregate power
    // and the corresponding appliance power at the midpoint
    for (let i = 0; i <= normalizedAggregate.length - windowLength; i++) {
      // Extract window of aggregate power
      const window = normalizedAggregate.slice(i, i + windowLength)
      
      // Get the midpoint timestamp
      const midpointIndex = i + offset
      const midpointTimestamp = timestamps[midpointIndex]
      
      // Get tags at midpoint
      const tags = getTagsForTimestamp(midpointTimestamp, tagData.entries)
      
      // Get appliance power at midpoint
      let appliancePower = 0
      let isOn = 0  // Binary on/off state
      
      if (tags.includes(targetTag)) {
        // Appliance is ON: subtract baseline and other known appliances
        const totalPower = aggregatePowers[midpointIndex] || 0
        let powerToSubtract = baselinePower
        
        // Subtract estimated power of other labeled appliances
        for (const tag of tags) {
          if (tag !== targetTag && tag !== 'standby' && appliancePowers[tag]) {
            powerToSubtract += appliancePowers[tag]
          }
        }
        
        appliancePower = Math.max(0, totalPower - powerToSubtract)
        isOn = appliancePower > applianceStats.onPowerThreshold ? 1 : 0
      }
      // else: appliance is OFF, power = 0, isOn = 0
      
      // Normalize appliance power
      const normalizedAppliancePower = (appliancePower - applianceStats.mean) / applianceStats.std
      
      inputs.push(window)
      powerOutputs.push(normalizedAppliancePower)
      onoffOutputs.push(isOn)
      daySamples++
      totalSamples++
    }

    samplesPerDay.push({ date, samples: daySamples })
    console.log(`  ${date}: ${daySamples} samples`)
  }

  console.log(`\nTotal training samples: ${totalSamples}`)
  console.log(`Average samples per day: ${(totalSamples / datasets.length).toFixed(0)}`)
  
  const onCount = onoffOutputs.filter(o => o === 1).length
  const offCount = onoffOutputs.filter(o => o === 0).length
  console.log(`On/Off distribution: ON=${onCount} (${(onCount/totalSamples*100).toFixed(1)}%), OFF=${offCount} (${(offCount/totalSamples*100).toFixed(1)}%)`)
  
  return { 
    inputs, 
    outputs: powerOutputs,      // For backward compatibility
    powerOutputs,               // Explicit power regression targets
    onoffOutputs,               // Binary on/off classification targets
    samplesPerDay, 
    totalSamples 
  }
}

/**
 * Convert prepared data to TensorFlow tensors with train/validation split
 * Uses batched processing to avoid memory issues with large datasets
 * @param {Array} inputs - Input windows [numSamples][windowLength]
 * @param {Array} outputs - Output values [numSamples] (or powerOutputs for compatibility)
 * @param {number} trainSplit - Fraction for training (default: 0.95 as per paper)
 * @param {boolean} shuffle - Whether to shuffle data (default: true)
 * @param {Array} onoffOutputs - Optional on/off binary labels for multi-task learning
 * @returns {Object} {xTrain, yTrain, xVal, yVal} or {xTrain, yPowerTrain, yOnoffTrain, xVal, yPowerVal, yOnoffVal}
 */
export function createSeq2PointTensors(
  inputs,
  outputs,
  trainSplit = 0.95,
  shuffle = true,
  onoffOutputs = null
) {
  const isMultiTask = onoffOutputs !== null
  const numSamples = inputs.length
  const splitIndex = Math.floor(numSamples * trainSplit)

  console.log(`\nCreating tensors...`)
  console.log(`Total samples: ${numSamples}`)
  console.log(`Train split: ${trainSplit} (${splitIndex} samples)`)
  console.log(`Validation: ${numSamples - splitIndex} samples`)

  // Create indices for shuffling
  let indices = Array.from({ length: numSamples }, (_, i) => i)
  
  if (shuffle) {
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    console.log('Data shuffled')
  }

  // Split indices
  const trainIndices = indices.slice(0, splitIndex)
  const valIndices = indices.slice(splitIndex)

  console.log('Creating tensors from indices (this may take a moment)...')

  // Create tensors directly from indices to avoid intermediate arrays
  // Process in chunks to avoid memory issues
  const chunkSize = 10000
  const trainTensors = []
  const trainPowerTargets = []
  const trainOnoffTargets = isMultiTask ? [] : null
  
  // Process training data in chunks
  for (let i = 0; i < trainIndices.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, trainIndices.length)
    const chunkIndices = trainIndices.slice(i, end)
    const xChunk = chunkIndices.map(idx => inputs[idx])
    const yPowerChunk = chunkIndices.map(idx => outputs[idx])
    
    trainTensors.push(tf.tensor2d(xChunk))
    trainPowerTargets.push(tf.tensor2d(yPowerChunk, [yPowerChunk.length, 1]))
    
    if (isMultiTask) {
      const yOnoffChunk = chunkIndices.map(idx => onoffOutputs[idx])
      trainOnoffTargets.push(tf.tensor2d(yOnoffChunk, [yOnoffChunk.length, 1]))
    }
    
    if ((i + chunkSize) % 50000 === 0 || end === trainIndices.length) {
      console.log(`  Processed ${end}/${trainIndices.length} training samples`)
    }
  }
  
  // Concatenate training tensors
  console.log('Concatenating training tensors...')
  const xTrain = trainTensors.length > 1 ? tf.concat(trainTensors, 0) : trainTensors[0]
  const yPowerTrain = trainPowerTargets.length > 1 ? tf.concat(trainPowerTargets, 0) : trainPowerTargets[0]
  const yOnoffTrain = isMultiTask ? (trainOnoffTargets.length > 1 ? tf.concat(trainOnoffTargets, 0) : trainOnoffTargets[0]) : null
  
  // Clean up intermediate tensors
  if (trainTensors.length > 1) {
    trainTensors.forEach(t => t.dispose())
    trainPowerTargets.forEach(t => t.dispose())
    if (isMultiTask) trainOnoffTargets.forEach(t => t.dispose())
  }

  // Process validation data (smaller, can do in one go)
  console.log('Creating validation tensors...')
  const xValData = valIndices.map(i => inputs[i])
  const yPowerValData = valIndices.map(i => outputs[i])
  const xVal = tf.tensor2d(xValData)
  const yPowerVal = tf.tensor2d(yPowerValData, [yPowerValData.length, 1])
  const yOnoffVal = isMultiTask ? tf.tensor2d(valIndices.map(i => onoffOutputs[i]), [valIndices.length, 1]) : null

  // Validate tensors for NaN/Inf
  console.log('Validating tensors for NaN/Inf...')
  const validateTensor = (tensor, name) => {
    const data = tensor.dataSync()
    let nanCount = 0
    let infCount = 0
    for (let i = 0; i < data.length; i++) {
      if (isNaN(data[i])) nanCount++
      if (!isFinite(data[i])) infCount++
    }
    if (nanCount > 0 || infCount > 0) {
      console.error(`⚠️  ${name} has ${nanCount} NaN and ${infCount} Inf values!`)
      throw new Error(`Invalid data in ${name}`)
    }
  }
  
  validateTensor(xTrain, 'xTrain')
  validateTensor(yPowerTrain, 'yPowerTrain')
  if (isMultiTask) validateTensor(yOnoffTrain, 'yOnoffTrain')
  validateTensor(xVal, 'xVal')
  validateTensor(yPowerVal, 'yPowerVal')
  if (isMultiTask) validateTensor(yOnoffVal, 'yOnoffVal')
  console.log('✅ All tensors validated (no NaN/Inf)')

  console.log('\nTensor shapes:')
  console.log(`  xTrain: [${xTrain.shape.join(', ')}]`)
  console.log(`  yPowerTrain: [${yPowerTrain.shape.join(', ')}]`)
  if (isMultiTask) console.log(`  yOnoffTrain: [${yOnoffTrain.shape.join(', ')}]`)
  console.log(`  xVal: [${xVal.shape.join(', ')}]`)
  console.log(`  yPowerVal: [${yPowerVal.shape.join(', ')}]`)
  if (isMultiTask) console.log(`  yOnoffVal: [${yOnoffVal.shape.join(', ')}]`)

  if (isMultiTask) {
    return { 
      xTrain, 
      yTrain: [yPowerTrain, yOnoffTrain],  // Multi-task: array of outputs
      xVal, 
      yVal: [yPowerVal, yOnoffVal],
      // Also provide individual tensors for manual access
      yPowerTrain, yOnoffTrain, yPowerVal, yOnoffVal
    }
  } else {
    return { xTrain, yTrain: yPowerTrain, xVal, yVal: yPowerVal }
  }
}

/**
 * Prepare test/prediction input from recent power data
 * @param {Array} aggregatePowers - Array of aggregate power values
 * @param {number} windowLength - Window length (default: 599)
 * @param {Object} mainsStats - Normalization stats {mean, std}
 * @returns {tf.Tensor} Input tensor [1, windowLength] or [numWindows, windowLength]
 */
export function prepareSeq2PointInput(
  aggregatePowers,
  windowLength = 599,
  mainsStats
) {
  if (aggregatePowers.length < windowLength) {
    throw new Error(`Need at least ${windowLength} power readings. Got ${aggregatePowers.length}`)
  }

  // Normalize
  const normalized = aggregatePowers.map(p => 
    (p - mainsStats.mean) / mainsStats.std
  )

  // Take the last window
  const window = normalized.slice(-windowLength)

  // Return as 2D tensor [1, windowLength]
  return tf.tensor2d([window])
}

/**
 * Denormalize predictions back to watts
 * @param {tf.Tensor|number} normalizedPower - Normalized power value(s)
 * @param {Object} applianceStats - Stats {mean, std}
 * @returns {tf.Tensor|number} Denormalized power in watts
 */
export function denormalizePower(normalizedPower, applianceStats) {
  if (typeof normalizedPower === 'number') {
    const power = (normalizedPower * applianceStats.std) + applianceStats.mean
    return Math.max(0, power)  // Clamp to non-negative
  }
  
  // Tensor
  return normalizedPower
    .mul(applianceStats.std)
    .add(applianceStats.mean)
    .maximum(0)  // Clamp to non-negative
}

/**
 * Load and prepare complete training dataset
 * Convenience function that combines all steps
 * @param {string} dataDir - Data directory path
 * @param {string} targetTag - Target appliance tag
 * @param {Object} options - {windowLength, trainSplit, startDate, endDate}
 * @returns {Object} Complete training package
 */
export async function prepareSeq2PointDataset(
  dataDir,
  targetTag,
  options = {}
) {
  const {
    windowLength = 599,
    trainSplit = 0.95,
    startDate = null,
    endDate = null
  } = options

  console.log('=== Preparing Seq2Point Dataset ===')
  console.log(`Target appliance: ${targetTag}`)
  console.log(`Window length: ${windowLength}`)
  console.log(`Train/val split: ${trainSplit}/${(1-trainSplit).toFixed(2)}`)

  // Load data
  const datasets = loadPowerData(dataDir, startDate, endDate)
  
  // Need to load tag data too
  const datasetsWithTags = []
  for (const dataset of datasets) {
    const tagFile = `power-tags-${dataset.date}.json`
    const tagPath = path.join(dataDir, tagFile)
    if (fs.existsSync(tagPath)) {
      const tagData = JSON.parse(fs.readFileSync(tagPath, 'utf-8'))
      datasetsWithTags.push({ ...dataset, tagData })
    }
  }

  console.log(`Loaded ${datasetsWithTags.length} days with tag data`)

  // Calculate statistics
  const mainsStats = calculateMainsStats(datasetsWithTags)
  const applianceStats = calculateApplianceStats(datasetsWithTags, targetTag)

  // Create training data
  const { inputs, powerOutputs, onoffOutputs, samplesPerDay, totalSamples } = createSeq2PointTrainingData(
    datasetsWithTags,
    targetTag,
    windowLength,
    mainsStats,
    applianceStats
  )

  // Create tensors (with multi-task on/off labels)
  const tensorData = createSeq2PointTensors(
    inputs,
    powerOutputs,
    trainSplit,
    true,  // shuffle
    onoffOutputs  // Enable multi-task learning
  )
  
  const { xTrain, yTrain, xVal, yVal } = tensorData

  console.log('\n=== Dataset Ready ===')

  return {
    xTrain,
    yTrain,
    xVal,
    yVal,
    mainsStats,
    applianceStats,
    targetTag,
    windowLength,
    totalSamples,
    samplesPerDay
  }
}

export default {
  loadPowerData,
  calculateMainsStats,
  calculateApplianceStats,
  createSeq2PointTrainingData,
  createSeq2PointTensors,
  prepareSeq2PointInput,
  denormalizePower,
  prepareSeq2PointDataset
}
