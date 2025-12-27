import tf from './tf-provider.js'
import * as ort from 'onnxruntime-node'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Helper function to properly escape shell arguments
function shellEscape(arg) {
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * ML Model for seq2point NILM (Non-Intrusive Load Monitoring)
 * Architecture: Conv2D layers -> Flatten -> Dense layers
 * Based on: https://github.com/MingjunZhong/seq2point-nilm
 * 
 * Seq2point learns a mapping from an aggregate power window (599 timesteps)
 * to the midpoint of the corresponding appliance power consumption.
 */

export class PowerTagPredictor {
  constructor() {
    this.model = null
    this.onnxSession = null
    this.uniqueTags = []
    this.isCompiled = false
    this.inputWindowLength = 599  // Default window length from seq2point paper
    this.applianceMean = 0        // Normalization parameters per appliance
    this.applianceStd = 1
    this.mainsMean = 522           // Default from paper
    this.mainsStd = 814            // Default from paper
  }

  /**
   * Build the seq2point model
   * @param {number} inputWindowLength - Number of input timesteps (default: 599)
   * @param {number} numAppliances - Number of appliances to predict (default: 1 for regression, >1 for multi-output)
   */
  buildModel(inputWindowLength = 599, numAppliances = 1) {
    console.log('Building seq2point model...')
    console.log(`Input shape: [${inputWindowLength}]`)
    console.log(`Output: ${numAppliances} appliance(s)`)

    this.inputWindowLength = inputWindowLength

    // Input: 1D sequence of aggregate power values
    // Shape: [batch, inputWindowLength]
    const input = tf.input({ shape: [inputWindowLength] })
    
    // Reshape to 2D for Conv2D: [batch, 1, inputWindowLength, 1]
    const reshape = tf.layers.reshape({ 
      targetShape: [1, inputWindowLength, 1] 
    }).apply(input)

    // Conv2D layer 1: 30 filters, kernel size (10, 1)
    let conv = tf.layers.conv2d({
      filters: 30,
      kernelSize: [10, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'conv1'
    }).apply(reshape)

    // Conv2D layer 2: 30 filters, kernel size (8, 1)
    conv = tf.layers.conv2d({
      filters: 30,
      kernelSize: [8, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'conv2'
    }).apply(conv)

    // Conv2D layer 3: 40 filters, kernel size (6, 1)
    conv = tf.layers.conv2d({
      filters: 40,
      kernelSize: [6, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'conv3'
    }).apply(conv)

    // Conv2D layer 4: 50 filters, kernel size (5, 1)
    conv = tf.layers.conv2d({
      filters: 50,
      kernelSize: [5, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'conv4'
    }).apply(conv)

    // Conv2D layer 5: 50 filters, kernel size (5, 1)
    conv = tf.layers.conv2d({
      filters: 50,
      kernelSize: [5, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'conv5'
    }).apply(conv)

    // Flatten the output
    const flatten = tf.layers.flatten().apply(conv)

    // Dense layer: 1024 units
    const dense = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      name: 'dense1'
    }).apply(flatten)

    // Multi-task outputs: power regression + on/off classification
    const useMutliTask = numAppliances === 1  // Only for single appliance seq2point
    
    if (useMutliTask) {
      // Output 1: Power regression (continuous value)
      const powerOutput = tf.layers.dense({
        units: 1,
        activation: 'linear',
        name: 'power_output'
      }).apply(dense)

      // Output 2: On/Off classification (binary)
      const onoffOutput = tf.layers.dense({
        units: 1,
        activation: 'sigmoid',
        name: 'onoff_output'
      }).apply(dense)

      this.model = tf.model({ inputs: input, outputs: [powerOutput, onoffOutput] })

      // Compile with multi-task losses
      // Lower learning rate (0.0001) to prevent NaN losses
      this.model.compile({
        optimizer: tf.train.adam(0.0001, 0.9, 0.999),
        loss: {
          power_output: 'meanSquaredError',
          onoff_output: 'binaryCrossentropy'
        },
        lossWeights: {
          power_output: 1.0,    // Weight for power regression
          onoff_output: 0.5     // Weight for on/off classification (lower to balance)
        },
        metrics: {
          power_output: ['mse', 'mae'],
          onoff_output: ['accuracy', 'binaryAccuracy']
        },
        clipValue: 1.0  // Clip gradients to prevent explosions
      })

      this.isMultiTask = true
      console.log('✅ Multi-task seq2point model built (power + on/off) and compiled successfully')
    } else {
      // Original single-task model for multi-appliance
      const output = tf.layers.dense({
        units: numAppliances,
        activation: 'linear',
        name: 'output'
      }).apply(dense)

      this.model = tf.model({ inputs: input, outputs: output })

      this.model.compile({
        optimizer: tf.train.adam(0.001, 0.9, 0.999),
        loss: 'meanSquaredError',
        metrics: ['mse', 'mae']
      })

      this.isMultiTask = false
      console.log('✅ Seq2point model built and compiled successfully')
    }

    this.isCompiled = true
    this.model.summary()

    return this.model
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
   * Train the seq2point model
   * @param {tf.Tensor} xTrain - Training features [numSamples, inputWindowLength]
   * @param {tf.Tensor} yTrain - Training targets [numSamples, numAppliances]
   * @param {tf.Tensor} xVal - Validation features [numSamples, inputWindowLength]
   * @param {tf.Tensor} yVal - Validation targets [numSamples, numAppliances]
   * @param {number} epochs - Number of training epochs
   * @param {number} batchSize - Batch size (default: 1000 per seq2point paper)
   * @param {Function} onEpochEnd - Callback for epoch completion
   * @param {Object} earlyStoppingConfig - Early stopping configuration {patience, minDelta}
   * @param {string} autoSavePath - Optional path to auto-save best model
   */
  async train(xTrain, yTrain, xVal, yVal, epochs = 10, batchSize = 1000, onEpochEnd = null, earlyStoppingConfig = null, autoSavePath = null) {
    if (!this.model) {
      throw new Error('Model not built. Call buildModel() first.')
    }

    console.log('Starting seq2point training...')
    console.log(`Training samples: ${xTrain.shape[0]}, Validation samples: ${xVal.shape[0]}`)
    console.log(`Batch size: ${batchSize}, Epochs: ${epochs}`)

    // Early stopping and auto-save state
    let bestValLossForSave = Infinity  // For auto-save tracking
    let bestValLossForEarlyStopping = Infinity  // For early stopping tracking
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
          `mse=${mse.toFixed(4)}, ` +
          `mae=${mae.toFixed(4)}, ` +
          `val_loss=${logs.val_loss.toFixed(4)}, ` +
          `val_mse=${valMse.toFixed(4)}, ` +
          `val_mae=${valMae.toFixed(4)}`)
        
        // Early stopping logic (check first to avoid interference)
        if (earlyStoppingConfig && patience > 0) {
          if (logs.val_loss < bestValLossForEarlyStopping - minDelta) {
            // Significant improvement detected
            bestValLossForEarlyStopping = logs.val_loss
            patienceCounter = 0
            console.log(`  ✓ Validation loss improved to ${logs.val_loss.toFixed(4)}`)
          } else {
            // No significant improvement
            patienceCounter++
            console.log(`  ⚠ No improvement for ${patienceCounter}/${patience} epochs`)
            
            if (patienceCounter >= patience) {
              console.log(`\n🛑 Early stopping triggered after ${epoch + 1} epochs`)
              console.log(`   Best validation loss: ${bestValLossForEarlyStopping.toFixed(4)}`)
              console.log(`   Best validation MAE: ${bestValMae.toFixed(4)}`)
              stoppedEarly = true
              this.model.stopTraining = true
            }
          }
        }
        
        // Auto-save if validation loss improved (any improvement, not just significant)
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
   * Make predictions with seq2point model
   * @param {tf.Tensor} x - Input features [batch, inputWindowLength]
   * @returns {tf.Tensor|Array} Predictions - For single-task: [batch, numAppliances]. For multi-task: [powerPredictions, onoffPredictions]
   */
  async predict(x) {
    // Dual integration: ONNX or TensorFlow.js
    if (this.onnxSession) {
      // console.log('🔵 Using ONNX for prediction')
      return this.predictONNX(x)
    }

    // console.log('🟢 Using TensorFlow.js for prediction')
    if (!this.model) {
      throw new Error('Model not built or loaded')
    }
    
    // Predict returns the midpoint power consumption
    const predictions = this.model.predict(x)
    
    // For multi-task model, predictions is an array [powerOutput, onoffOutput]
    // Check both isMultiTask flag and if predictions is actually an array
    if (Array.isArray(predictions)) {
      const powerPredictions = predictions[0].maximum(0)  // Clamp power to >= 0
      const onoffPredictions = predictions[1]  // Sigmoid output (0-1)
      return [powerPredictions, onoffPredictions]
    }
    
    // For single-task model, clamp negative predictions to 0
    // Verify predictions is a tensor before calling .maximum()
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

    // Convert TF tensor to Float32Array
    const inputData = await x.data()
    const inputTensor = new ort.Tensor('float32', inputData, x.shape)

    // Run inference
    const feeds = {}
    feeds[this.onnxSession.inputNames[0]] = inputTensor
    const results = await this.onnxSession.run(feeds)

    // Handle multi-task or single-task output
    if (this.isMultiTask) {
      const powerData = results[this.onnxSession.outputNames[1]].data
      const onoffData = results[this.onnxSession.outputNames[0]].data
      
      const powerPredictions = tf.tensor(powerData, results[this.onnxSession.outputNames[1]].dims).maximum(0)
      const onoffPredictions = tf.tensor(onoffData, results[this.onnxSession.outputNames[0]].dims)
      
      return [powerPredictions, onoffPredictions]
    } else {
      const outputData = results[this.onnxSession.outputNames[1]].data
      return tf.tensor(outputData, results[this.onnxSession.outputNames[1]].dims).maximum(0)
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
      
      // Detect if multi-task based on output names
      this.isMultiTask = this.onnxSession.outputNames.includes('power_output') && 
                         this.onnxSession.outputNames.includes('onoff_output')
      
      return true
    } catch (error) {
      console.error(`❌ Failed to load ONNX model: ${error.message}`)
      throw error
    }
  }

  /**
   * Create sliding windows for prediction
   * Helper to generate windows from a long sequence of aggregate power
   * @param {Array|tf.Tensor} aggregatePower - Aggregate power sequence
   * @param {number} offset - Offset for the midpoint (default: (windowLength-1)/2)
   * @returns {tf.Tensor} Windows [numWindows, inputWindowLength]
   */
  createSlidingWindows(aggregatePower, offset = null) {
    if (offset === null) {
      offset = Math.floor(this.inputWindowLength / 2)
    }
    
    const powerArray = Array.isArray(aggregatePower) ? aggregatePower : aggregatePower.arraySync()
    const windows = []
    
    // Create sliding windows
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
    
    // Detect if this is a multi-task model by checking output names
    const outputNames = this.model.outputNames || []
    this.isMultiTask = outputNames.includes('power_output') && outputNames.includes('onoff_output')
    
    if (this.isMultiTask) {
      console.log(`Model loaded from ${path} (multi-task: power + on/off)`)
    } else {
      console.log(`Model loaded from ${path}`)
    }
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
   * Requires Python with tensorflowjs and tf2onnx packages installed
   * @param {string} savePath - Path to save the .onnx file
   */
  async convertToONNX(savePath) {
    if (!this.model) {
      throw new Error('No model loaded to convert')
    }

    console.log(`🔄 Converting model to ONNX: ${savePath}`)
    
    try {
      const modelDir = path.dirname(savePath)
      const tempDir = path.join(modelDir, 'temp_saved_model')
      
      // Step 1: Save model if not already saved
      const modelJsonPath = path.join(modelDir, 'model.json')
      if (!fs.existsSync(modelJsonPath)) {
        console.log('  Saving TensorFlow.js model first...')
        await this.model.save(`file://${modelDir}`)
      }
      
      // Step 2: Check if Python and required packages are available
      const venvPython = path.join(process.cwd(), '.venv', 'bin', 'python3')
      const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3'
      
      try {
        await execAsync(`${pythonCmd} --version`)
      } catch (error) {
        throw new Error('Python 3 is not installed or not in PATH. Please install Python 3 to use ONNX conversion.')
      }
      
      // Step 3: Convert TFJS to SavedModel format (intermediate step)
      console.log('  Converting TFJS to Keras SavedModel...')
      const venvConverter = path.join(process.cwd(), '.venv', 'bin', 'tensorflowjs_converter')
      const converterCmd = fs.existsSync(venvConverter) ? venvConverter : 'tensorflowjs_converter'
      
      try {
        // Use proper shell escaping to handle spaces in paths
        const convertCmd = `${shellEscape(converterCmd)} --input_format=tfjs_layers_model --output_format=keras_saved_model ${shellEscape(modelJsonPath)} ${shellEscape(tempDir)}`
        console.log('  Running:', convertCmd)
        await execAsync(convertCmd)
      } catch (error) {
        if (error.message.includes('command not found') || error.message.includes('not recognized')) {
          throw new Error('tensorflowjs package not installed. Install with: pip install tensorflowjs')
        }
        throw error
      }
      
      // Step 4: Convert SavedModel to ONNX
      console.log('  Converting Keras SavedModel to ONNX...')
      try {
        // Use --saved-model flag as keras_saved_model is compatible with SavedModel format
        const onnxCmd = `${shellEscape(pythonCmd)} -m tf2onnx.convert --saved-model ${shellEscape(tempDir)} --output ${shellEscape(savePath)} --opset 18`
        console.log('  Running:', onnxCmd)
        await execAsync(onnxCmd)
      } catch (error) {
        if (error.message.includes('No module named') || error.message.includes('not found')) {
          throw new Error('tf2onnx package not installed. Install with: pip install tf2onnx')
        }
        throw error
      }
      
      // Step 5: Clean up temporary directory
      console.log('  Cleaning up temporary files...')
      fs.rmSync(tempDir, { recursive: true, force: true })
      
      console.log(`✅ Model converted and saved to ${savePath}`)
      
      // Step 6: Load the new ONNX model into the session
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

export default PowerTagPredictor
