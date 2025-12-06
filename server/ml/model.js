import * as tf from '@tensorflow/tfjs-node'

/**
 * ML Model for predicting tags based on power usage
 * Architecture: 5 CNN1D layers (one per 10-minute window) -> LSTM -> Dense output
 */

export class PowerTagPredictor {
  constructor() {
    this.model = null
    this.uniqueTags = []
    this.isCompiled = false
  }

  /**
   * Build the CNN1D + LSTM model
   * @param {number} timeSteps - Number of time steps per window (e.g., 60 for 10 minutes at 10-second intervals)
   * @param {number} numWindows - Number of 10-minute windows (5 in our case)
   * @param {number} numClasses - Number of unique tags to predict
   */
  buildModel(timeSteps = 60, numWindows = 5, numClasses = 10) {
    console.log('Building CNN1D + LSTM model...')
    console.log(`Input shape: [${numWindows * timeSteps}, 1]`)
    console.log(`Output classes: ${numClasses}`)

    // Simplified architecture: Single CNN1D path on flattened input
    // Input: [batch, numWindows * timeSteps, 1] = [batch, 300, 1]
    const input = tf.input({ shape: [numWindows * timeSteps, 1] })

    // CNN1D layers to extract features
    let conv = tf.layers.conv1d({
      filters: 64,
      kernelSize: 5,
      activation: 'relu',
      padding: 'same'
    }).apply(input)

    conv = tf.layers.maxPooling1d({ poolSize: 2 }).apply(conv)

    conv = tf.layers.conv1d({
      filters: 128,
      kernelSize: 5,
      activation: 'relu',
      padding: 'same'
    }).apply(conv)

    conv = tf.layers.maxPooling1d({ poolSize: 2 }).apply(conv)

    conv = tf.layers.conv1d({
      filters: 128,
      kernelSize: 3,
      activation: 'relu',
      padding: 'same'
    }).apply(conv)

    // Reshape for LSTM: split into temporal windows
    // After pooling, we have reduced temporal dimension
    // Let's use the conv output directly for LSTM

    // Reshape for LSTM: split into temporal windows
    // After pooling, we have reduced temporal dimension
    // Let's use the conv output directly for LSTM

    // LSTM layers to capture temporal patterns
    let lstm = tf.layers.lstm({
      units: 128,
      returnSequences: true,
      dropout: 0.2
    }).apply(conv)

    lstm = tf.layers.lstm({
      units: 64,
      dropout: 0.2
    }).apply(lstm)

    // Dense layers
    let dense = tf.layers.dense({
      units: 64,
      activation: 'relu'
    }).apply(lstm)

    dense = tf.layers.dropout({ rate: 0.3 }).apply(dense)

    // Output layer with sigmoid for multi-label classification
    const output = tf.layers.dense({
      units: numClasses,
      activation: 'sigmoid'
    }).apply(dense)

    this.model = tf.model({ inputs: input, outputs: output })

    // Compile the model for multi-label classification
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['binaryAccuracy']
    })

    this.isCompiled = true
    console.log('✅ Model built and compiled successfully')

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
   * Train the model
   * @param {tf.Tensor} xTrain - Training features
   * @param {tf.Tensor} yTrain - Training labels (one-hot encoded)
   * @param {tf.Tensor} xVal - Validation features
   * @param {tf.Tensor} yVal - Validation labels (one-hot encoded)
   * @param {number} epochs - Number of training epochs
   * @param {number} batchSize - Batch size
   * @param {Function} onEpochEnd - Callback for epoch completion
   * @param {Object} earlyStoppingConfig - Early stopping configuration {patience, minDelta}
   */
  async train(xTrain, yTrain, xVal, yVal, epochs = 50, batchSize = 32, onEpochEnd = null, earlyStoppingConfig = null) {
    if (!this.model) {
      throw new Error('Model not built. Call buildModel() first.')
    }

    console.log('Starting training...')
    console.log(`Training samples: ${xTrain.shape[0]}, Validation samples: ${xVal.shape[0]}`)

    // Early stopping state
    let bestValLoss = Infinity
    let patienceCounter = 0
    let stoppedEarly = false
    const patience = earlyStoppingConfig?.patience || 0
    const minDelta = earlyStoppingConfig?.minDelta || 0.0001
    
    if (earlyStoppingConfig && patience > 0) {
      console.log(`Early stopping enabled: patience=${patience}, minDelta=${minDelta}`)
    }

    const callbacks = {
      onEpochEnd: async (epoch, logs) => {
        const acc = logs.binaryAccuracy || logs.acc || 0
        const valAcc = logs.val_binaryAccuracy || logs.val_acc || 0
        const valLoss = logs.val_loss
        
        console.log(`Epoch ${epoch + 1}/${epochs}:`, 
          `loss=${logs.loss.toFixed(4)}, ` +
          `acc=${acc.toFixed(4)}, ` +
          `val_loss=${valLoss.toFixed(4)}, ` +
          `val_acc=${valAcc.toFixed(4)}`)
        
        // Early stopping logic
        if (earlyStoppingConfig && patience > 0) {
          if (valLoss < bestValLoss - minDelta) {
            // Improvement detected
            bestValLoss = valLoss
            patienceCounter = 0
            console.log(`  ✓ Validation loss improved to ${valLoss.toFixed(4)}`)
          } else {
            // No improvement
            patienceCounter++
            console.log(`  ⚠ No improvement for ${patienceCounter}/${patience} epochs`)
            
            if (patienceCounter >= patience) {
              console.log(`\n🛑 Early stopping triggered after ${epoch + 1} epochs`)
              console.log(`   Best validation loss: ${bestValLoss.toFixed(4)}`)
              stoppedEarly = true
              this.model.stopTraining = true
            }
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
   * @param {tf.Tensor} x - Input features [batch, numWindows, timeSteps, 1]
   * @param {number} threshold - Threshold for multi-label prediction (default 0.5)
   * @returns {tf.Tensor} Predictions [batch, numClasses]
   */
  predict(x, threshold = 0.5) {
    if (!this.model) {
      throw new Error('Model not built or loaded')
    }
    const predictions = this.model.predict(x)
    
    // For multi-label classification, apply threshold
    if (threshold !== 0.5) {
      return predictions.greater(threshold).cast('float32')
    }
    
    return predictions
  }

  /**
   * Predict tags from probabilities with adaptive threshold
   * @param {tf.Tensor} probabilities - Raw prediction probabilities
   * @param {number} minThreshold - Minimum threshold (default 0.3)
   * @returns {Array} Array of tag indices that pass the threshold
   */
  predictTagsWithAdaptiveThreshold(probabilities, minThreshold = 0.3) {
    const probs = Array.from(probabilities.dataSync())
    const maxProb = Math.max(...probs)
    
    // If max probability is low, use a lower threshold
    const threshold = maxProb < 0.7 ? minThreshold : 0.5
    
    const predictedIndices = []
    probs.forEach((prob, idx) => {
      if (prob >= threshold) {
        predictedIndices.push(idx)
      }
    })
    
    // If no predictions pass threshold, return the highest probability tag
    if (predictedIndices.length === 0 && probs.length > 0) {
      const maxIdx = probs.indexOf(maxProb)
      predictedIndices.push(maxIdx)
    }
    
    return predictedIndices
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
    console.log(`Model loaded from ${path}`)
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
