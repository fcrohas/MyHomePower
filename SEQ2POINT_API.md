# Seq2Point API Documentation

## Overview

The seq2point API endpoints allow you to use trained seq2point NILM models to predict individual appliance power consumption from aggregate power readings.

## Base URL

```
http://localhost:3001/api/seq2point
```

## Endpoints

### 1. List Available Models

Get a list of all trained seq2point models.

**Endpoint:** `GET /api/seq2point/models`

**Response:**
```json
{
  "models": [
    {
      "appliance": "water heater",
      "path": "/path/to/model",
      "metadata": {
        "windowLength": 599,
        "mainsStats": { "mean": 872.46, "std": 922.50 },
        "applianceStats": { "mean": 3064.63, "std": 1338.59 },
        "trainSamples": 277611,
        "createdAt": "2025-12-16T..."
      },
      "loaded": false
    }
  ]
}
```

### 2. Load a Model

Load a specific appliance model into memory for faster predictions.

**Endpoint:** `POST /api/seq2point/load`

**Request Body:**
```json
{
  "appliance": "water heater"
}
```

**Response:**
```json
{
  "success": true,
  "appliance": "water heater",
  "metadata": {
    "windowLength": 599,
    "mainsStats": { "mean": 872.46, "std": 922.50 },
    "applianceStats": { "mean": 3064.63, "std": 1338.59 }
  }
}
```

### 3. Predict Single Point

Predict appliance power consumption from recent aggregate power data.

**Endpoint:** `POST /api/seq2point/predict`

**Request Body:**
```json
{
  "appliance": "water heater",
  "powerData": [
    { "timestamp": "2025-12-16T10:00:00Z", "power": 850 },
    { "timestamp": "2025-12-16T10:00:10Z", "power": 855 },
    ...
    // Need at least 599 data points (windowLength)
  ]
}
```

**Response:**
```json
{
  "appliance": "water heater",
  "predictedPower": 2850.45,
  "timestamp": "2025-12-16T10:09:50Z",
  "windowLength": 599,
  "samplesUsed": 599
}
```

**Notes:**
- Requires at least `windowLength` data points (default: 599)
- Predicts the power at the midpoint of the window
- Power data should be in chronological order
- Model auto-loads if not in memory

### 4. Predict Entire Day

Generate predictions for an entire day using a sliding window.

**Endpoint:** `POST /api/seq2point/predict-day`

**Request Body:**
```json
{
  "appliance": "water heater",
  "date": "2025-12-16",
  "powerData": [
    { "timestamp": "2025-12-16T00:00:00Z", "power": 850 },
    { "timestamp": "2025-12-16T00:00:10Z", "power": 855 },
    ...
    // Full day of data (~8640 points at 10-second intervals)
  ]
}
```

**Response:**
```json
{
  "appliance": "water heater",
  "date": "2025-12-16",
  "windowLength": 599,
  "totalPredictions": 8041,
  "predictions": [
    {
      "timestamp": "2025-12-16T00:05:00Z",
      "predictedPower": 2850.45,
      "aggregatePower": 3200.00
    },
    {
      "timestamp": "2025-12-16T00:05:10Z",
      "predictedPower": 2855.30,
      "aggregatePower": 3210.50
    },
    ...
  ]
}
```

**Notes:**
- Processes predictions in batches for efficiency
- Returns aligned predictions with timestamps
- Each prediction corresponds to the midpoint of its window

## Usage Examples

### JavaScript/Fetch

```javascript
// List models
const models = await fetch('http://localhost:3001/api/seq2point/models')
  .then(r => r.json())

// Load a model
await fetch('http://localhost:3001/api/seq2point/load', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ appliance: 'water heater' })
})

// Make a prediction
const result = await fetch('http://localhost:3001/api/seq2point/predict', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appliance: 'water heater',
    powerData: recentPowerReadings // 599 points
  })
}).then(r => r.json())

console.log(`Predicted power: ${result.predictedPower}W`)
```

### cURL

```bash
# List models
curl http://localhost:3001/api/seq2point/models

# Load model
curl -X POST http://localhost:3001/api/seq2point/load \
  -H "Content-Type: application/json" \
  -d '{"appliance":"water heater"}'

# Predict (with sample data file)
curl -X POST http://localhost:3001/api/seq2point/predict \
  -H "Content-Type: application/json" \
  -d @power-data-sample.json
```

### Python

```python
import requests

BASE_URL = 'http://localhost:3001/api/seq2point'

# List models
response = requests.get(f'{BASE_URL}/models')
models = response.json()['models']

# Load model
requests.post(f'{BASE_URL}/load', json={
    'appliance': 'water heater'
})

# Predict
result = requests.post(f'{BASE_URL}/predict', json={
    'appliance': 'water heater',
    'powerData': power_readings  # List of 599 dicts
}).json()

print(f"Predicted power: {result['predictedPower']}W")
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing appliance name"
}
```

### 404 Not Found
```json
{
  "error": "Model not found for appliance: dishwasher"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to make prediction",
  "message": "Detailed error message"
}
```

## Testing

A test script is provided to verify all endpoints:

```bash
# Start the server
npm run dev:server

# In another terminal, run the test
cd server/ml
node test-seq2point-api.js
```

## Model Training

To train new models, use the command-line training script:

```bash
cd server/ml

# Train a model
node seq2point-train.js "water heater" 599 10 1000

# Parameters:
# - appliance name (in quotes if contains spaces)
# - window length (default: 599)
# - epochs (default: 10)
# - batch size (default: 1000)
```

Trained models are saved to:
```
server/ml/saved_models/seq2point_<appliance>_model/
```

## Integration Tips

### Real-time Monitoring

For real-time appliance monitoring:

1. Buffer the last 599 aggregate power readings
2. Call `/api/seq2point/predict` every 10 seconds
3. Display or log the predicted appliance power

```javascript
const powerBuffer = []

// On each new power reading
function onNewPowerReading(reading) {
  powerBuffer.push(reading)
  
  // Keep only last 599
  if (powerBuffer.length > 599) {
    powerBuffer.shift()
  }
  
  // Predict when we have enough data
  if (powerBuffer.length === 599) {
    predictAppliance('water heater', powerBuffer)
  }
}
```

### Historical Analysis

For analyzing past data:

1. Load a full day of power data
2. Call `/api/seq2point/predict-day` once
3. Analyze or visualize the results

```javascript
const dayData = await loadDayData('2025-12-16')

const predictions = await fetch('http://localhost:3001/api/seq2point/predict-day', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appliance: 'water heater',
    date: '2025-12-16',
    powerData: dayData
  })
}).then(r => r.json())

// Calculate daily energy usage
const totalEnergy = predictions.predictions.reduce((sum, p) => 
  sum + (p.predictedPower * 10 / 3600), // kWh (10 seconds intervals)
  0
)
```

## Performance

- **Single prediction**: ~10-50ms (depends on model complexity)
- **Day prediction**: ~2-5 seconds for 8640 points
- **Model loading**: ~500ms-2s (first time only)
- **Memory usage**: ~50-200MB per loaded model

Models are cached in memory after first load for faster subsequent predictions.

## Troubleshooting

### "Model not found"
- Ensure you've trained a model for that appliance
- Check `server/ml/saved_models/` directory
- Model directory should be named: `seq2point_<appliance>_model`

### "Need at least N power readings"
- Each model requires a specific window length (usually 599)
- Ensure your powerData array has enough entries
- Check the model's metadata for exact window length

### "Failed to make prediction"
- Check server logs for detailed error
- Verify power data format is correct
- Ensure timestamps are in ISO format
- Check that power values are valid numbers

## See Also

- [Seq2Point Quickstart](../../SEQ2POINT_QUICKSTART.md)
- [Seq2Point Implementation](../../SEQ2POINT_IMPLEMENTATION.md)
- [Training Guide](../../SEQ2POINT_QUICKSTART.md#training-a-model)
