import tf from './tf-provider.js'
import * as ort from 'onnxruntime-node'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Helper function to properly escape shell arguments
function shellEscape(arg) {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * MSDC-NILM Model Implementation (Python model.py port)
 * Multi-Scale Deep Convolutional NILM
 * Based on: https://github.com/MingjunZhong/msdc-nilm
 * 
 * Supports multiple architectures:
 * - S2P_on: Seq2Point with on/off state (dual branch)
 * - S2P_State: Seq2Point with multi-state classification
 * - S2P_State2: Multi-scale inception-style architecture
 */

export class MSDCPredictor {
  constructor() {
    this.model = null
    this.onnxSession = null
    this.uniqueTags = []
    this.isCompiled = false
    this.inputWindowLength = 599  // Default window length
    this.applianceMean = 0
    this.applianceStd = 1
    this.mainsMean = 522
    this.mainsStd = 814
    this.architecture = 'S2P_on'  // Default architecture
  }

  /**
   * Build S2P_on model (Seq2Point with on/off state)
   * Dual-branch architecture with Conv1D layers
   * @param {number} windowLen - Input window length (default: 599)
   * @param {boolean} lite - Use lightweight version with fewer filters (default: false)
   */
  buildS2POn(windowLen = 599, lite = false) {
    const modelSize = lite ? 'LITE' : 'FULL'
    console.log(`Building S2P_on model (${modelSize}) - dual-branch: power + on/off...`)
    console.log(`Input shape: [${windowLen}]`)

    this.inputWindowLength = windowLen
    this.architecture = lite ? 'S2P_on_lite' : 'S2P_on'

    // Adjust filters for lite version (50% reduction)
    const f1 = lite ? 16 : 30
    const f2 = lite ? 16 : 30
    const f3 = lite ? 20 : 40
    const f4 = lite ? 25 : 50
    const f5 = lite ? 25 : 50
    const dense = lite ? 512 : 1024

    console.log(`  Filters: ${f1}-${f2}-${f3}-${f4}-${f5}, Dense: ${dense}`)

    // Input: 1D sequence of aggregate power values
    const input = tf.input({ shape: [windowLen] })
    
    // Expand dims for Conv1D: [batch, windowLen, 1]
    const expandDims = tf.layers.reshape({ 
      targetShape: [windowLen, 1] 
    }).apply(input)

    // ============ Power Branch ============
    // Conv1D layers with progressively smaller kernels
    let powerBranch = tf.layers.conv1d({
      filters: f1,
      kernelSize: 13,
      padding: 'same',
      activation: 'relu',
      name: 'conv1_p'
    }).apply(expandDims)

    powerBranch = tf.layers.conv1d({
      filters: f2,
      kernelSize: 11,
      padding: 'same',
      activation: 'relu',
      name: 'conv2_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: f3,
      kernelSize: 9,
      padding: 'same',
      activation: 'relu',
      name: 'conv3_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: f4,
      kernelSize: 7,
      padding: 'same',
      activation: 'relu',
      name: 'conv4_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: f5,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv5_p'
    }).apply(powerBranch)

    // Flatten and dense layers
    const powerFlat = tf.layers.flatten().apply(powerBranch)
    const powerDense = tf.layers.dense({
      units: dense,
      activation: 'relu',
      name: 'fc1_p'
    }).apply(powerFlat)

    const powerOutput = tf.layers.dense({
      units: 1,
      activation: 'linear',
      name: 'power_output'
    }).apply(powerDense)

    // ============ On/Off State Branch ============
    let stateBranch = tf.layers.conv1d({
      filters: f1,
      kernelSize: 13,
      padding: 'same',
      activation: 'relu',
      name: 'conv1_s'
    }).apply(expandDims)

    stateBranch = tf.layers.conv1d({
      filters: f2,
      kernelSize: 11,
      padding: 'same',
      activation: 'relu',
      name: 'conv2_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: f3,
      kernelSize: 9,
      padding: 'same',
      activation: 'relu',
      name: 'conv3_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: f4,
      kernelSize: 7,
      padding: 'same',
      activation: 'relu',
      name: 'conv4_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: f5,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv5_s'
    }).apply(stateBranch)

    // Flatten and dense layers
    const stateFlat = tf.layers.flatten().apply(stateBranch)
    const stateDense = tf.layers.dense({
      units: dense,
      activation: 'relu',
      name: 'fc1_s'
    }).apply(stateFlat)

    const onoffOutput = tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
      name: 'onoff_output'
    }).apply(stateDense)

    // Build multi-output model
    this.model = tf.model({ 
      inputs: input, 
      outputs: [powerOutput, onoffOutput] 
    })

    // Compile with multi-task losses
    this.model.compile({
      optimizer: tf.train.adam(0.0001, 0.9, 0.999),
      loss: {
        power_output: 'meanSquaredError',
        onoff_output: 'binaryCrossentropy'
      },
      lossWeights: {
        power_output: 1.0,
        onoff_output: 0.5
      },
      metrics: {
        power_output: ['mse', 'mae'],
        onoff_output: ['accuracy', 'binaryAccuracy']
      },
      clipValue: 1.0
    })

    this.isCompiled = true
    this.isMultiTask = true
    console.log('✅ S2P_on model built and compiled successfully')
    this.model.summary()

    return this.model
  }

  /**
   * Build S2P_State model (Seq2Point with multi-state classification)
   * @param {number} windowLen - Input window length (default: 599)
   * @param {number} stateNum - Number of states to classify (default: 3)
   * @param {boolean} lite - Use lightweight version with fewer filters (default: false)
   */
  buildS2PState(windowLen = 599, stateNum = 3, lite = false) {
    const modelSize = lite ? 'LITE' : 'FULL'
    console.log(`Building S2P_State model (${modelSize}) - dual-branch: power + state...`)
    console.log(`Input shape: [${windowLen}], States: ${stateNum}`)

    this.inputWindowLength = windowLen
    this.architecture = lite ? 'S2P_State_lite' : 'S2P_State'

    // Adjust filters for lite version
    const f1 = lite ? 16 : 30
    const f2 = lite ? 16 : 30
    const f3 = lite ? 20 : 40
    const f4 = lite ? 25 : 50
    const f5 = lite ? 30 : 60
    const f6 = lite ? 30 : 60
    const dense = lite ? 512 : 1024

    console.log(`  Filters: ${f1}-${f2}-${f3}-${f4}-${f5}-${f6}, Dense: ${dense}`)

    const input = tf.input({ shape: [windowLen] })
    const expandDims = tf.layers.reshape({ 
      targetShape: [windowLen, 1] 
    }).apply(input)

    // ============ Power Branch ============
    let powerBranch = tf.layers.conv1d({
      filters: f1,
      kernelSize: 13,
      padding: 'same',
      activation: 'relu',
      name: 'conv1_p'
    }).apply(expandDims)

    powerBranch = tf.layers.conv1d({
      filters: f2,
      kernelSize: 11,
      padding: 'same',
      activation: 'relu',
      name: 'conv2_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: f3,
      kernelSize: 7,
      padding: 'same',
      activation: 'relu',
      name: 'conv3_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: 50,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv4_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: 60,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv5_p'
    }).apply(powerBranch)

    powerBranch = tf.layers.conv1d({
      filters: 60,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv6_p'
    }).apply(powerBranch)

    const powerFlat = tf.layers.flatten().apply(powerBranch)
    const powerDense = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      name: 'fc1_p'
    }).apply(powerFlat)

    const powerOutput = tf.layers.dense({
      units: 1,
      activation: 'linear',
      name: 'power_output'
    }).apply(powerDense)

    // ============ State Branch ============
    let stateBranch = tf.layers.conv1d({
      filters: 30,
      kernelSize: 13,
      padding: 'same',
      activation: 'relu',
      name: 'conv1_s'
    }).apply(expandDims)

    stateBranch = tf.layers.conv1d({
      filters: 30,
      kernelSize: 11,
      padding: 'same',
      activation: 'relu',
      name: 'conv2_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: 40,
      kernelSize: 7,
      padding: 'same',
      activation: 'relu',
      name: 'conv3_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: 50,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv4_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: 60,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv5_s'
    }).apply(stateBranch)

    stateBranch = tf.layers.conv1d({
      filters: 60,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv6_s'
    }).apply(stateBranch)

    const stateFlat = tf.layers.flatten().apply(stateBranch)
    const stateDense = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      name: 'fc1_s'
    }).apply(stateFlat)

    const stateOutput = tf.layers.dense({
      units: stateNum,
      activation: 'softmax',
      name: 'state_output'
    }).apply(stateDense)

    // Build multi-output model
    this.model = tf.model({ 
      inputs: input, 
      outputs: [powerOutput, stateOutput] 
    })

    // Compile with multi-task losses
    this.model.compile({
      optimizer: tf.train.adam(0.0001, 0.9, 0.999),
      loss: {
        power_output: 'meanSquaredError',
        state_output: 'categoricalCrossentropy'
      },
      lossWeights: {
        power_output: 1.0,
        state_output: 0.5
      },
      metrics: {
        power_output: ['mse', 'mae'],
        state_output: ['accuracy', 'categoricalAccuracy']
      },
      clipValue: 1.0
    })

    this.isCompiled = true
    this.isMultiTask = true
    console.log('✅ S2P_State model built and compiled successfully')
    this.model.summary()

    return this.model
  }

  /**
   * Build S2P_State2 model (Multi-scale inception-style architecture)
   * @param {number} windowLen - Input window length (default: 599)
   * @param {number} stateNum - Number of states to classify (default: 3)
   */
  buildS2PState2(windowLen = 599, stateNum = 3) {
    console.log('Building S2P_State2 model (multi-scale inception)...')
    console.log(`Input shape: [${windowLen}], States: ${stateNum}`)

    this.inputWindowLength = windowLen
    this.architecture = 'S2P_State2'

    const input = tf.input({ shape: [windowLen] })
    const expandDims = tf.layers.reshape({ 
      targetShape: [windowLen, 1] 
    }).apply(input)

    // ============ Power Branch (Multi-scale) ============
    // Three parallel convolutions with different kernel sizes
    const powerConv1 = tf.layers.conv1d({
      filters: 50,
      kernelSize: 11,
      padding: 'same',
      activation: 'relu',
      name: 'conv11_p'
    }).apply(expandDims)

    const powerConv2 = tf.layers.conv1d({
      filters: 50,
      kernelSize: 9,
      padding: 'same',
      activation: 'relu',
      name: 'conv12_p'
    }).apply(expandDims)

    const powerConv3 = tf.layers.conv1d({
      filters: 50,
      kernelSize: 7,
      padding: 'same',
      activation: 'relu',
      name: 'conv13_p'
    }).apply(expandDims)

    // Concatenate multi-scale features
    const powerConcat = tf.layers.concatenate({ axis: -1 }).apply([
      powerConv1, powerConv2, powerConv3
    ])

    // Further processing
    let powerBranch = tf.layers.conv1d({
      filters: 50,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv2_p'
    }).apply(powerConcat)

    const powerFlat = tf.layers.flatten().apply(powerBranch)
    const powerDense = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      name: 'fc1_p'
    }).apply(powerFlat)

    const powerOutput = tf.layers.dense({
      units: stateNum,
      activation: 'softmax',
      name: 'power_output'
    }).apply(powerDense)

    // ============ State Branch (Multi-scale) ============
    const stateConv1 = tf.layers.conv1d({
      filters: 50,
      kernelSize: 11,
      padding: 'same',
      activation: 'relu',
      name: 'conv11_s'
    }).apply(expandDims)

    const stateConv2 = tf.layers.conv1d({
      filters: 50,
      kernelSize: 9,
      padding: 'same',
      activation: 'relu',
      name: 'conv12_s'
    }).apply(expandDims)

    const stateConv3 = tf.layers.conv1d({
      filters: 50,
      kernelSize: 7,
      padding: 'same',
      activation: 'relu',
      name: 'conv13_s'
    }).apply(expandDims)

    const stateConcat = tf.layers.concatenate({ axis: -1 }).apply([
      stateConv1, stateConv2, stateConv3
    ])

    let stateBranch = tf.layers.conv1d({
      filters: 50,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      name: 'conv2_s'
    }).apply(stateConcat)

    const stateFlat = tf.layers.flatten().apply(stateBranch)
    const stateDense = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      name: 'fc1_s'
    }).apply(stateFlat)

    const stateOutput = tf.layers.dense({
      units: stateNum,
      activation: 'softmax',
      name: 'state_output'
    }).apply(stateDense)

    // Build multi-output model
    this.model = tf.model({ 
      inputs: input, 
      outputs: [powerOutput, stateOutput] 
    })

    // Compile
    this.model.compile({
      optimizer: tf.train.adam(0.0001, 0.9, 0.999),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy', 'categoricalAccuracy'],
      clipValue: 1.0
    })

    this.isCompiled = true
    this.isMultiTask = true
    console.log('✅ S2P_State2 model built and compiled successfully')
    this.model.summary()

    return this.model
  }

  /**
   * Build model with specified architecture
   * @param {string} architecture - Model architecture: 'S2P_on', 'S2P_State', 'S2P_State2'
   * @param {number} windowLen - Input window length
   * @param {number} stateNum - Number of states (for state models)
   * @param {boolean} lite - Use lightweight version with fewer filters (default: false)
   */
  buildModel(architecture = 'S2P_on', windowLen = 599, stateNum = 3, lite = false) {
    switch (architecture) {
      case 'S2P_on':
        return this.buildS2POn(windowLen, lite)
      case 'S2P_State':
        return this.buildS2PState(windowLen, stateNum, lite)
      case 'S2P_State2':
        return this.buildS2PState2(windowLen, stateNum, lite)
      default:
        throw new Error(`Unknown architecture: ${architecture}. Use 'S2P_on', 'S2P_State', or 'S2P_State2'`)
    }
  }

  /**
   * Get model summary
   */
  summary() {
    if (this.model) {
      this.model.summary()
    }
  }

  /**
   * Train the model
   * @param {tf.Tensor} xTrain - Training features [numSamples, inputWindowLength]
   * @param {tf.Tensor|Array} yTrain - Training targets (single or multi-output)
   * @param {tf.Tensor} xVal - Validation features
   * @param {tf.Tensor|Array} yVal - Validation targets
   * @param {number} epochs - Number of training epochs
   * @param {number} batchSize - Batch size
   * @param {Function} onEpochEnd - Callback for epoch completion
   * @param {Object} earlyStoppingConfig - Early stopping config
   * @param {string} autoSavePath - Path to auto-save best model
   */
  async train(xTrain, yTrain, xVal, yVal, epochs = 10, batchSize = 1000, onEpochEnd = null, earlyStoppingConfig = null, autoSavePath = null) {
    if (!this.model) {
      throw new Error('Model not built. Call buildModel() first.')
    }

    console.log(`Starting ${this.architecture} training...`)
    console.log(`Training samples: ${xTrain.shape[0]}, Validation samples: ${xVal.shape[0]}`)
    console.log(`Batch size: ${batchSize}, Epochs: ${epochs}`)

    let bestValLossForSave = Infinity
    let bestValLossForEarlyStopping = Infinity
    let bestValMae = Infinity
    let patienceCounter = 0
    let stoppedEarly = false
    const patience = earlyStoppingConfig?.patience || 3
    const minDelta = earlyStoppingConfig?.minDelta || 1e-6
    
    if (earlyStoppingConfig && patience > 0) {
      console.log(`Early stopping enabled: patience=${patience}, minDelta=${minDelta}`)
    }
    
    if (autoSavePath) {
      console.log(`Auto-save enabled: will save best model to ${autoSavePath}`)
    }

    const callbacks = {
      onEpochEnd: async (epoch, logs) => {
        const mse = logs.mse || logs.loss || 0
        const mae = logs.mae || 0
        const valMse = logs.val_mse || logs.val_loss || 0
        const valMae = logs.val_mae || 0
        
        console.log(`Epoch ${epoch + 1}/${epochs}:`, 
          `loss=${logs.loss.toFixed(4)}, ` +
          `val_loss=${logs.val_loss.toFixed(4)}`)
        
        // Early stopping logic
        if (earlyStoppingConfig && patience > 0) {
          if (logs.val_loss < bestValLossForEarlyStopping - minDelta) {
            bestValLossForEarlyStopping = logs.val_loss
            patienceCounter = 0
            console.log(`  ✓ Validation loss improved to ${logs.val_loss.toFixed(4)}`)
          } else {
            patienceCounter++
            console.log(`  ⚠ No improvement for ${patienceCounter}/${patience} epochs`)
            
            if (patienceCounter >= patience) {
              console.log(`\n🛑 Early stopping triggered after ${epoch + 1} epochs`)
              console.log(`   Best validation loss: ${bestValLossForEarlyStopping.toFixed(4)}`)
              stoppedEarly = true
              this.model.stopTraining = true
            }
          }
        }
        
        // Auto-save if validation loss improved
        if (autoSavePath && logs.val_loss < bestValLossForSave) {
          bestValLossForSave = logs.val_loss
          bestValMae = valMae
          try {
            await this.save(autoSavePath)
            console.log(`  💾 Auto-saved model (val_loss improved to ${logs.val_loss.toFixed(4)})`)
          } catch (error) {
            console.error(`  ❌ Auto-save failed: ${error.message}`)
          }
        }
        
        if (onEpochEnd) {
          await onEpochEnd(epoch, logs, stoppedEarly)
        }
      }
    }

    const history = await this.model.fit(xTrain, yTrain, {
      epochs,
      batchSize,
      validationData: [xVal, yVal],
      shuffle: true,
      callbacks
    })

    if (stoppedEarly) {
      console.log('✅ Training completed (stopped early)')
    } else {
      console.log('✅ Training completed')
    }
    return history
  }

  /**
   * Make predictions
   * @param {tf.Tensor} x - Input features [batch, inputWindowLength]
   * @returns {Array|tf.Tensor} Predictions - [powerPredictions, statePredictions] or single output
   */
  async predict(x) {
    if (this.onnxSession) {
      return this.predictONNX(x)
    }

    if (!this.model) {
      throw new Error('Model not built or loaded')
    }
    
    const predictions = this.model.predict(x)
    
    // Multi-output model
    if (Array.isArray(predictions)) {
      const powerPredictions = predictions[0].maximum(0)  // Clamp to >= 0
      const statePredictions = predictions[1]
      return [powerPredictions, statePredictions]
    }
    
    // Single output
    if (predictions && typeof predictions.maximum === 'function') {
      return predictions.maximum(0)
    }
    
    throw new Error(`Unexpected prediction format: ${typeof predictions}`)
  }

  /**
   * Make predictions using ONNX runtime
   * @param {tf.Tensor} x - Input features
   */
  async predictONNX(x) {
    if (!this.onnxSession) {
      throw new Error('ONNX session not initialized')
    }

    const inputData = await x.data()
    const inputTensor = new ort.Tensor('float32', inputData, x.shape)

    const feeds = {}
    feeds[this.onnxSession.inputNames[0]] = inputTensor
    const results = await this.onnxSession.run(feeds)

    if (this.isMultiTask) {
      const powerData = results[this.onnxSession.outputNames[0]].data
      const stateData = results[this.onnxSession.outputNames[1]].data
      
      const powerPredictions = tf.tensor(powerData, results[this.onnxSession.outputNames[0]].dims).maximum(0)
      const statePredictions = tf.tensor(stateData, results[this.onnxSession.outputNames[1]].dims)
      
      return [powerPredictions, statePredictions]
    } else {
      const outputData = results[this.onnxSession.outputNames[0]].data
      return tf.tensor(outputData, results[this.onnxSession.outputNames[0]].dims).maximum(0)
    }
  }

  /**
   * Load ONNX model
   * @param {string} path - Path to .onnx file
   */
  async loadONNX(path) {
    try {
      this.onnxSession = await ort.InferenceSession.create(path)
      console.log(`✅ ONNX model loaded from ${path}`)
      
      this.isMultiTask = this.onnxSession.outputNames.length > 1
      
      return true
    } catch (error) {
      console.error(`❌ Failed to load ONNX model: ${error.message}`)
      throw error
    }
  }

  /**
   * Create sliding windows for prediction
   * @param {Array|tf.Tensor} aggregatePower - Aggregate power sequence
   * @param {number} offset - Offset for the midpoint
   * @returns {tf.Tensor} Windows [numWindows, inputWindowLength]
   */
  createSlidingWindows(aggregatePower, offset = null) {
    if (offset === null) {
      offset = Math.floor(this.inputWindowLength / 2)
    }
    
    const powerArray = Array.isArray(aggregatePower) ? aggregatePower : aggregatePower.arraySync()
    const windows = []
    
    for (let i = 0; i <= powerArray.length - this.inputWindowLength; i++) {
      windows.push(powerArray.slice(i, i + this.inputWindowLength))
    }
    
    return tf.tensor2d(windows)
  }

  /**
   * Denormalize predictions back to original scale
   * @param {tf.Tensor} normalizedPower - Normalized power predictions
   * @param {number} mean - Mean used for normalization
   * @param {number} std - Std used for normalization
   * @returns {tf.Tensor} Denormalized power values
   */
  denormalize(normalizedPower, mean, std) {
    return normalizedPower.mul(std).add(mean).maximum(0)
  }

  /**
   * Normalize power values
   * @param {tf.Tensor} power - Raw power values
   * @param {number} mean - Mean for normalization
   * @param {number} std - Std for normalization
   * @returns {tf.Tensor} Normalized power values
   */
  normalize(power, mean, std) {
    return power.sub(mean).div(std)
  }

  /**
   * Set normalization parameters
   * @param {Object} params - {applianceMean, applianceStd, mainsMean, mainsStd}
   */
  setNormalizationParams(params) {
    this.applianceMean = params.applianceMean || 0
    this.applianceStd = params.applianceStd || 1
    this.mainsMean = params.mainsMean || 522
    this.mainsStd = params.mainsStd || 814
  }

  /**
   * Save model to file
   * @param {string} path - Path to save the model
   */
  async save(path) {
    if (!this.model) {
      throw new Error('No model to save')
    }
    await this.model.save(`file://${path}`)
    console.log(`Model saved to ${path}`)
  }

  /**
   * Load model from file
   * @param {string} path - Path to load the model from
   */
  async load(path) {
    this.model = await tf.loadLayersModel(`file://${path}/model.json`)
    this.isCompiled = true
    
    const outputNames = this.model.outputNames || []
    this.isMultiTask = outputNames.length > 1
    
    // Detect architecture from output names
    if (outputNames.includes('onoff_output')) {
      this.architecture = 'S2P_on'
    } else if (outputNames.includes('state_output')) {
      this.architecture = 'S2P_State'
    }
    
    console.log(`Model loaded from ${path} (${this.architecture})`)
  }

  /**
   * Set unique tags for encoding/decoding
   * @param {Array<string>} tags - Array of unique tag names
   */
  setTags(tags) {
    this.uniqueTags = tags
  }

  /**
   * Get unique tags
   * @returns {Array<string>} Array of unique tag names
   */
  getTags() {
    return this.uniqueTags
  }

  /**
   * Convert current TensorFlow.js model to ONNX
   * @param {string} savePath - Path to save the .onnx file
   */
  async convertToONNX(savePath) {
    if (!this.model) {
      throw new Error('No model loaded to convert')
    }

    console.log(`🔄 Converting ${this.architecture} model to ONNX: ${savePath}`)
    
    try {
      const modelDir = path.dirname(savePath)
      const tempDir = path.join(modelDir, 'temp_saved_model')
      
      const modelJsonPath = path.join(modelDir, 'model.json')
      if (!fs.existsSync(modelJsonPath)) {
        console.log('  Saving TensorFlow.js model first...')
        await this.model.save(`file://${modelDir}`)
      }
      
      const venvPython = path.join(process.cwd(), '.venv', 'bin', 'python3')
      const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3'
      
      try {
        await execAsync(`${pythonCmd} --version`)
      } catch (error) {
        throw new Error('Python 3 is not installed or not in PATH.')
      }
      
      console.log('  Converting TFJS to Keras SavedModel...')
      const venvConverter = path.join(process.cwd(), '.venv', 'bin', 'tensorflowjs_converter')
      const converterCmd = fs.existsSync(venvConverter) ? venvConverter : 'tensorflowjs_converter'
      
      try {
        const convertCmd = `${shellEscape(converterCmd)} --input_format=tfjs_layers_model --output_format=keras_saved_model ${shellEscape(modelJsonPath)} ${shellEscape(tempDir)}`
        await execAsync(convertCmd)
      } catch (error) {
        if (error.message.includes('command not found')) {
          throw new Error('tensorflowjs package not installed. Install with: pip install tensorflowjs')
        }
        throw error
      }
      
      console.log('  Converting Keras SavedModel to ONNX...')
      try {
        const onnxCmd = `${shellEscape(pythonCmd)} -m tf2onnx.convert --saved-model ${shellEscape(tempDir)} --output ${shellEscape(savePath)} --opset 18`
        await execAsync(onnxCmd)
      } catch (error) {
        if (error.message.includes('No module named')) {
          throw new Error('tf2onnx package not installed. Install with: pip install tf2onnx')
        }
        throw error
      }
      
      console.log('  Cleaning up temporary files...')
      fs.rmSync(tempDir, { recursive: true, force: true })
      
      console.log(`✅ Model converted and saved to ${savePath}`)
      
      await this.loadONNX(savePath)
      
      return true
    } catch (error) {
      console.error(`❌ ONNX conversion failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.model) {
      this.model.dispose()
      this.model = null
      this.isCompiled = false
    }
  }
}

export default MSDCPredictor
