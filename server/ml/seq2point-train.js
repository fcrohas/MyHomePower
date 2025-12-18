import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { PowerTagPredictor } from './model.js'
import { prepareSeq2PointDataset } from './seq2pointPreprocessing.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Train a seq2point model for a specific appliance
 * 
 * Usage:
 *   node seq2point-train.js <appliance> [windowLength] [epochs] [batchSize] [--continue]
 * 
 * Example:
 *   node seq2point-train.js kettle 599 10 128
 *   node seq2point-train.js microwave 599 15 256
 *   node seq2point-train.js climate 599 20 128 --continue  # Continue training existing model
 * 
 * For GPUs with limited memory, use: TF_GPU_ALLOCATOR=cuda_malloc_async
 */

async function trainSeq2PointModel() {
  // Parse command line arguments
  const args = process.argv.slice(2)
  const targetAppliance = args[0] || 'kettle'
  const windowLength = parseInt(args[1]) || 599
  const epochs = parseInt(args[2]) || 10
  const batchSize = parseInt(args[3]) || 128  // Works well with TF_GPU_ALLOCATOR=cuda_malloc_async
  const continueTraining = args.includes('--continue') || args.includes('-c')

  console.log('='.repeat(60))
  console.log('SEQ2POINT MODEL TRAINING')
  console.log('='.repeat(60))
  console.log(`Target Appliance: ${targetAppliance}`)
  console.log(`Window Length: ${windowLength}`)
  console.log(`Epochs: ${epochs}`)
  console.log(`Batch Size: ${batchSize}`)
  console.log(`Continue Training: ${continueTraining ? 'Yes' : 'No'}`)
  console.log('='.repeat(60))
  console.log()

  try {
    // Setup paths
    const dataDir = path.join(__dirname, '../../data')
    const modelSaveDir = path.join(__dirname, 'saved_models')
    const modelPath = path.join(modelSaveDir, `seq2point_${targetAppliance}_model`)

    // Create model save directory if it doesn't exist
    const fs = await import('fs')
    if (!fs.default.existsSync(modelSaveDir)) {
      fs.default.mkdirSync(modelSaveDir, { recursive: true })
    }

    // Step 1: Load and prepare dataset
    console.log('\n📊 STEP 1: Loading and preparing dataset...\n')
    const dataset = await prepareSeq2PointDataset(dataDir, targetAppliance, {
      windowLength,
      trainSplit: 0.95,
      // Optionally filter by date:
      // startDate: '2025-11-01',
      // endDate: '2025-12-31'
    })

    const { 
      xTrain, 
      yTrain, 
      xVal, 
      yVal, 
      mainsStats, 
      applianceStats,
      totalSamples,
      samplesPerDay
    } = dataset

    console.log('\n✅ Dataset prepared successfully')
    console.log(`   Total samples: ${totalSamples}`)
    console.log(`   Training: ${xTrain.shape[0]} samples`)
    console.log(`   Validation: ${xVal.shape[0]} samples`)

    // Step 2: Build or load model
    const model = new PowerTagPredictor()
    
    // Set normalization parameters
    model.setNormalizationParams({
      mainsMean: mainsStats.mean,
      mainsStd: mainsStats.std,
      applianceMean: applianceStats.mean,
      applianceStd: applianceStats.std
    })

    let existingEpochs = 0
    
    if (continueTraining && fs.default.existsSync(path.join(modelPath, 'model.json'))) {
      console.log('\n🔄 STEP 2: Loading existing model to continue training...\n')
      await model.load(modelPath)
      
      // Recompile the loaded model (loaded models don't retain compilation settings)
      console.log('   Compiling loaded model...')
      const tf = await import('@tensorflow/tfjs-node-gpu')
      model.model.compile({
        optimizer: tf.default.train.adam(0.001, 0.9, 0.999),
        loss: 'meanSquaredError',
        metrics: ['mse', 'mae']
      })
      model.isCompiled = true
      console.log('   ✅ Model compiled')
      
      // Load existing metadata to get epoch count
      const metadataPath = path.join(modelPath, 'metadata.json')
      if (fs.default.existsSync(metadataPath)) {
        const existingMetadata = JSON.parse(fs.default.readFileSync(metadataPath, 'utf-8'))
        existingEpochs = existingMetadata.epochs || 0
        console.log(`   Previously trained for ${existingEpochs} epochs`)
      }
      console.log(`   Will train for ${epochs} additional epochs`)
    } else {
      console.log('\n🏗️  STEP 2: Building seq2point model...\n')
      model.buildModel(windowLength, 1)  // 1 output (single appliance regression)
    }

    // Step 3: Train model
    console.log('\n🚀 STEP 3: Training model...\n')
    
    const startTime = Date.now()
    
    const history = await model.train(
      xTrain,
      yTrain,
      xVal,
      yVal,
      epochs,
      batchSize,
      null,  // onEpochEnd callback
      {
        patience: 3,
        minDelta: 1e-6
      },
      modelPath  // auto-save path
    )

    const trainTime = (Date.now() - startTime) / 1000
    console.log(`\n⏱️  Training completed in ${trainTime.toFixed(2)} seconds`)

    // Step 4: Save model and metadata
    console.log('\n💾 STEP 4: Saving model...\n')
    
    await model.save(modelPath)
    
    // Save metadata
    const totalEpochs = existingEpochs + epochs
    const metadata = {
      appliance: targetAppliance,
      windowLength,
      epochs: totalEpochs,
      batchSize,
      trainSamples: xTrain.shape[0],
      valSamples: xVal.shape[0],
      mainsStats,
      applianceStats,
      trainTime: continueTraining ? (existingEpochs > 0 ? 'continued' : trainTime) : trainTime,
      samplesPerDay,
      createdAt: new Date().toISOString(),
      ...(continueTraining && { continuedFrom: existingEpochs, additionalEpochs: epochs })
    }

    const metadataPath = path.join(modelPath, 'metadata.json')
    fs.default.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
    
    console.log(`✅ Model saved to: ${modelPath}`)
    console.log(`✅ Metadata saved to: ${metadataPath}`)

    // Step 5: Evaluate on validation set
    console.log('\n📈 STEP 5: Evaluating model...\n')
    
    const evalResults = model.model.evaluate(xVal, yVal)
    const evalLoss = await evalResults[0].data()
    const evalMSE = await evalResults[1].data()
    const evalMAE = await evalResults[2].data()
    
    console.log('Validation Results:')
    console.log(`  Loss: ${evalLoss[0].toFixed(6)}`)
    console.log(`  MSE: ${evalMSE[0].toFixed(6)}`)
    console.log(`  MAE: ${evalMAE[0].toFixed(6)}`)

    // Convert MAE back to watts
    const maeWatts = evalMAE[0] * applianceStats.std
    console.log(`  MAE in Watts: ${maeWatts.toFixed(2)}W`)

    // Cleanup
    xTrain.dispose()
    // For multi-task, yTrain is an array of tensors
    if (Array.isArray(yTrain)) {
      yTrain.forEach(t => t.dispose())
    } else {
      yTrain.dispose()
    }
    xVal.dispose()
    // For multi-task, yVal is an array of tensors
    if (Array.isArray(yVal)) {
      yVal.forEach(t => t.dispose())
    } else {
      yVal.dispose()
    }
    evalResults[0].dispose()
    evalResults[1].dispose()
    evalResults[2].dispose()

    console.log('\n' + '='.repeat(60))
    console.log('✅ TRAINING COMPLETE')
    console.log('='.repeat(60))
    console.log()

  } catch (error) {
    console.error('\n❌ Error during training:')
    console.error(error)
    process.exit(1)
  }
}

// Run training
trainSeq2PointModel()
