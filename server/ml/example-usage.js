/**
 * Example usage of the improved multi-label prediction with sliding window
 */

import PowerTagPredictor from './model.js'
import SlidingWindowPredictor from './slidingWindowPredictor.js'
import { loadAllData, prepareTrainingData, createTensors } from './dataPreprocessing.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function trainAndPredict() {
  console.log('=== Multi-Label Power Tag Prediction Example ===\n')

  // 1. Load data
  const dataDir = path.join(__dirname, '../../data')
  const datasets = loadAllData(dataDir)

  // 2. Prepare training data with data augmentation (1-minute step for training)
  const { xData, yData, uniqueTags, stats } = prepareTrainingData(
    datasets,
    5,  // numWindows (5 x 10min = 50min lookback)
    10, // windowSizeMinutes
    60, // pointsPerWindow (60 points per 10min window)
    1   // stepSizeMinutes (1-minute step for more training samples)
  )

  console.log(`Unique tags: ${uniqueTags.join(', ')}\n`)

  // 3. Create tensors and split train/validation
  const { xTrain, yTrain, xVal, yVal } = createTensors(xData, yData, 0.8)

  // 4. Build and train model
  const model = new PowerTagPredictor()
  model.setTags(uniqueTags)
  model.buildModel(300, 1, uniqueTags.length) // 300 = 5 windows * 60 points
  model.summary()

  console.log('\n=== Training (Multi-Label Classification) ===')
  await model.train(xTrain, yTrain, xVal, yVal, 30, 32, (epoch, logs) => {
    // Optional: Save model every 10 epochs
    if ((epoch + 1) % 10 === 0) {
      const savePath = path.join(__dirname, 'saved_model')
      model.save(savePath).catch(err => console.error('Save error:', err))
    }
  })

  // 5. Save final model
  const savePath = path.join(__dirname, 'saved_model')
  await model.save(savePath)

  // Clean up training tensors
  xTrain.dispose()
  yTrain.dispose()
  xVal.dispose()
  yVal.dispose()

  console.log('\n=== Prediction with Sliding Window ===')

  // 6. Create sliding window predictor
  // Try different configurations:
  
  // Option A: Balanced (recommended for most cases)
  const predictor = new SlidingWindowPredictor(
    model,
    50,  // windowSize: 50 minutes
    5,   // stepSize: 5 minutes (good balance)
    6    // timeStepsPerMinute: 6 (for 10-second intervals)
  )

  // Option B: High precision (slower)
  // const predictor = new SlidingWindowPredictor(model, 50, 1, 6)

  // Option C: Fast (less precise)
  // const predictor = new SlidingWindowPredictor(model, 50, 10, 6)

  // 7. Make predictions on a full day
  const testDay = datasets[0]
  const powerValues = testDay.powerData.data.map(d => d.power)

  console.log(`\nPredicting day: ${testDay.date}`)
  console.log(`Data points: ${powerValues.length}`)

  // Standard sliding window prediction
  const predictions = await predictor.predictDay(powerValues, 0.3)
  console.log(`\nGenerated ${predictions.length} minute-level predictions`)

  // 8. Format predictions into time ranges
  const timeRanges = predictor.formatPredictions(predictions)
  console.log(`\n=== Detected Activity Time Ranges ===`)
  timeRanges.forEach(range => {
    const tagStr = range.tags.map(t => `${t.tag} (${(t.prob * 100).toFixed(1)}%)`).join(', ')
    console.log(`${range.startTime} - ${range.endTime}: ${tagStr}`)
  })

  // 9. Example: Adaptive sliding window (adjusts speed based on confidence)
  console.log('\n=== Adaptive Sliding Window (Experimental) ===')
  const adaptivePredictions = await predictor.predictDayAdaptive(powerValues, 0.3)
  const adaptiveRanges = predictor.formatPredictions(adaptivePredictions)
  console.log(`Generated ${adaptivePredictions.length} minute-level predictions (adaptive)`)
  console.log(`\nFirst 5 time ranges:`)
  adaptiveRanges.slice(0, 5).forEach(range => {
    const tagStr = range.tags.map(t => `${t.tag} (${(t.prob * 100).toFixed(1)}%)`).join(', ')
    console.log(`${range.startTime} - ${range.endTime}: ${tagStr}`)
  })

  // 10. Cleanup
  model.dispose()

  console.log('\n✅ Done!')
}

// Example: Load existing model and predict
async function predictWithExistingModel() {
  console.log('=== Loading Existing Model for Prediction ===\n')

  // Load model
  const modelPath = path.join(__dirname, 'saved_model')
  const model = new PowerTagPredictor()
  await model.load(modelPath)

  // Load metadata (tags)
  const metadataPath = path.join(modelPath, 'metadata.json')
  const fs = await import('fs')
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
  model.setTags(metadata.uniqueTags)

  console.log(`Loaded model with tags: ${metadata.uniqueTags.join(', ')}`)

  // Create predictor
  const predictor = new SlidingWindowPredictor(model, 50, 5, 6)

  // Load some test data
  const dataDir = path.join(__dirname, '../../data')
  const datasets = loadAllData(dataDir)
  const testDay = datasets[0]
  const powerValues = testDay.powerData.data.map(d => d.power)

  // Predict
  console.log(`\nPredicting day: ${testDay.date}`)
  const predictions = await predictor.predictDay(powerValues, 0.3)
  const timeRanges = predictor.formatPredictions(predictions)

  console.log(`\n=== Detected Activities ===`)
  timeRanges.forEach(range => {
    if (range.tags.length > 0) {
      const tagStr = range.tags.map(t => `${t.tag} (${(t.prob * 100).toFixed(1)}%)`).join(', ')
      console.log(`${range.startTime} - ${range.endTime}: ${tagStr}`)
    }
  })

  model.dispose()
}

// Run example
if (import.meta.url === `file://${process.argv[1]}`) {
  trainAndPredict()
    .then(() => console.log('\nExample completed successfully'))
    .catch(err => console.error('Error:', err))
}

export { trainAndPredict, predictWithExistingModel }
