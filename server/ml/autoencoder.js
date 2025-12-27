import tf from './tf-provider.js'

/**
 * Autoencoder for Anomaly Detection in Power Curves
 * Learns to reconstruct normal power consumption patterns
 * High reconstruction error indicates anomalies
 */
export class PowerAutoencoder {
  constructor(sequenceLength = 60, latentDim = 8) {
    this.sequenceLength = sequenceLength // Number of time steps (e.g., 60 points for 10 minutes)
    this.latentDim = latentDim // Size of compressed representation
    this.model = null
    this.stats = null // { mean, std } for normalization
  }

  /**
   * Build the autoencoder model
   */
  buildModel() {
    // Encoder: Compress the input sequence to latent representation
    const input = tf.input({ shape: [this.sequenceLength, 1] })
    
    // Encoder layers
    let x = tf.layers.conv1d({
      filters: 32,
      kernelSize: 3,
      activation: 'relu',
      padding: 'same'
    }).apply(input)
    
    x = tf.layers.maxPooling1d({ poolSize: 2 }).apply(x)
    
    x = tf.layers.conv1d({
      filters: 16,
      kernelSize: 3,
      activation: 'relu',
      padding: 'same'
    }).apply(x)
    
    x = tf.layers.flatten().apply(x)
    
    // Latent space
    const encoded = tf.layers.dense({
      units: this.latentDim,
      activation: 'relu',
      name: 'latent'
    }).apply(x)
    
    // Decoder: Reconstruct from latent representation
    let decoded = tf.layers.dense({
      units: Math.floor(this.sequenceLength / 2) * 16,
      activation: 'relu'
    }).apply(encoded)
    
    decoded = tf.layers.reshape({
      targetShape: [Math.floor(this.sequenceLength / 2), 16]
    }).apply(decoded)
    
    decoded = tf.layers.conv1d({
      filters: 16,
      kernelSize: 3,
      activation: 'relu',
      padding: 'same'
    }).apply(decoded)
    
    // Upsample using repeat vector approach
    // We need to go from sequenceLength/2 to sequenceLength
    decoded = tf.layers.flatten().apply(decoded)
    decoded = tf.layers.dense({
      units: this.sequenceLength * 32,
      activation: 'relu'
    }).apply(decoded)
    decoded = tf.layers.reshape({
      targetShape: [this.sequenceLength, 32]
    }).apply(decoded)
    
    decoded = tf.layers.conv1d({
      filters: 32,
      kernelSize: 3,
      activation: 'relu',
      padding: 'same'
    }).apply(decoded)
    
    const output = tf.layers.conv1d({
      filters: 1,
      kernelSize: 3,
      activation: 'linear',
      padding: 'same'
    }).apply(decoded)
    
    // Create model
    this.model = tf.model({ inputs: input, outputs: output })
    
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    })
    
    console.log('✅ Autoencoder model built')
    this.model.summary()
  }

  /**
   * Normalize data using z-score normalization
   * @param {Array} data - Array of power values
   * @returns {Object} { normalized, mean, std }
   */
  normalizeData(data) {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length
    const std = Math.sqrt(variance)
    
    const normalized = data.map(val => (val - mean) / (std || 1))
    
    return { normalized, mean, std }
  }

  /**
   * Prepare training data from power curves
   * @param {Array} powerCurves - Array of power value arrays (each is a normal pattern)
   * @returns {tf.Tensor} Training tensor of shape [numSamples, sequenceLength, 1]
   */
  prepareTrainingData(powerCurves) {
    const sequences = []
    
    for (const curve of powerCurves) {
      // Skip if curve is too short
      if (curve.length < this.sequenceLength) {
        continue
      }
      
      // Extract sliding windows from the curve
      for (let i = 0; i <= curve.length - this.sequenceLength; i += Math.floor(this.sequenceLength / 2)) {
        const sequence = curve.slice(i, i + this.sequenceLength)
        if (sequence.length === this.sequenceLength) {
          sequences.push(sequence)
        }
      }
    }
    
    if (sequences.length === 0) {
      throw new Error('No valid sequences found in training data')
    }
    
    // Normalize all sequences together
    const allValues = sequences.flat()
    const { normalized: _, mean, std } = this.normalizeData(allValues)
    this.stats = { mean, std }
    
    // Normalize each sequence
    const normalizedSequences = sequences.map(seq => 
      seq.map(val => (val - mean) / (std || 1))
    )
    
    // Convert to tensor [numSamples, sequenceLength, 1]
    const tensor = tf.tensor3d(
      normalizedSequences.map(seq => seq.map(val => [val]))
    )
    
    console.log(`Prepared ${sequences.length} training sequences`)
    return tensor
  }

  /**
   * Train the autoencoder on normal power patterns
   * @param {Array} normalPowerCurves - Array of arrays containing normal power values
   * @param {Object} options - Training options { epochs, batchSize, validationSplit }
   * @returns {Object} Training history
   */
  async train(normalPowerCurves, options = {}) {
    const {
      epochs = 50,
      batchSize = 32,
      validationSplit = 0.2,
      callbacks = []
    } = options
    
    console.log(`Training autoencoder on ${normalPowerCurves.length} power curves...`)
    
    if (!this.model) {
      this.buildModel()
    }
    
    // Prepare training data
    const xTrain = this.prepareTrainingData(normalPowerCurves)
    
    // Train (autoencoder trains to reconstruct its input)
    const history = await this.model.fit(xTrain, xTrain, {
      epochs,
      batchSize,
      validationSplit,
      callbacks: [
        ...callbacks,
        {
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, val_loss = ${logs.val_loss.toFixed(4)}`)
          }
        }
      ]
    })
    
    // Cleanup
    xTrain.dispose()
    
    console.log('✅ Autoencoder training complete')
    return history
  }

  /**
   * Detect anomalies in a power curve
   * @param {Array} powerCurve - Array of power values to check
   * @param {number} threshold - Anomaly threshold (reconstruction error multiplier)
   * @returns {Object} { isAnomaly, reconstructionError, anomalyScore, details }
   */
  async detectAnomalies(powerCurve, threshold = 2.5) {
    if (!this.model || !this.stats) {
      throw new Error('Model not trained. Call train() first.')
    }
    
    // Normalize the input using training stats
    const normalized = powerCurve.map(val => (val - this.stats.mean) / (this.stats.std || 1))
    
    // If curve is shorter than sequence length, pad with zeros
    let inputSequence = normalized
    if (inputSequence.length < this.sequenceLength) {
      inputSequence = [...normalized, ...Array(this.sequenceLength - normalized.length).fill(0)]
    } else if (inputSequence.length > this.sequenceLength) {
      // Take the middle part
      const start = Math.floor((inputSequence.length - this.sequenceLength) / 2)
      inputSequence = inputSequence.slice(start, start + this.sequenceLength)
    }
    
    // Create tensor
    const inputTensor = tf.tensor3d([inputSequence.map(val => [val])])
    
    // Get reconstruction
    const reconstructed = this.model.predict(inputTensor)
    
    // Calculate reconstruction error (MSE)
    const error = tf.losses.meanSquaredError(inputTensor, reconstructed)
    const reconstructionError = await error.data()
    const errorValue = reconstructionError[0]
    
    // Calculate anomaly score (how many standard deviations from normal)
    const anomalyScore = errorValue
    const isAnomaly = anomalyScore > threshold
    
    // Get reconstructed values for visualization
    const reconstructedData = await reconstructed.data()
    const reconstructedArray = Array.from(reconstructedData)
      .filter((_, idx) => idx % 1 === 0) // Extract every point
      .map(val => val * (this.stats.std || 1) + this.stats.mean) // Denormalize
    
    // Cleanup
    inputTensor.dispose()
    reconstructed.dispose()
    error.dispose()
    
    return {
      isAnomaly,
      reconstructionError: errorValue,
      anomalyScore,
      threshold,
      original: powerCurve,
      reconstructed: reconstructedArray.slice(0, powerCurve.length),
      details: isAnomaly 
        ? `High reconstruction error (${errorValue.toFixed(4)}) indicates anomalous pattern`
        : `Normal pattern (error: ${errorValue.toFixed(4)})`
    }
  }

  /**
   * Find anomaly segments in a long power curve
   * @param {Array} powerCurve - Long array of power values
   * @param {number} stride - Step size for sliding window
   * @param {number} threshold - Anomaly threshold
   * @returns {Array} Array of { start, end, score, isAnomaly }
   */
  async findAnomalySegments(powerCurve, stride = null, threshold = 2.5) {
    if (!stride) {
      stride = Math.floor(this.sequenceLength / 4) // 25% overlap by default
    }
    
    const segments = []
    
    for (let i = 0; i <= powerCurve.length - this.sequenceLength; i += stride) {
      const segment = powerCurve.slice(i, i + this.sequenceLength)
      const result = await this.detectAnomalies(segment, threshold)
      
      segments.push({
        start: i,
        end: i + this.sequenceLength,
        score: result.anomalyScore,
        isAnomaly: result.isAnomaly,
        reconstructionError: result.reconstructionError
      })
    }
    
    return segments
  }

  /**
   * Save model to disk
   * @param {string} path - Directory path to save model
   */
  async save(path) {
    if (!this.model) {
      throw new Error('No model to save')
    }
    
    // Save model
    await this.model.save(`file://${path}`)
    
    // Save stats separately
    const fs = await import('fs')
    const metadataPath = `${path}/metadata.json`
    fs.writeFileSync(metadataPath, JSON.stringify({
      stats: this.stats,
      sequenceLength: this.sequenceLength,
      latentDim: this.latentDim
    }, null, 2))
    
    console.log(`✅ Autoencoder saved to ${path}`)
  }

  /**
   * Load model from disk
   * @param {string} path - Directory path to load model from
   */
  async load(path) {
    // Load model
    this.model = await tf.loadLayersModel(`file://${path}/model.json`)
    
    // Load metadata
    const fs = await import('fs')
    const metadataPath = `${path}/metadata.json`
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    
    this.stats = metadata.stats
    this.sequenceLength = metadata.sequenceLength
    this.latentDim = metadata.latentDim
    
    console.log(`✅ Autoencoder loaded from ${path}`)
  }
}

export default PowerAutoencoder
