/**
 * Automatic prediction and sensor update service
 * Runs predictions periodically and updates Home Assistant sensors
 */

import { format } from 'date-fns'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PowerTagPredictor } from './ml/model.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class AutoPredictor {
  constructor(haConnections, seq2pointModels, seq2pointMetadata, tf) {
    this.haConnections = haConnections
    this.seq2pointModels = seq2pointModels
    this.seq2pointMetadata = seq2pointMetadata
    this.tf = tf // Use shared TensorFlow instance from server
    this.intervalId = null
    this.isRunning = false
    this.config = {
      enabled: false,
      intervalMinutes: 60, // Run every hour
      sessionId: null,
      useSeq2Point: true,
      selectedModels: [],
      threshold: 0.25, // Detection threshold (same as frontend default)
      useGSP: false,
      gspConfig: {
        sigma: 20,
        ri: 0.15,
        T_Positive: 20,
        T_Negative: -20,
        alpha: 0.5,
        beta: 0.5,
        instancelimit: 3
      }
    }
    this.lastRun = null
    this.lastStatus = 'Not started'
  }

  /**
   * Start the automatic predictor
   */
  start(config) {
    if (this.isRunning) {
      console.log('⚠️ Auto-predictor already running')
      return
    }

    // Update configuration
    if (config) {
      this.config = { ...this.config, ...config }
    }

    if (!this.config.sessionId) {
      console.error('❌ Cannot start auto-predictor: No session ID provided')
      return
    }

    console.log(`🤖 Starting auto-predictor (aligned to full hours)`)
    this.isRunning = true
    this.config.enabled = true

    // Calculate time until the next full hour
    const now = new Date()
    const minutesUntilNextHour = 60 - now.getMinutes()
    const secondsUntilNextHour = (minutesUntilNextHour * 60) - now.getSeconds()
    const millisecondsUntilNextHour = secondsUntilNextHour * 1000

    // Schedule the first prediction to align with the next full hour
    setTimeout(() => {
      this.runPrediction()

      // Schedule subsequent predictions every hour
      this.intervalId = setInterval(() => {
        this.runPrediction()
      }, 60 * 60 * 1000) // 1 hour interval

    }, millisecondsUntilNextHour)
  }

  /**
   * Stop the automatic predictor
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    this.config.enabled = false
    console.log('🛑 Auto-predictor stopped')
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      intervalMinutes: this.config.intervalMinutes,
      lastRun: this.lastRun,
      lastStatus: this.lastStatus,
      config: this.config
    }
  }

  /**
   * Run prediction and update sensors
   */
  async runPrediction() {
    console.log('🔄 Auto-predictor: Starting prediction run...')
    const startTime = Date.now()
    this.lastRun = new Date().toISOString()

    try {
      // Get connection info
      const connection = this.haConnections.get(this.config.sessionId)
      if (!connection) {
        throw new Error('Invalid session - connection not found')
      }

      const { url, token, entityId } = connection

      // Fetch power data for today
      const today = format(new Date(), 'yyyy-MM-dd')
      // Match frontend: start 50 minutes before midnight to have lookback data
      const startDate = new Date(`${today}T00:00:00`)
      startDate.setMinutes(startDate.getMinutes() - 50)
      const endDate = new Date() // Current time

      console.log(`📊 Fetching power data from ${startDate.toISOString()} to ${endDate.toISOString()}`)

      const historyUrl = `${url}/api/history/period/${startDate.toISOString()}?filter_entity_id=${entityId}&end_time=${endDate.toISOString()}&minimal_response`
      
      const historyResponse = await fetch(historyUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!historyResponse.ok) {
        throw new Error(`Failed to fetch history: ${historyResponse.statusText}`)
      }

      const historyData = await historyResponse.json()
      const powerData = historyData[0] || []

      if (powerData.length === 0) {
        console.log('⚠️ No power data available yet for today')
        this.lastStatus = 'No data available'
        return
      }

      console.log(`✅ Fetched ${powerData.length} power data points`)

      // Prepare power data for prediction
      const formattedPowerData = powerData.map(dp => ({
        timestamp: dp.last_changed || dp.last_updated,
        power: parseFloat(dp.state)
      })).filter(dp => !isNaN(dp.power))

      const applianceEnergies = {}

      // Run Seq2Point predictions if enabled
      if (this.config.useSeq2Point && this.config.selectedModels.length > 0) {
        console.log(`🧠 Running Seq2Point predictions for ${this.config.selectedModels.length} models`)
        
        for (const appliance of this.config.selectedModels) {
          try {
            // Load model if not in memory (use shared models from server)
            if (!this.seq2pointModels.has(appliance)) {
              const modelDir = path.join(__dirname, 'ml', 'saved_models', `seq2point_${appliance}_model`)
              const metadataPath = path.join(modelDir, 'metadata.json')

              if (!fs.existsSync(metadataPath)) {
                console.error(`  ✗ Model not found for ${appliance}`)
                continue
              }

              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
              
              const model = new PowerTagPredictor()
              model.setNormalizationParams({
                mainsMean: metadata.mainsStats.mean,
                mainsStd: metadata.mainsStats.std,
                applianceMean: metadata.applianceStats.mean,
                applianceStd: metadata.applianceStats.std
              })
              
              await model.load(modelDir)
              
              // Store in shared Maps
              this.seq2pointModels.set(appliance, model)
              this.seq2pointMetadata.set(appliance, metadata)
              console.log(`  ✓ Loaded model for ${appliance}`)
            }

            const model = this.seq2pointModels.get(appliance)
            const metadata = this.seq2pointMetadata.get(appliance)
            const windowLength = metadata.windowLength
            const offset = Math.floor((windowLength - 1) / 2)

            // Get all predictions for the day (matching frontend predict-day API)
            const aggregatePowers = formattedPowerData.map(dp => dp.power)
            const timestamps = formattedPowerData.map(dp => dp.timestamp)
            
            const normalized = aggregatePowers.map(p => 
              (p - metadata.mainsStats.mean) / metadata.mainsStats.std
            )

            if (normalized.length < windowLength) {
              console.error(`  ✗ Not enough data for ${appliance}`)
              continue
            }

            // Pad normalized data
            const paddedNormalized = [...normalized]
            const lastValue = normalized[normalized.length - 1]
            for (let i = 0; i < windowLength - 1; i++) {
              paddedNormalized.push(lastValue)
            }

            const maxWindowStart = normalized.length - 1 - offset
            const allPredictions = []
            const batchSize = 100

            // Get all predictions for the day
            for (let i = 0; i <= maxWindowStart; i += batchSize) {
              const batchEnd = Math.min(i + batchSize, maxWindowStart + 1)
              const windows = []
              
              for (let j = i; j < batchEnd; j++) {
                windows.push(paddedNormalized.slice(j, j + windowLength))
              }

              const inputTensor = this.tf.tensor2d(windows)
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
              
              const normalizedPreds = await powerTensor.data()
              const onoffProbs = onoffTensor ? await onoffTensor.data() : null

              // Denormalize and store both power and on/off (EXACTLY like server API)
              for (let k = 0; k < normalizedPreds.length; k++) {
                const power = Math.max(0, 
                  (normalizedPreds[k] * metadata.applianceStats.std) + metadata.applianceStats.mean
                )
                const midpointIndex = (i + k) + offset
                if (midpointIndex < timestamps.length) {
                  allPredictions.push({
                    timestamp: timestamps[midpointIndex],
                    predictedPower: power,
                    onoffProbability: onoffProbs ? onoffProbs[k] : null
                  })
                }
              }

              inputTensor.dispose()
              powerTensor.dispose()
              if (onoffTensor) onoffTensor.dispose()
            }

            // Now group into 10-minute windows and use trapezoidal integration (EXACTLY like frontend)
            const windowSize = 10 * 60 * 1000 // 10 minutes in ms
            const dayStart = new Date(today + 'T00:00:00').getTime()
            const dayEnd = new Date(today + 'T23:59:59').getTime()
            
            let totalEnergy = 0
            let windowCount = 0
            
            for (let time = dayStart; time < dayEnd; time += windowSize) {
              const windowEnd = Math.min(time + windowSize, dayEnd)
              const windowPredictions = allPredictions.filter(p => {
                const predTime = new Date(p.timestamp).getTime()
                return predTime >= time && predTime < windowEnd
              })
              
              if (windowPredictions.length > 1) {
                // Apply threshold filtering (EXACTLY like frontend - line 1075)
                // Check if prediction has on/off probability, otherwise estimate from power
                const activePredictions = windowPredictions.filter(p => {
                  let onoffProb = 0
                  if (p.onoffProbability !== undefined && p.onoffProbability !== null) {
                    onoffProb = p.onoffProbability
                  } else {
                    // Estimate from power level (0W = 0%, 500W+ = 100%)
                    onoffProb = Math.min(1.0, p.predictedPower / 500)
                  }
                  return onoffProb >= this.config.threshold
                })
                
                if (activePredictions.length > 1) {
                  // Use trapezoidal integration (matching frontend exactly)
                  let windowEnergy = 0
                  for (let i = 0; i < activePredictions.length - 1; i++) {
                    const current = activePredictions[i]
                    const next = activePredictions[i + 1]
                    const currentTime = new Date(current.timestamp).getTime()
                    const nextTime = new Date(next.timestamp).getTime()
                    const duration = (nextTime - currentTime) / (1000 * 60 * 60) // hours
                    
                    if (duration > 0 && duration < 1) {
                      const avgPower = (current.predictedPower + next.predictedPower) / 2
                      windowEnergy += avgPower * duration
                    }
                  }
                  totalEnergy += windowEnergy
                  windowCount++
                }
              }
            }

            console.log(`  ℹ️  ${appliance}: ${allPredictions.length} predictions, ${windowCount} windows`)
            applianceEnergies[appliance] = totalEnergy
            console.log(`  ✓ ${appliance}: ${totalEnergy.toFixed(2)} Wh`)
          } catch (error) {
            console.error(`  ✗ Failed to predict for ${appliance}:`, error.message)
          }
        }
      }

      // Run GSP predictions if enabled
      if (this.config.useGSP) {
        console.log('🔍 Running GSP disaggregation')
        
        try {
          const { disaggregatePower } = await import('./ml/gspDisaggregator.js')
          const gspResult = await disaggregatePower(formattedPowerData, today, this.config.gspConfig)

          if (gspResult.success && gspResult.appliances && gspResult.appliances.length > 0) {
            gspResult.appliances.forEach(appliance => {
              if (appliance.totalEnergy > 0) {
                applianceEnergies[appliance.name] = appliance.totalEnergy
                console.log(`  ✓ ${appliance.name}: ${appliance.totalEnergy.toFixed(2)} Wh`)
              }
            })
          }
        } catch (error) {
          console.error('  ✗ GSP disaggregation failed:', error.message)
        }
      }

      // Update Home Assistant sensors
      if (Object.keys(applianceEnergies).length > 0) {
        console.log(`📡 Updating ${Object.keys(applianceEnergies).length} sensors in Home Assistant`)
        
        const updatePromises = []
        for (const [appliance, energy] of Object.entries(applianceEnergies)) {
          const roundedEnergy = Math.round(energy * 100) / 100
          const sanitizedName = appliance.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
          const sensorId = `sensor.p_ai_${sanitizedName}`

          // First, clean up any old sensor by marking it unavailable
          await fetch(`${url}/api/states/${sensorId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              state: 'unavailable',
              attributes: {}
            })
          }).catch(() => {
            // Ignore errors - old sensor might not exist
          })

          // Wait a moment for cleanup
          await new Promise(resolve => setTimeout(resolve, 100))

          const attributes = {
            unit_of_measurement: 'Wh',
            device_class: 'energy',
            state_class: 'total_increasing',
            friendly_name: `Predicted ${appliance} Energy`,
            icon: 'mdi:lightning-bolt',
            source: 'AI Power Viewer (Auto)',
            appliance: appliance,
            prediction_date: today,
            last_updated: new Date().toISOString()
          }

          const promise = fetch(`${url}/api/states/${sensorId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              state: roundedEnergy,
              attributes: attributes
            })
          })
          .then(response => {
            if (response.ok) {
              console.log(`  ✓ Updated ${sensorId}: ${roundedEnergy} Wh`)
              return { success: true, sensorId }
            } else {
              throw new Error(`HTTP ${response.status}`)
            }
          })
          .catch(error => {
            console.error(`  ✗ Failed to update ${sensorId}:`, error.message)
            return { success: false, sensorId, error: error.message }
          })

          updatePromises.push(promise)
        }

        const results = await Promise.all(updatePromises)
        const successCount = results.filter(r => r.success).length
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)

        this.lastStatus = `Success: Updated ${successCount}/${results.length} sensors in ${duration}s`
        console.log(`✅ Auto-predictor run completed: ${this.lastStatus}`)
      } else {
        this.lastStatus = 'No appliances detected'
        console.log('⚠️ No appliances detected in predictions')
      }

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      this.lastStatus = `Error: ${error.message} (${duration}s)`
      console.error('❌ Auto-predictor error:', error)
    }
  }
}

export default AutoPredictor
