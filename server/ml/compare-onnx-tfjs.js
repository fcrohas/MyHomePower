import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'
import tf from './tf-provider.js'
import { PowerTagPredictor } from './model.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Compare ONNX and TensorFlow.js predictions
 * 
 * Usage:
 *   node compare-onnx-tfjs.js <appliance> [testDate]
 * 
 * Example:
 *   node compare-onnx-tfjs.js kettle 2025-12-20
 *   node compare-onnx-tfjs.js water_heater  (uses random data)
 */

async function compareModels() {
  const args = process.argv.slice(2)
  const appliance = args[0] || 'kettle'
  const testDate = args[1] // Optional: if provided, load real data

  console.log('='.repeat(60))
  console.log('ONNX vs TensorFlow.js COMPARISON')
  console.log('='.repeat(60))
  console.log(`Appliance: ${appliance}`)
  if (testDate) {
    console.log(`Test Date: ${testDate} (using real data)`)
  } else {
    console.log('Using random test data')
  }
  console.log('='.repeat(60))
  console.log()

  try {
    // Setup paths
    const modelDir = path.join(__dirname, 'saved_models', `seq2point_${appliance}_model`)
    const metadataPath = path.join(modelDir, 'metadata.json')
    const onnxPath = path.join(modelDir, 'model.onnx')

    // Check if both models exist
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Model metadata not found: ${metadataPath}`)
    }

    if (!fs.existsSync(onnxPath)) {
      throw new Error(`ONNX model not found: ${onnxPath}. Run conversion first.`)
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

    // Load TensorFlow.js model
    console.log('📦 Loading TensorFlow.js model...')
    const tfjsModel = new PowerTagPredictor()
    tfjsModel.setNormalizationParams({
      mainsMean: metadata.mainsStats.mean,
      mainsStd: metadata.mainsStats.std,
      applianceMean: metadata.applianceStats.mean,
      applianceStd: metadata.applianceStats.std
    })
    await tfjsModel.load(modelDir)
    console.log('✅ TensorFlow.js model loaded')

    // Load ONNX model
    console.log('📦 Loading ONNX model...')
    const onnxModel = new PowerTagPredictor()
    onnxModel.setNormalizationParams({
      mainsMean: metadata.mainsStats.mean,
      mainsStd: metadata.mainsStats.std,
      applianceMean: metadata.applianceStats.mean,
      applianceStd: metadata.applianceStats.std
    })
    await onnxModel.loadONNX(onnxPath)
    console.log('✅ ONNX model loaded')
    console.log()

    // Load test data from data folder
    const dataDir = path.join(__dirname, '../../data')
    const windowLength = metadata.windowLength || 599
    
    // Find available data files
    const dataFiles = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('power-data-') && f.endsWith('.json'))
      .sort()
      .reverse() // Most recent first
    
    if (dataFiles.length === 0) {
      throw new Error('No power data files found in data directory')
    }
    
    const useDate = testDate || dataFiles[0].replace('power-data-', '').replace('.json', '')
    const powerDataPath = path.join(dataDir, `power-data-${useDate}.json`)
    
    if (!fs.existsSync(powerDataPath)) {
      throw new Error(`Power data not found: ${powerDataPath}`)
    }
    
    console.log(`📂 Loading test data from ${useDate}...`)
    const powerFileData = JSON.parse(fs.readFileSync(powerDataPath, 'utf-8'))
    const aggregatePowers = powerFileData.data.map(dp => dp.power || 0)
    console.log(`✅ Loaded ${aggregatePowers.length} power readings`)
    
    // Use all data for full day comparison (with sliding window)
    const offset = Math.floor(windowLength / 2)
    
    // Create sliding windows from the entire day
    const windows = []
    const timestamps = []
    
    for (let i = 0; i <= aggregatePowers.length - windowLength; i++) {
      const window = []
      for (let j = 0; j < windowLength; j++) {
        const normalized = (aggregatePowers[i + j] - metadata.mainsStats.mean) / metadata.mainsStats.std
        window.push(normalized)
      }
      windows.push(window)
      
      // Get timestamp for the midpoint of this window
      if (powerFileData.data[i + offset] && powerFileData.data[i + offset].time) {
        timestamps.push(powerFileData.data[i + offset].time)
      } else {
        timestamps.push(`Sample ${i + offset}`)
      }
    }
    
    const batchSize = windows.length
    const testInput = tf.tensor2d(windows.flat(), [batchSize, windowLength])
    console.log(`Test input shape: [${batchSize}, ${windowLength}] (full day with sliding windows)`)
    console.log(`Processing ${batchSize} predictions for the day...`)
    console.log()

    // Run predictions
    console.log('🔄 Running TensorFlow.js predictions...')
    const tfjsPredStart = Date.now()
    const tfjsPredictions = await tfjsModel.predict(testInput)
    const tfjsTime = Date.now() - tfjsPredStart
    
    // Handle multi-task vs single-task models
    let tfjsNormalized
    if (Array.isArray(tfjsPredictions)) {
      console.log('  Model is multi-task (power + on/off), comparing power output only')
      tfjsNormalized = await tfjsPredictions[0].data()
    } else {
      tfjsNormalized = await tfjsPredictions.data()
    }
    
    console.log(`  TensorFlow.js raw output (first 3): ${Array.from(tfjsNormalized.slice(0, 3)).map(v => v.toFixed(4)).join(', ')}`)
    console.log(`  Denorm params: mean=${metadata.applianceStats.mean.toFixed(2)}, std=${metadata.applianceStats.std.toFixed(2)}`)
    
    // Denormalize to watts
    const tfjsResults = tfjsNormalized.map(norm => 
      Math.max(0, (norm * metadata.applianceStats.std) + metadata.applianceStats.mean)
    )
    console.log(`✅ TensorFlow.js completed in ${tfjsTime}ms`)

    console.log('🔄 Running ONNX predictions...')
    const onnxPredStart = Date.now()
    const onnxPredictions = await onnxModel.predict(testInput)
    const onnxTime = Date.now() - onnxPredStart
    
    // Handle multi-task vs single-task models
    let onnxNormalized
    if (Array.isArray(onnxPredictions)) {
      onnxNormalized = await onnxPredictions[0].data()
    } else {
      onnxNormalized = await onnxPredictions.data()
    }
    
    console.log(`  ONNX raw output (first 3): ${Array.from(onnxNormalized.slice(0, 3)).map(v => v.toFixed(4)).join(', ')}`)
    
    // Denormalize to watts
    const onnxResults = onnxNormalized.map(norm => 
      Math.max(0, (norm * metadata.applianceStats.std) + metadata.applianceStats.mean)
    )
    console.log(`✅ ONNX completed in ${onnxTime}ms`)
    console.log()

    // Compare results
    console.log('📊 COMPARISON RESULTS:')
    console.log('='.repeat(60))
    console.log(`Speed: ONNX is ${(tfjsTime / onnxTime).toFixed(2)}x faster`)
    console.log()

    // Calculate statistics
    let maxDiff = 0
    let sumAbsDiff = 0
    let sumRelDiff = 0
    
    for (let i = 0; i < tfjsResults.length; i++) {
      const diff = Math.abs(tfjsResults[i] - onnxResults[i])
      const relDiff = tfjsResults[i] !== 0 ? diff / Math.abs(tfjsResults[i]) : 0
      
      maxDiff = Math.max(maxDiff, diff)
      sumAbsDiff += diff
      sumRelDiff += relDiff
    }

    const meanAbsDiff = sumAbsDiff / tfjsResults.length
    const meanRelDiff = (sumRelDiff / tfjsResults.length) * 100

    console.log('Accuracy Metrics:')
    console.log(`  Mean Absolute Difference: ${meanAbsDiff.toFixed(6)} W`)
    console.log(`  Mean Relative Difference: ${meanRelDiff.toFixed(4)}%`)
    console.log(`  Max Absolute Difference:  ${maxDiff.toFixed(6)} W`)
    console.log()

    // Create hourly visualization
    console.log('Hourly Average Predictions (W):')
    console.log('Time  | TensorFlow.js  | ONNX           | Difference | Bar Chart')
    console.log('-'.repeat(80))
    
    // Group by hour
    const hourlyData = {}
    for (let i = 0; i < timestamps.length; i++) {
      const time = timestamps[i]
      const hour = typeof time === 'string' && time.includes('T') 
        ? time.split('T')[1].substring(0, 2) 
        : Math.floor(i / (timestamps.length / 24)).toString().padStart(2, '0')
      
      if (!hourlyData[hour]) {
        hourlyData[hour] = { tfjs: [], onnx: [] }
      }
      hourlyData[hour].tfjs.push(tfjsResults[i])
      hourlyData[hour].onnx.push(onnxResults[i])
    }
    
    // Display hourly averages with bar charts
    Object.keys(hourlyData).sort().forEach(hour => {
      const tfjsAvg = hourlyData[hour].tfjs.reduce((a, b) => a + b, 0) / hourlyData[hour].tfjs.length
      const onnxAvg = hourlyData[hour].onnx.reduce((a, b) => a + b, 0) / hourlyData[hour].onnx.length
      const diff = tfjsAvg - onnxAvg
      
      // Create simple bar chart (scale to fit terminal)
      const maxVal = Math.max(tfjsAvg, onnxAvg, 1)
      const scale = 20 / maxVal  // 20 chars max width
      const tfjsBar = '█'.repeat(Math.round(tfjsAvg * scale))
      const onnxBar = '█'.repeat(Math.round(onnxAvg * scale))
      
      console.log(`${hour}:00 | ${tfjsAvg.toFixed(2).padStart(14)} | ${onnxAvg.toFixed(2).padStart(14)} | ${diff.toFixed(2).padStart(10)} | ${tfjsBar}`)
      console.log(`      |                |                |            | ${onnxBar}`)
    })
    console.log()

    // Evaluation
    if (meanAbsDiff < 0.01 && meanRelDiff < 0.1) {
      console.log('✅ EXCELLENT: Models are virtually identical')
    } else if (meanAbsDiff < 1.0 && meanRelDiff < 1.0) {
      console.log('✅ GOOD: Models have acceptable differences (< 1W, < 1%)')
    } else if (meanAbsDiff < 10.0 && meanRelDiff < 5.0) {
      console.log('⚠️  ACCEPTABLE: Models have small differences but should work')
    } else if (meanAbsDiff < 100.0 && meanRelDiff < 20.0) {
      console.log('⚠️  MODERATE: Models have noticeable differences')
    } else {
      console.log('❌ WARNING: Models have significant differences!')
      console.log('   This could indicate a conversion issue.')
    }

    // Cleanup
    testInput.dispose()
    if (Array.isArray(tfjsPredictions)) {
      tfjsPredictions.forEach(t => t.dispose())
    } else {
      tfjsPredictions.dispose()
    }
    if (Array.isArray(onnxPredictions)) {
      onnxPredictions.forEach(t => t.dispose())
    } else {
      onnxPredictions.dispose()
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

compareModels()
