import * as tf from '@tensorflow/tfjs-node-gpu'

/**
 * Sliding Window Predictor - Simple implementation using base predictor logic
 * Slides across a day with configurable step size
 */
class SlidingWindowPredictor {
  constructor(model, tags, stats, stepSizeMinutes = 10) {
    this.model = model // TensorFlow model
    this.tags = tags // Array of tag names
    this.stats = stats // { minPower, maxPower } for normalization
    this.stepSizeMinutes = stepSizeMinutes // Step between predictions
    this.lookbackWindows = 5 // Need 5x10min = 50min lookback
    this.windowSizeMs = 10 * 60 * 1000 // 10 minutes
    this.targetPoints = 300 // 5 windows x 60 points per window
  }

  /**
   * Make predictions for a day with sliding window
   * @param {Array} sortedData - Array of {timestamp, value} sorted by time
   * @param {Date} targetDate - The date to predict for
   * @param {number} threshold - Probability threshold for multi-label
   * @returns {Array} Array of predictions with time ranges
   */
  async predictDay(sortedData, targetDate, threshold = 0.3) {
    const predictions = []
    
    // Store sortedData for later use in merge
    this.sortedData = sortedData
    
    // Calculate day boundaries in UTC to match data timestamps
    // const targetDate = new Date(date)
    const dayStartTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
    const dayEndTime = dayStartTime + (24 * 60 * 60 * 1000)
    this.dayStartTime = dayStartTime
    
    // Step size in milliseconds
    const stepSizeMs = this.stepSizeMinutes * 60 * 1000
    const lookbackMs = this.lookbackWindows * this.windowSizeMs
    
    console.log(`Starting predictions from ${new Date(dayStartTime).toISOString()}`)
    console.log(`Step size: ${this.stepSizeMinutes} minutes`)
    
    let currentTime = dayStartTime
    let predictionCount = 0
    
    // Slide across the day
    while (currentTime < dayEndTime) {
      // The model predicts what's happening in the LAST 10 minutes of the lookback window
      // Lookback: currentTime-50 to currentTime
      // Prediction: currentTime-10 to currentTime (the last 10 min of lookback)
      const lookbackStart = currentTime - lookbackMs - this.windowSizeMs
      const lookbackEnd = currentTime
      
      const predictionWindowStart = currentTime - this.windowSizeMs
      const predictionWindowEnd = currentTime
      
      const historyData = sortedData.filter(d => {
        const t = new Date(d.timestamp).getTime()
        return t >= lookbackStart && t < lookbackEnd
      })
      
      if (historyData.length >= 10) {
        try {
          // Extract power values
          const powers = historyData.map(d => parseFloat(d.value))
          
          // Resample to 300 points
          const resampled = this.resample(powers, this.targetPoints)
          
          // Normalize
          const normalized = this.normalize(resampled)
          
          // Create tensor [1, 300, 1]
          const inputTensor = tf.tensor([normalized]).expandDims(-1)
          
          // Predict
          const predictionTensor = this.model.predict(inputTensor)
          const predictionArray = await predictionTensor.array()
          
          // Get tag probabilities
          const tagProbabilities = this.tags.map((tag, idx) => ({
            tag,
            probability: predictionArray[0][idx]
          }))
          
          // Sort and filter by threshold
          tagProbabilities.sort((a, b) => b.probability - a.probability)
          const predictedTags = tagProbabilities.filter(t => t.probability >= threshold)
          
          // Get main tag
          const predictedTag = predictedTags.length > 0 ? predictedTags[0].tag : tagProbabilities[0].tag
          const confidence = predictedTags.length > 0 ? predictedTags[0].probability : tagProbabilities[0].probability
          
          // Calculate average power and energy for display
          const windowData = sortedData.filter(d => {
            const t = new Date(d.timestamp).getTime()
            return t >= predictionWindowStart && t < predictionWindowEnd
          })
          
          let avgPower = 0
          let energy = 0
          if (windowData.length > 0) {
            const windowPowers = windowData.map(d => parseFloat(d.value))
            avgPower = windowPowers.reduce((sum, p) => sum + p, 0) / windowPowers.length
            energy = avgPower * (10 / 60) // 10 minutes in hours
          }
          
          // Format time strings in UTC to match data
          const startDate = new Date(predictionWindowStart)
          const endDate = new Date(predictionWindowEnd)
          const startTimeStr = startDate.toTimeString().substring(0, 5)
          const endTimeStr = endDate.toTimeString().substring(0, 5)
          
          predictions.push({
            startTime: startTimeStr,
            endTime: endTimeStr,
            tag: predictedTag,
            tags: predictedTags,
            confidence: confidence,
            avgPower: avgPower,
            energy: energy,
            allProbabilities: tagProbabilities
          })
          
          predictionCount++
          
          // Cleanup
          inputTensor.dispose()
          predictionTensor.dispose()
          
        } catch (err) {
          console.warn(`Prediction failed for ${new Date(currentTime).toISOString()}:`, err.message)
        }
      }
      
      // Move to next step
      currentTime += stepSizeMs
    }
    
    console.log(`✅ Generated ${predictions.length} predictions`)
    
    // Merge overlapping predictions
    const merged = this.mergeOverlappingPredictions(predictions)
    console.log(`✅ After merging: ${merged.length} predictions`)
    
    return merged
  }
  
  /**
   * Merge overlapping time range predictions
   * Splits overlapping 10-min windows into non-overlapping segments
   * and merges predictions for each segment
   */
  mergeOverlappingPredictions(predictions) {
    if (predictions.length === 0) return predictions
    
    // Sort predictions by start time to ensure proper ordering
    predictions.sort((a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime))
    
    // Collect all unique time boundaries
    const timePoints = new Set()
    predictions.forEach(p => {
      timePoints.add(this.timeToMinutes(p.startTime))
      timePoints.add(this.timeToMinutes(p.endTime))
    })
    
    // Convert to sorted array
    const sortedTimes = Array.from(timePoints).sort((a, b) => a - b)
    
    // Create non-overlapping segments
    const segments = []
    for (let i = 0; i < sortedTimes.length - 1; i++) {
      const segmentStart = sortedTimes[i]
      const segmentEnd = sortedTimes[i + 1]
      
      // Find all predictions that cover this segment
      const coveringPredictions = predictions.filter(p => {
        const pStart = this.timeToMinutes(p.startTime)
        const pEnd = this.timeToMinutes(p.endTime)
        return pStart <= segmentStart && pEnd >= segmentEnd
      })
      
      if (coveringPredictions.length > 0) {
        // Merge all predictions covering this segment
        const merged = this.mergePredictionData(coveringPredictions)
        
        // Calculate actual power and energy from measured data for this segment
        const segmentStartMs = this.dayStartTime + (segmentStart * 60 * 1000)
        const segmentEndMs = this.dayStartTime + (segmentEnd * 60 * 1000)
        
        const segmentData = this.sortedData.filter(d => {
          const t = new Date(d.timestamp).getTime()
          return t >= segmentStartMs && t < segmentEndMs
        })
        
        let avgPower = 0
        let energy = 0
        if (segmentData.length > 0) {
          const powers = segmentData.map(d => parseFloat(d.value))
          avgPower = powers.reduce((sum, p) => sum + p, 0) / powers.length
          const durationHours = (segmentEnd - segmentStart) / 60 // Convert minutes to hours
          energy = avgPower * durationHours
        }
        
        segments.push({
          startTime: this.minutesToTime(segmentStart),
          endTime: this.minutesToTime(segmentEnd),
          ...merged,
          avgPower: avgPower,
          energy: energy
        })
      }
    }
    
    return segments
  }
  
  /**
   * Merge prediction data (tags, confidence) from multiple predictions
   */
  mergePredictionData(predictions) {
    // Average confidence
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
    
    // Merge tags - average probabilities across all predictions
    const tagMap = new Map()
    predictions.forEach(pred => {
      pred.tags.forEach(t => {
        if (tagMap.has(t.tag)) {
          tagMap.set(t.tag, tagMap.get(t.tag) + t.probability)
        } else {
          tagMap.set(t.tag, t.probability)
        }
      })
    })
    
    // Average the probabilities
    tagMap.forEach((sum, tag) => {
      tagMap.set(tag, sum / predictions.length)
    })
    
    // Convert to array and sort
    const mergedTags = Array.from(tagMap.entries())
      .map(([tag, probability]) => ({ tag, probability }))
      .sort((a, b) => b.probability - a.probability)
    
    // Merge allProbabilities similarly
    const allProbMap = new Map()
    predictions.forEach(pred => {
      pred.allProbabilities.forEach(t => {
        if (allProbMap.has(t.tag)) {
          allProbMap.set(t.tag, allProbMap.get(t.tag) + t.probability)
        } else {
          allProbMap.set(t.tag, t.probability)
        }
      })
    })
    
    // Average the probabilities
    allProbMap.forEach((sum, tag) => {
      allProbMap.set(tag, sum / predictions.length)
    })
    
    const allProbabilities = Array.from(allProbMap.entries())
      .map(([tag, probability]) => ({ tag, probability }))
      .sort((a, b) => b.probability - a.probability)
    
    return {
      tag: mergedTags.length > 0 ? mergedTags[0].tag : 'unknown',
      tags: mergedTags,
      confidence: mergedTags.length > 0 ? mergedTags[0].probability : avgConfidence,
      allProbabilities: allProbabilities
    }
  }
  
  /**
   * Convert minutes since midnight to HH:MM time string
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }
  
  /**
   * Convert HH:MM time string to minutes since midnight
   */
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  /**
   * Resample array to target number of points using linear interpolation
   */
  resample(values, targetPoints) {
    const resampled = []
    for (let i = 0; i < targetPoints; i++) {
      const position = (i / (targetPoints - 1)) * (values.length - 1)
      const lowerIndex = Math.floor(position)
      const upperIndex = Math.min(Math.ceil(position), values.length - 1)
      const fraction = position - lowerIndex
      const value = values[lowerIndex] * (1 - fraction) + values[upperIndex] * fraction
      resampled.push(value)
    }
    return resampled
  }
  
  /**
   * Normalize values using training stats
   */
  normalize(values) {
    let minPower = this.stats.minPower
    let maxPower = this.stats.maxPower
    
    // Safety check: handle null/invalid stats from older models
    if (minPower == null || !isFinite(minPower)) {
      console.warn('⚠️  Warning: Invalid minPower in stats, using 0')
      minPower = 0
    }
    if (maxPower == null || !isFinite(maxPower)) {
      console.warn('⚠️  Warning: Invalid maxPower in stats, using 10000')
      maxPower = 10000
    }
    
    const range = maxPower - minPower
    return values.map(p => range > 0 ? (p - minPower) / range : 0)
  }
}

export { SlidingWindowPredictor }
