# Sliding Window Prediction Guide

## Overview

The improved prediction system now supports:
- ✅ **Multi-label classification** (detect multiple concurrent activities)
- ✅ **Sliding window** with configurable step size (1-10 minutes)
- ✅ **Adaptive prediction** (adjusts speed based on confidence)
- ✅ **Aggregated results** (averages overlapping predictions)

## Key Improvements

### 1. Multi-Label Classification

**Before:** Model predicted one tag per time window (softmax)  
**After:** Model predicts multiple tags simultaneously (sigmoid)

```javascript
// Now detects multiple concurrent activities
predictions = [
  { minute: 480, tags: [
    { tag: 'cooking', prob: 0.85 },
    { tag: 'dishwasher', prob: 0.65 }
  ]}
]
```

### 2. Sliding Window

**Before:** Predictions at fixed 10-minute intervals (144 predictions/day)  
**After:** Configurable sliding window with overlap (up to 1440 predictions/day)

```javascript
// Create predictor with different configurations
const predictor = new SlidingWindowPredictor(
  model,
  50,  // windowSize: 50 minutes lookback
  5,   // stepSize: move by 5 minutes (balance)
  6    // timeStepsPerMinute: 6 points/min (10-sec intervals)
)
```

## Configuration Trade-offs

| Configuration | Predictions/Day | Precision | Speed | Use Case |
|--------------|----------------|-----------|-------|----------|
| **stepSize: 10min** | ~144 | Low | Fast ⚡ | Quick overview |
| **stepSize: 5min** | ~288 | Good ✓ | Balanced ⚖️ | **Recommended** |
| **stepSize: 1min** | ~1440 | High ✓✓ | Slow 🐌 | Maximum detail |
| **Adaptive** | ~200-800 | Variable | Smart 🧠 | Auto-optimize |

## Usage Examples

### Basic Usage

```javascript
import PowerTagPredictor from './model.js'
import SlidingWindowPredictor from './slidingWindowPredictor.js'

// Load trained model
const model = new PowerTagPredictor()
await model.load('./saved_model')
model.setTags(['cooking', 'dishwasher', 'laundry', 'standby'])

// Create predictor (5-minute steps - recommended)
const predictor = new SlidingWindowPredictor(model, 50, 5, 6)

// Predict full day
const powerData = [...] // Array of power values
const predictions = await predictor.predictDay(powerData, 0.3) // 0.3 = threshold

// Format as time ranges
const timeRanges = predictor.formatPredictions(predictions)
timeRanges.forEach(range => {
  console.log(`${range.startTime} - ${range.endTime}:`, 
    range.tags.map(t => `${t.tag} (${(t.prob*100).toFixed(1)}%)`).join(', '))
})
```

### Adaptive Prediction

```javascript
// Automatically adjusts step size based on confidence
const predictions = await predictor.predictDayAdaptive(powerData, 0.3)

// Fast when confident, slow when uncertain
// - Confidence < 0.5: step by 1 min
// - Confidence < 0.7: step by 3 min  
// - Confidence ≥ 0.7: step by default (5 min)
```

### Custom Configuration

```javascript
// High precision mode
const precisePred = new SlidingWindowPredictor(model, 50, 1, 6)
const preciseResults = await precisePred.predictDay(powerData, 0.25)

// Fast mode
const fastPred = new SlidingWindowPredictor(model, 50, 10, 6)
const fastResults = await fastPred.predictDay(powerData, 0.4)

// Change configuration dynamically
predictor.setConfig({
  windowSize: 60,  // Change to 60 minutes
  stepSize: 2      // Step by 2 minutes
})
```

## Training with Multi-Label

```javascript
import { prepareTrainingData, createTensors } from './dataPreprocessing.js'

// Prepare data with 1-minute step for more training samples
const { xData, yData, uniqueTags, stats } = prepareTrainingData(
  datasets,
  5,  // numWindows
  10, // windowSizeMinutes
  60, // pointsPerWindow
  1   // stepSizeMinutes (creates more samples via augmentation)
)

// Model now uses binary crossentropy for multi-label
const model = new PowerTagPredictor()
model.setTags(uniqueTags)
model.buildModel(300, 1, uniqueTags.length)

const { xTrain, yTrain, xVal, yVal } = createTensors(xData, yData, 0.8)
await model.train(xTrain, yTrain, xVal, yVal, 30, 32)
```

## Output Format

### Minute-Level Predictions

```javascript
[
  {
    minute: 480,           // Minutes from midnight (08:00)
    hour: 8,
    minuteOfHour: 0,
    predictions: [0.85, 0.12, 0.65, 0.05], // Raw probabilities
    tags: [
      { tag: 'cooking', prob: 0.85 },
      { tag: 'dishwasher', prob: 0.65 }
    ],
    numPredictions: 10,    // How many overlapping windows
    maxProb: 0.85
  },
  ...
]
```

### Time Range Format

```javascript
[
  {
    startMinute: 480,
    endMinute: 520,
    startTime: "08:00",
    endTime: "08:40",
    tags: [
      { tag: 'cooking', prob: 0.82 },
      { tag: 'dishwasher', prob: 0.63 }
    ],
    avgConfidence: 0.82,
    count: 40              // Number of minutes in range
  },
  ...
]
```

## Performance Tips

1. **Use 5-minute steps** as default (good balance)
2. **Increase threshold** (0.4-0.5) after aggregation to reduce false positives
3. **Use adaptive mode** when real-time performance varies
4. **Batch predictions** for multiple days to reuse model loading
5. **Monitor memory** - dispose tensors in loops

## Threshold Guidelines

| Threshold | False Positives | False Negatives | Use Case |
|-----------|----------------|-----------------|----------|
| 0.2 | Many | Few | Catch everything |
| 0.3 | Some | Some | **Balanced (recommended)** |
| 0.4-0.5 | Few | More | High confidence only |

## Example Output

```
=== Detected Activity Time Ranges ===
06:30 - 06:45: standby (95.2%)
06:45 - 07:30: cooking (82.4%)
07:30 - 09:15: dishwasher (88.1%), cooking (45.3%)
09:15 - 12:00: standby (91.8%)
12:00 - 12:45: cooking (79.6%)
12:45 - 14:30: laundry (85.7%), dishwasher (52.1%)
```

## Next Steps

1. Train model with your data using `example-usage.js`
2. Test different step sizes to find optimal balance
3. Adjust thresholds based on your precision/recall needs
4. Integrate into your API endpoints for real-time prediction
