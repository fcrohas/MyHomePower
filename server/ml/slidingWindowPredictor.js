import * as tf from '@tensorflow/tfjs-node'

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
    
    // Calculate day boundaries in UTC to match data timestamps
    // const targetDate = new Date(date)
    const dayStartTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
    const dayEndTime = dayStartTime + (24 * 60 * 60 * 1000)
    
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
      const lookbackStart = currentTime - lookbackMs
      const lookbackEnd = currentTime
      
      const predictionWindowStart = currentTime 
      const predictionWindowEnd = currentTime + this.windowSizeMs
      
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
          
          // Log first few predictions for debugging
          if (predictionCount <= 3) {
            console.log(`Prediction ${predictionCount}:`)
            console.log(`  Lookback: ${new Date(lookbackStart).toISOString()} to ${new Date(lookbackEnd).toISOString()}`)
            console.log(`  Predicting: ${startTimeStr}-${endTimeStr}`)
            console.log(`  Tags: ${predictedTags.map(t => t.tag).join(', ')}`)
          }
          
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
    return predictions
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
    const minPower = this.stats.minPower
    const maxPower = this.stats.maxPower
    const range = maxPower - minPower
    return values.map(p => range > 0 ? (p - minPower) / range : 0)
  }
}

export { SlidingWindowPredictor }
