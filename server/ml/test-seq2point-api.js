#!/usr/bin/env node
/**
 * Test script for seq2point API endpoints
 */

const baseUrl = 'http://localhost:3001'

async function testSeq2PointAPI() {
  console.log('='.repeat(60))
  console.log('TESTING SEQ2POINT API ENDPOINTS')
  console.log('='.repeat(60))
  console.log()

  try {
    // Test 1: List available models
    console.log('1️⃣  Testing GET /api/seq2point/models')
    const modelsResponse = await fetch(`${baseUrl}/api/seq2point/models`)
    const modelsData = await modelsResponse.json()
    
    console.log(`   Status: ${modelsResponse.status}`)
    console.log(`   Found ${modelsData.models.length} model(s)`)
    
    if (modelsData.models.length > 0) {
      console.log('   Models:')
      modelsData.models.forEach(m => {
        console.log(`     - ${m.appliance}${m.loaded ? ' (loaded)' : ''}`)
        if (m.metadata) {
          console.log(`       Trained: ${m.metadata.createdAt}`)
          console.log(`       Samples: ${m.metadata.trainSamples}`)
          console.log(`       Window: ${m.metadata.windowLength}`)
        }
      })
    }
    console.log()

    if (modelsData.models.length === 0) {
      console.log('❌ No models found. Please train a model first.')
      console.log('   Example: cd server/ml && node seq2point-train.js "water heater"')
      return
    }

    const testAppliance = modelsData.models[0].appliance

    // Test 2: Load a model
    console.log(`2️⃣  Testing POST /api/seq2point/load (${testAppliance})`)
    const loadResponse = await fetch(`${baseUrl}/api/seq2point/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliance: testAppliance })
    })
    const loadData = await loadResponse.json()
    
    console.log(`   Status: ${loadResponse.status}`)
    if (loadData.success) {
      console.log('   ✅ Model loaded successfully')
      console.log(`   Window length: ${loadData.metadata.windowLength}`)
      console.log(`   Mains: mean=${loadData.metadata.mainsStats.mean.toFixed(2)}, std=${loadData.metadata.mainsStats.std.toFixed(2)}`)
      console.log(`   Appliance: mean=${loadData.metadata.applianceStats.mean.toFixed(2)}, std=${loadData.metadata.applianceStats.std.toFixed(2)}`)
    } else {
      console.log('   ❌ Failed to load model')
      console.log(`   Error: ${loadData.error}`)
    }
    console.log()

    // Test 3: Make a prediction (mock data)
    console.log(`3️⃣  Testing POST /api/seq2point/predict (${testAppliance})`)
    
    // Generate 599 mock data points
    const mockPowerData = []
    const now = new Date()
    for (let i = 0; i < 599; i++) {
      mockPowerData.push({
        timestamp: new Date(now.getTime() - (599 - i) * 10000).toISOString(),
        power: 500 + Math.random() * 1000 // Random power between 500-1500W
      })
    }

    const predictResponse = await fetch(`${baseUrl}/api/seq2point/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appliance: testAppliance,
        powerData: mockPowerData
      })
    })
    const predictData = await predictResponse.json()
    
    console.log(`   Status: ${predictResponse.status}`)
    if (predictData.predictedPower !== undefined) {
      console.log('   ✅ Prediction successful')
      console.log(`   Predicted power: ${predictData.predictedPower}W`)
      console.log(`   Timestamp: ${predictData.timestamp}`)
      console.log(`   Samples used: ${predictData.samplesUsed}`)
    } else {
      console.log('   ❌ Prediction failed')
      console.log(`   Error: ${predictData.error}`)
    }
    console.log()

    // Test 4: Predict full day (smaller sample)
    console.log(`4️⃣  Testing POST /api/seq2point/predict-day (${testAppliance})`)
    
    // Generate a day's worth of data (but smaller for testing - 1000 points)
    const dayMockData = []
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < 1000; i++) {
      dayMockData.push({
        timestamp: new Date(startOfDay.getTime() + i * 10000).toISOString(),
        power: 500 + Math.random() * 1000 + Math.sin(i / 50) * 300
      })
    }

    const dayPredictResponse = await fetch(`${baseUrl}/api/seq2point/predict-day`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appliance: testAppliance,
        date: startOfDay.toISOString().split('T')[0],
        powerData: dayMockData
      })
    })
    const dayPredictData = await dayPredictResponse.json()
    
    console.log(`   Status: ${dayPredictResponse.status}`)
    if (dayPredictData.predictions) {
      console.log('   ✅ Day prediction successful')
      console.log(`   Total predictions: ${dayPredictData.totalPredictions}`)
      console.log(`   Window length: ${dayPredictData.windowLength}`)
      
      // Show sample predictions
      console.log('   Sample predictions:')
      const samples = dayPredictData.predictions.slice(0, 5)
      samples.forEach(p => {
        const time = new Date(p.timestamp).toLocaleTimeString()
        console.log(`     ${time}: ${p.predictedPower}W (aggregate: ${p.aggregatePower}W)`)
      })
    } else {
      console.log('   ❌ Day prediction failed')
      console.log(`   Error: ${dayPredictData.error}`)
    }
    console.log()

    console.log('='.repeat(60))
    console.log('✅ ALL TESTS COMPLETED')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Test error:', error.message)
    console.error('\nMake sure the server is running:')
    console.error('  npm run dev:server')
  }
}

// Run tests
testSeq2PointAPI()
