# Seq2Point NILM Model - Quick Start Guide

This implementation follows the seq2point architecture from [MingjunZhong/seq2point-nilm](https://github.com/MingjunZhong/seq2point-nilm).

## What is Seq2Point?

Seq2point is a deep learning approach for Non-Intrusive Load Monitoring (NILM). It learns a mapping from:
- **Input**: A window of aggregate power readings (599 timesteps)
- **Output**: The power consumption of a specific appliance at the window's midpoint

## Architecture

```
Input: [599] → Reshape → Conv2D × 5 → Flatten → Dense(1024) → Output: [1]
```

The model uses:
- 5 Conv2D layers with filters: 30→30→40→50→50
- 1 Dense layer with 1024 units
- Linear output for regression
- MSE loss function

## Installation

No additional dependencies needed beyond the existing project setup.

## Training a Model

### Basic Usage

```bash
cd server/ml
node seq2point-train.js <appliance> [windowLength] [epochs] [batchSize]
```

### Examples

Train a kettle detector:
```bash
node seq2point-train.js kettle 599 10 1000
```

Train a microwave detector:
```bash
node seq2point-train.js microwave 599 15 1000
```

Train with custom window length:
```bash
node seq2point-train.js dishwasher 299 20 1000
```

### Training Output

The training process will:
1. Load all power and tag data from `../../data/`
2. Calculate normalization statistics for mains and appliance
3. Create sliding window training samples
4. Split into train/validation sets (95%/5%)
5. Train the model with early stopping
6. Auto-save the best model based on validation loss
7. Save metadata including normalization parameters

### Model Files

Models are saved to: `server/ml/saved_models/seq2point_<appliance>_model/`

Contains:
- `model.json` - Model architecture
- `weights.bin` - Model weights
- `metadata.json` - Training metadata and normalization parameters

## Testing a Model

### Basic Usage

```bash
node seq2point-test.js <appliance> <testDate>
```

### Examples

Test kettle model on a specific date:
```bash
node seq2point-test.js kettle 2025-12-07
```

Test microwave model:
```bash
node seq2point-test.js microwave 2025-12-01
```

### Testing Output

The testing process will:
1. Load the trained model and metadata
2. Load power data for the test date
3. Generate predictions using sliding windows
4. Calculate metrics (MSE, MAE, RMSE, On/Off Accuracy)
5. Save predictions to `test_results/`

## Using in Code

### Training Example

```javascript
import { PowerTagPredictor } from './model.js'
import { prepareSeq2PointDataset } from './seq2pointPreprocessing.js'

// Load and prepare data
const dataset = await prepareSeq2PointDataset(
  './data',
  'kettle',
  { windowLength: 599, trainSplit: 0.95 }
)

// Build model
const model = new PowerTagPredictor()
model.setNormalizationParams({
  mainsMean: dataset.mainsStats.mean,
  mainsStd: dataset.mainsStats.std,
  applianceMean: dataset.applianceStats.mean,
  applianceStd: dataset.applianceStats.std
})
model.buildModel(599, 1)

// Train
await model.train(
  dataset.xTrain,
  dataset.yTrain,
  dataset.xVal,
  dataset.yVal,
  10,  // epochs
  1000  // batch size
)

// Save
await model.save('./saved_models/my_model')
```

### Inference Example

```javascript
import { PowerTagPredictor } from './model.js'
import { prepareSeq2PointInput, denormalizePower } from './seq2pointPreprocessing.js'

// Load model
const model = new PowerTagPredictor()
await model.load('./saved_models/seq2point_kettle_model')

// Prepare input (need 599 aggregate power readings)
const aggregatePowers = [150, 151, 152, ...] // 599 values
const inputTensor = prepareSeq2PointInput(
  aggregatePowers,
  599,
  { mean: 522, std: 814 }  // mains stats
)

// Predict
const prediction = model.predict(inputTensor)
const normalizedPower = await prediction.data()

// Denormalize to watts
const appliancePower = denormalizePower(
  normalizedPower[0],
  { mean: 700, std: 1000 }  // appliance stats
)

console.log(`Predicted appliance power: ${appliancePower}W`)
```

## Data Requirements

### Power Data Format
Each day should have a file: `power-data-YYYY-MM-DD.json`

```json
{
  "date": "2025-12-07",
  "dataPoints": 8640,
  "data": [
    {
      "timestamp": "2025-12-07T00:00:00.000Z",
      "power": 245.5
    },
    ...
  ]
}
```

### Tag Data Format
Each day should have a file: `power-tags-YYYY-MM-DD.json`

```json
{
  "date": "2025-12-07",
  "entries": [
    {
      "startTime": "07:30",
      "endTime": "07:35",
      "label": "kettle"
    },
    ...
  ]
}
```

## Key Parameters

### Window Length
- **Default**: 599 (from paper)
- Represents the input sequence length
- At 10-second intervals: 599 × 10s ≈ 100 minutes
- You can use 299, 399, or other odd numbers

### Batch Size
- **Default**: 1000 (from paper)
- Larger batches = faster training, more memory
- Smaller batches = slower, less memory, sometimes better convergence

### Epochs
- **Default**: 10
- Early stopping with patience=3 prevents overfitting
- Model auto-saves on validation improvement

### Train/Val Split
- **Default**: 0.95 / 0.05 (from paper)
- 95% training, 5% validation
- Validation set used for early stopping

## Normalization

### Mains (Aggregate) Power
- Calculated from all available data
- Z-score normalization: `(power - mean) / std`
- Paper defaults: mean=522W, std=814W

### Appliance Power
- Calculated only when appliance is active
- Z-score normalization: `(power - mean) / std`
- Varies by appliance

## Performance Tips

1. **More data = better results**: Use at least 7-14 days of training data
2. **Balance classes**: Ensure enough samples with appliance ON
3. **GPU acceleration**: Use `@tensorflow/tfjs-node-gpu` for faster training
4. **Batch size**: Increase if you have enough memory (RAM/VRAM)
5. **Early stopping**: Let it run, early stopping will prevent overfitting

## Differences from Original Paper

1. **Language**: JavaScript/TensorFlow.js vs Python/Keras
2. **Data source**: Custom power monitoring vs UK-DALE/REFIT/REDD
3. **Sampling rate**: 10-second intervals vs 1-second intervals
4. **Multi-appliance**: Currently single appliance per model (can be extended)

## Troubleshooting

### "Not enough training samples"
- Need more days of data with the target appliance active
- Or increase step size in sliding window

### "Model not converging"
- Check data quality and normalization
- Try different learning rate
- Increase epochs or adjust early stopping patience

### "Out of memory"
- Reduce batch size
- Use fewer training days
- Enable GPU if available

### "Poor predictions"
- Ensure sufficient training data
- Check if appliance has distinct power signature
- Verify tag data accuracy
- Try training longer (more epochs)

## Next Steps

1. Train models for different appliances
2. Test on held-out dates
3. Compare with original tag-based classification approach
4. Implement multi-appliance prediction
5. Add visualization tools for predictions

## References

- [Seq2Point Paper](https://arxiv.org/abs/1902.08835)
- [GitHub Repository](https://github.com/MingjunZhong/seq2point-nilm)
- [NILM Overview](https://en.wikipedia.org/wiki/Nonintrusive_load_monitoring)
