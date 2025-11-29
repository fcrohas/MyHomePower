# ML Tag Predictor - Documentation

## Overview

The ML Tag Predictor is a deep learning feature that predicts power usage tags based on historical power consumption patterns. It uses a CNN1D + LSTM neural network architecture to learn patterns from your tagged power data.

## Architecture

### Model Structure
```
Input: 5 windows × 60 timesteps × 1 channel
   ↓
5× CNN1D Branches (one per 10-minute window)
   - Conv1D (64 filters, kernel=3)
   - Conv1D (64 filters, kernel=3)
   - MaxPooling1D (pool=2)
   - Conv1D (128 filters, kernel=3)
   - GlobalAveragePooling1D
   ↓
Concatenate all branches
   ↓
Reshape for LSTM
   ↓
LSTM Layer (128 units, return sequences)
   ↓
LSTM Layer (64 units)
   ↓
Dense (64 units, ReLU)
   ↓
Dropout (0.3)
   ↓
Output: Dense (N classes, Softmax)
```

### Input/Output
- **Input**: 50 minutes of power data (5 windows × 10 minutes each)
- **Output**: Predicted tag for the next 10 minutes with confidence scores

## Usage

### 1. Training the Model

#### Prerequisites
- At least 2-3 days of tagged power data saved in the `data/` folder
- Each day should have both `power-data-YYYY-MM-DD.json` and `power-tags-YYYY-MM-DD.json`

#### Steps
1. Open the web UI and navigate to the **🧠 ML Trainer** tab
2. Click **Start Training** button
3. Watch the real-time training progress:
   - Progress bar showing current epoch
   - Live metrics (Loss, Accuracy, Val Loss, Val Accuracy)
   - Learning curves updating in real-time
4. Training typically takes 2-5 minutes depending on data size
5. Model is automatically saved after training completes

#### Training Metrics
- **Loss**: How wrong the model's predictions are (lower is better)
- **Accuracy**: Percentage of correct predictions (higher is better)
- **Val Loss/Accuracy**: Performance on validation data (unseen during training)

### 2. Making Predictions

#### Using the Test Prediction Feature
1. After training, use the **Predict Tag** button in the ML Trainer tab
2. The model will use the last 50 minutes of loaded power data
3. View the predicted tag with confidence score
4. See all tag probabilities ranked by likelihood

#### Using the API Directly

**Endpoint**: `POST /api/ml/predict`

**Request Body**:
```json
{
  "powerData": [
    {
      "timestamp": "2025-11-28T10:00:00Z",
      "power": 450,
      "unit": "W"
    },
    // ... more data points (last 50 minutes)
  ]
}
```

**Response**:
```json
{
  "predictedTag": "climate",
  "confidence": 0.87,
  "allProbabilities": [
    { "tag": "climate", "probability": 0.87 },
    { "tag": "water heater", "probability": 0.08 },
    { "tag": "coffee", "probability": 0.03 },
    { "tag": "none", "probability": 0.02 }
  ]
}
```

## API Endpoints

### Training

#### `POST /api/ml/train`
Start model training with all available data.

**Response**: Server-Sent Events (SSE) stream with training progress

**Event Format**:
```json
{
  "epoch": 1,
  "loss": 0.4532,
  "accuracy": 0.8234,
  "valLoss": 0.5123,
  "valAccuracy": 0.7891
}
```

**Completion Event**:
```json
{
  "done": true,
  "message": "Training completed successfully"
}
```

### Status

#### `GET /api/ml/status`
Get current ML model status.

**Response**:
```json
{
  "trainingInProgress": false,
  "modelLoaded": true,
  "tags": ["climate", "water heater", "coffee", "none"],
  "historyLength": 50
}
```

### History

#### `GET /api/ml/history`
Get complete training history.

**Response**:
```json
{
  "history": [
    {
      "epoch": 1,
      "loss": 0.4532,
      "accuracy": 0.8234,
      "valLoss": 0.5123,
      "valAccuracy": 0.7891
    }
    // ... more epochs
  ],
  "tags": ["climate", "water heater", "coffee", "none"],
  "stats": {
    "minPower": 0,
    "maxPower": 3000
  }
}
```

### Prediction

#### `POST /api/ml/predict`
Predict tag for given power data.

**Request Body**:
```json
{
  "powerData": [
    { "timestamp": "...", "power": 450, "unit": "W" }
  ]
}
```

**Response**:
```json
{
  "predictedTag": "climate",
  "confidence": 0.87,
  "allProbabilities": [...]
}
```

## Data Requirements

### Training Data Format

The model learns from data in the `data/` folder:

**Power Data** (`power-data-YYYY-MM-DD.json`):
```json
{
  "date": "2025-11-28",
  "entityId": "sensor.power",
  "dataPoints": 9404,
  "data": [
    {
      "timestamp": "2025-11-28T00:00:00+00:00",
      "power": 450,
      "unit": "W"
    }
  ]
}
```

**Tag Data** (`power-tags-YYYY-MM-DD.json`):
```json
{
  "date": "2025-11-28",
  "entries": [
    {
      "startTime": "00:00",
      "endTime": "01:09",
      "label": "climate"
    }
  ]
}
```

### Minimum Requirements
- At least 2-3 days of data
- At least 100 tagged segments total
- Multiple instances of each tag for better learning

## Model Files

After training, the model is saved in `server/ml/saved_model/`:
- `model.json` - Model architecture and weights
- `weights.bin` - Model parameters
- `metadata.json` - Training metadata (tags, normalization stats, history)

## Performance Tips

### Improving Accuracy
1. **More Data**: Collect more days of tagged data
2. **Consistent Labeling**: Use consistent tag names (e.g., "climate" not "ac" or "air conditioning")
3. **Quality Tags**: Ensure tags accurately represent the power usage patterns
4. **Balanced Dataset**: Have roughly equal amounts of each tag type

### Retraining
- Retrain the model when you add significant new data
- Retrain if you notice decreased accuracy
- The model learns patterns, so more diverse examples = better predictions

## Troubleshooting

### "No training data found in data folder"
- Make sure you have saved at least one day of data using the "💾 Save Day" button
- Check that both `power-data-*.json` and `power-tags-*.json` files exist

### "Need at least 5 windows of data (50 minutes)"
- Prediction requires 50 minutes of continuous power data
- Load more data or wait for more real-time data to accumulate

### Low Accuracy
- Check if you have enough training data (aim for 100+ tagged segments)
- Verify your tags are consistent and accurate
- Try retraining with more epochs (modify `epochs` parameter in code)

### Training is Slow
- TensorFlow.js Node backend is used for better performance
- Training speed depends on data size and CPU
- Typical training: 2-5 minutes for 3-5 days of data

## Technical Details

### Data Preprocessing
1. **Windowing**: Data is split into 10-minute windows
2. **Resampling**: Each window is resampled to exactly 60 data points
3. **Normalization**: Power values are min-max normalized to [0, 1]
4. **Train/Val Split**: 80% training, 20% validation (randomly shuffled)

### Model Configuration
- **Optimizer**: Adam (learning rate: 0.001)
- **Loss Function**: Categorical Crossentropy
- **Metrics**: Accuracy
- **Batch Size**: 32
- **Default Epochs**: 50
- **Dropout**: 0.2 (LSTM), 0.3 (Dense)

### Hyperparameter Tuning
To modify training parameters, edit `server/index.js`:
```javascript
const epochs = 50        // Number of training epochs
const batchSize = 32     // Batch size
```

To modify model architecture, edit `server/ml/model.js` in the `buildModel()` method.

## Future Enhancements

Potential improvements:
- [ ] Real-time prediction while viewing live data
- [ ] Automatic retraining when new data is added
- [ ] Hyperparameter tuning interface
- [ ] Model comparison (test different architectures)
- [ ] Export predictions to CSV
- [ ] Confidence threshold alerts
- [ ] Multi-step ahead predictions (predict next hour)

## Credits

Built with:
- **TensorFlow.js**: Machine learning in JavaScript
- **Vue 3**: Reactive UI framework
- **Chart.js**: Training curve visualization
- **Express**: Backend API server
