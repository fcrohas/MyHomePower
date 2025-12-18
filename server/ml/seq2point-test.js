import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'
import { PowerTagPredictor } from './model.js'
import { prepareSeq2PointInput, denormalizePower } from './seq2pointPreprocessing.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Test a trained seq2point model
 * 
 * Usage:
 *   node seq2point-test.js <appliance> <testDate>
 * 
 * Example:
 *   node seq2point-test.js kettle 2025-12-07
 */

async function testSeq2PointModel() {
  const args = process.argv.slice(2)
  const appliance = args[0] || 'kettle'
  const testDate = args[1] || '2025-12-07'

  console.log('='.repeat(60))
  console.log('SEQ2POINT MODEL TESTING')
  console.log('='.repeat(60))
  console.log(`Appliance: ${appliance}`)
  console.log(`Test Date: ${testDate}`)
  console.log('='.repeat(60))
  console.log()

  try {
    // Setup paths
    const dataDir = path.join(__dirname, '../../data')
    const modelPath = path.join(__dirname, 'saved_models', `seq2point_${appliance}_model`)
    const metadataPath = path.join(modelPath, 'metadata.json')

    // Load metadata
    console.log('📖 Loading model metadata...')
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Model metadata not found: ${metadataPath}`)
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    const { windowLength, mainsStats, applianceStats } = metadata
    console.log(`   Window length: ${windowLength}`)
    console.log(`   Mains stats: mean=${mainsStats.mean.toFixed(2)}, std=${mainsStats.std.toFixed(2)}`)
    console.log(`   Appliance stats: mean=${applianceStats.mean.toFixed(2)}, std=${applianceStats.std.toFixed(2)}`)

    // Load model
    console.log('\n🔄 Loading model...')
    const model = new PowerTagPredictor()
    model.setNormalizationParams({
      mainsMean: mainsStats.mean,
      mainsStd: mainsStats.std,
      applianceMean: applianceStats.mean,
      applianceStd: applianceStats.std
    })
    await model.load(modelPath)
    console.log('✅ Model loaded successfully')

    // Load test data
    console.log(`\n📊 Loading test data for ${testDate}...`)
    const powerDataPath = path.join(dataDir, `power-data-${testDate}.json`)
    const tagDataPath = path.join(dataDir, `power-tags-${testDate}.json`)

    if (!fs.existsSync(powerDataPath)) {
      throw new Error(`Power data not found: ${powerDataPath}`)
    }

    const powerData = JSON.parse(fs.readFileSync(powerDataPath, 'utf-8'))
    const aggregatePowers = powerData.data.map(dp => dp.power || 0)
    console.log(`   Loaded ${aggregatePowers.length} power readings`)

    // Load ground truth if available
    let tagData = null
    let groundTruth = null
    if (fs.existsSync(tagDataPath)) {
      tagData = JSON.parse(fs.readFileSync(tagDataPath, 'utf-8'))
      console.log(`   Tag data available for comparison`)
      
      // Create ground truth array
      groundTruth = new Array(aggregatePowers.length).fill(0)
      for (let i = 0; i < powerData.data.length; i++) {
        const timestamp = powerData.data[i].timestamp
        const tags = getTagsForTimestamp(timestamp, tagData.entries)
        if (tags.includes(appliance)) {
          groundTruth[i] = aggregatePowers[i]
        }
      }
    }

    // Make predictions using sliding window
    console.log('\n🔮 Making predictions...')
    const offset = Math.floor(windowLength / 2)
    const predictions = []
    const timestamps = powerData.data.map(dp => dp.timestamp)

    const startTime = Date.now()

    for (let i = 0; i <= aggregatePowers.length - windowLength; i++) {
      const window = aggregatePowers.slice(i, i + windowLength)
      const inputTensor = prepareSeq2PointInput(window, windowLength, mainsStats)
      
      const predictionResult = model.predict(inputTensor)
      
      // Handle multi-task output (array) or single-task output (tensor)
      let powerTensor, onoffTensor
      if (Array.isArray(predictionResult)) {
        // Multi-task: [powerPredictions, onoffPredictions]
        powerTensor = predictionResult[0]
        onoffTensor = predictionResult[1]
      } else {
        // Single-task: just power
        powerTensor = predictionResult
        onoffTensor = null
      }
      
      const normalizedPred = await powerTensor.data()
      const denormalizedPred = denormalizePower(normalizedPred[0], applianceStats)
      
      predictions.push(denormalizedPred)
      
      inputTensor.dispose()
      powerTensor.dispose()
      if (onoffTensor) onoffTensor.dispose()

      // Progress indicator
      if ((i + 1) % 1000 === 0) {
        process.stdout.write(`\r   Progress: ${i + 1}/${aggregatePowers.length - windowLength + 1}`)
      }
    }

    const inferenceTime = (Date.now() - startTime) / 1000
    console.log(`\n   Completed in ${inferenceTime.toFixed(2)}s`)
    console.log(`   Generated ${predictions.length} predictions`)

    // Align predictions with original timestamps (accounting for offset)
    const alignedPredictions = new Array(aggregatePowers.length).fill(0)
    for (let i = 0; i < predictions.length; i++) {
      const midpointIndex = i + offset
      alignedPredictions[midpointIndex] = predictions[i]
    }

    // Calculate metrics if ground truth available
    if (groundTruth) {
      console.log('\n📊 Evaluation Metrics:')
      
      // Calculate MSE, MAE
      let sumSquaredError = 0
      let sumAbsError = 0
      let count = 0

      for (let i = offset; i < alignedPredictions.length - offset; i++) {
        const pred = alignedPredictions[i]
        const actual = groundTruth[i]
        const error = pred - actual
        sumSquaredError += error * error
        sumAbsError += Math.abs(error)
        count++
      }

      const mse = sumSquaredError / count
      const mae = sumAbsError / count
      const rmse = Math.sqrt(mse)

      console.log(`   MSE: ${mse.toFixed(2)} W²`)
      console.log(`   MAE: ${mae.toFixed(2)} W`)
      console.log(`   RMSE: ${rmse.toFixed(2)} W`)

      // Calculate accuracy (percentage of correctly identified on/off states)
      const threshold = applianceStats.onPowerThreshold || 20
      let correctStates = 0
      let totalStates = 0

      for (let i = offset; i < alignedPredictions.length - offset; i++) {
        const predOn = alignedPredictions[i] > threshold
        const actualOn = groundTruth[i] > threshold
        if (predOn === actualOn) correctStates++
        totalStates++
      }

      const accuracy = (correctStates / totalStates) * 100
      console.log(`   On/Off Accuracy: ${accuracy.toFixed(2)}%`)
    }

    // Save predictions
    console.log('\n💾 Saving predictions...')
    const resultsPath = path.join(__dirname, 'test_results', `${appliance}_${testDate}_predictions.json`)
    const resultsDir = path.join(__dirname, 'test_results')
    
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }

    const results = {
      appliance,
      testDate,
      windowLength,
      inferenceTime,
      predictions: alignedPredictions.map((pred, idx) => ({
        timestamp: timestamps[idx],
        predictedPower: Math.round(pred * 100) / 100,
        aggregatePower: aggregatePowers[idx],
        groundTruth: groundTruth ? groundTruth[idx] : null
      }))
    }

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
    console.log(`✅ Results saved to: ${resultsPath}`)

    // Print power distribution statistics
    console.log('\n📊 Prediction Statistics:')
    const nonZeroPredictions = alignedPredictions.filter(p => p > 10)
    const avgPredictedPower = nonZeroPredictions.length > 0 
      ? nonZeroPredictions.reduce((sum, p) => sum + p, 0) / nonZeroPredictions.length 
      : 0
    const maxPredictedPower = Math.max(...alignedPredictions)
    const minPredictedPower = Math.min(...alignedPredictions)
    
    console.log(`   Total predictions: ${alignedPredictions.length}`)
    console.log(`   Predictions > 10W: ${nonZeroPredictions.length} (${(nonZeroPredictions.length / alignedPredictions.length * 100).toFixed(1)}%)`)
    console.log(`   Average power (when on): ${avgPredictedPower.toFixed(2)}W`)
    console.log(`   Max power: ${maxPredictedPower.toFixed(2)}W`)
    console.log(`   Min power: ${minPredictedPower.toFixed(2)}W`)

    // Create hourly visualization
    console.log('\n📈 Hourly Power Profile:')
    console.log('   (Each bar represents average predicted power for that hour)')
    console.log()
    
    const hourlyData = new Array(24).fill(0).map(() => ({ sum: 0, count: 0 }))
    for (let i = 0; i < alignedPredictions.length; i++) {
      const hour = new Date(timestamps[i]).getHours()
      hourlyData[hour].sum += alignedPredictions[i]
      hourlyData[hour].count++
    }
    
    const maxHourlyAvg = Math.max(...hourlyData.map(h => h.count > 0 ? h.sum / h.count : 0))
    const scale = maxHourlyAvg > 0 ? 50 / maxHourlyAvg : 1
    
    for (let hour = 0; hour < 24; hour++) {
      const avg = hourlyData[hour].count > 0 ? hourlyData[hour].sum / hourlyData[hour].count : 0
      const barLength = Math.round(avg * scale)
      const bar = '█'.repeat(barLength)
      const hourStr = hour.toString().padStart(2, '0') + ':00'
      console.log(`   ${hourStr} ${bar} ${avg.toFixed(1)}W`)
    }

    // Show periods where appliance is predicted to be ON
    const threshold = 200  // Lowered from 50W to better detect actual ON periods
    const minDuration = 2  // Minimum duration in minutes
    console.log(`\n⚡ Detected ON Periods (power > ${threshold}W, min ${minDuration}min):`)
    let inOnPeriod = false
    let onStart = null
    let onPeriods = []
    
    for (let i = 0; i < alignedPredictions.length; i++) {
      const isOn = alignedPredictions[i] > threshold
      
      if (isOn && !inOnPeriod) {
        // Start of ON period
        onStart = i
        inOnPeriod = true
      } else if (!isOn && inOnPeriod) {
        // End of ON period
        const durationMinutes = (i - onStart) * 10 / 60  // 10s per sample
        const avgPower = alignedPredictions.slice(onStart, i).reduce((sum, p) => sum + p, 0) / (i - onStart)
        
        // Only include if duration meets minimum threshold
        if (durationMinutes >= minDuration) {
          onPeriods.push({
            start: timestamps[onStart],
            end: timestamps[i - 1],
            duration: i - onStart,
            avgPower
          })
        }
        inOnPeriod = false
      }
    }
    
    // Close last period if still on
    if (inOnPeriod) {
      const durationMinutes = (alignedPredictions.length - onStart) * 10 / 60
      const avgPower = alignedPredictions.slice(onStart).reduce((sum, p) => sum + p, 0) / (alignedPredictions.length - onStart)
      
      if (durationMinutes >= minDuration) {
        onPeriods.push({
          start: timestamps[onStart],
          end: timestamps[alignedPredictions.length - 1],
          duration: alignedPredictions.length - onStart,
          avgPower
        })
      }
    }
    
    console.log(`   Found ${onPeriods.length} ON periods`)
    for (const period of onPeriods.slice(0, 20)) {
      const startTime = new Date(period.start).toLocaleTimeString()
      const endTime = new Date(period.end).toLocaleTimeString()
      const durationMin = Math.round(period.duration * 10 / 60) // Convert to minutes
      console.log(`   ${startTime} - ${endTime} (${durationMin}min, avg: ${period.avgPower.toFixed(1)}W)`)
    }
    
    if (onPeriods.length > 20) {
      console.log(`   ... and ${onPeriods.length - 20} more periods`)
    }

    // Compare with ground truth if available
    if (groundTruth) {
      console.log('\n🎯 Ground Truth vs Predictions:')
      const actualOnPeriods = []
      inOnPeriod = false
      onStart = null
      
      for (let i = 0; i < groundTruth.length; i++) {
        const isOn = groundTruth[i] > 0
        
        if (isOn && !inOnPeriod) {
          onStart = i
          inOnPeriod = true
        } else if (!isOn && inOnPeriod) {
          actualOnPeriods.push({
            start: timestamps[onStart],
            end: timestamps[i - 1]
          })
          inOnPeriod = false
        }
      }
      
      console.log(`   Actual ON periods: ${actualOnPeriods.length}`)
      console.log(`   Predicted ON periods: ${onPeriods.length}`)
      console.log()
      console.log('   Actual periods:')
      for (const period of actualOnPeriods.slice(0, 10)) {
        const startTime = new Date(period.start).toLocaleTimeString()
        const endTime = new Date(period.end).toLocaleTimeString()
        console.log(`     ${startTime} - ${endTime}`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ TESTING COMPLETE')
    console.log('='.repeat(60))
    console.log()

  } catch (error) {
    console.error('\n❌ Error during testing:')
    console.error(error)
    process.exit(1)
  }
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

// Run testing
testSeq2PointModel()
