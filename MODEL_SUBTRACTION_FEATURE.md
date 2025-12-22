# Model Subtraction Feature

## Overview
Added a new feature that allows users to subtract power predictions from trained seq2point models, similar to how physical power sensors can be subtracted. This creates "virtual sensors" from ML models, making them behave like actual power meters for disaggregation purposes.

## Features

### 1. Model Selection UI
- Located in the TagManager component below sensor subtraction
- Shows all available trained seq2point models
- Dropdown to select models to add to subtraction list
- Visual list of active model subtractions
- Each model has a remove button (✕) to stop subtracting it

### 2. Model Subtraction Logic
- Models are loaded automatically from the server
- When a model is added:
  - The model predicts power for the entire day using the `/api/seq2point/predict-day` endpoint
  - Predictions are subtracted from the main power data (similar to physical sensors)
  - Chart updates immediately to show remaining power
- Multiple models can be subtracted simultaneously
- Order of operations: Sensors are subtracted first, then models

### 3. Persistence
- Selected models are saved to `localStorage` as `subtractedModels`
- Selections persist across page reloads
- When date changes, predictions are re-calculated for the new date

## How It Works

### Data Flow
1. **Raw Data**: Original power consumption from Home Assistant
2. **Sensor Subtraction**: Physical sensor data is fetched and subtracted (if any)
3. **Model Prediction**: For each selected model:
   - Load the trained seq2point model
   - Generate predictions for the entire day using sliding windows
   - Predictions use the raw power data as input
4. **Model Subtraction**: 
   - For each data point in the current power data
   - Find the corresponding model prediction (matched by timestamp)
   - Subtract the predicted power from the current value
   - Ensure the result is non-negative (minimum 0)
5. **Chart Update**: Display the final subtracted data

### API Integration
- **GET** `/api/seq2point/models` - Fetch available trained models
- **POST** `/api/seq2point/predict-day` - Get day-long predictions
  ```json
  {
    "appliance": "kettle",
    "powerData": [
      {"timestamp": "2025-12-21T00:00:00Z", "power": 245.5},
      ...
    ]
  }
  ```
  Returns:
  ```json
  {
    "appliance": "kettle",
    "predictions": [
      {"timestamp": "2025-12-21T00:00:00Z", "predictedPower": 12.3},
      ...
    ]
  }
  ```

## Use Cases

### 1. Progressive Disaggregation
Start with known appliances and work your way down:
1. Train models for major appliances (HVAC, water heater, etc.)
2. Add them to subtraction list
3. See what remains - helps identify unmodeled loads
4. Tag remaining patterns and train new models

### 2. Model Validation
Compare model predictions against reality:
1. Subtract a model's predictions
2. During periods when the appliance is actually ON:
   - If remaining power drops significantly → model is accurate
   - If remaining power stays high → model is under-predicting
3. Use insights to improve model training

### 3. Virtual Multi-Meter System
Create a "virtual" sub-metering system:
1. Train models for each circuit/appliance
2. Subtract all models
3. Remaining power = unaccounted consumption
4. Perfect for homes without physical sub-meters

### 4. Baseline Extraction
Remove variable loads to see baseline:
1. Subtract all discretionary appliance models
2. Remaining power shows your home's baseline (always-on) consumption
3. Identify vampire loads and inefficiencies

## Technical Details

### Components Modified
- **TagManager.vue**: 
  - Added model subtraction UI section
  - Added state management for selected models
  - Added functions to load models and manage selection list
  - Emits `models-changed` event when selection changes
  
- **PowerViewer.vue**: 
  - Added `onModelsChanged` event handler
  - Added `applyModelSubtractions()` function
  - Modified `applyAllSubtractions()` to handle both sensors and models
  - Updated data loading to trigger all subtractions

### New Functions

#### TagManager.vue
- `loadAvailableModels()`: Fetches trained models from server
- `addModelToSubtract()`: Adds selected model to subtraction list
- `removeModelSubtraction()`: Removes model from subtraction list
- `loadStoredModels()`: Loads saved selections from localStorage

#### PowerViewer.vue
- `onModelsChanged()`: Event handler for model selection changes
- `applyAllSubtractions()`: Orchestrates sensor and model subtractions
- `applyModelSubtractions()`: Fetches predictions and subtracts them from power data

### State Management
- `availableModels`: List of all trained models available on server
- `subtractedModels`: List of currently selected models for subtraction
- `selectedModelToAdd`: Currently selected model in dropdown
- Stored in localStorage: `subtractedModels`

### Subtraction Algorithm
Same algorithm used for both physical sensors and model predictions:
```javascript
// For each power data point
for (const dataPoint of powerData) {
  // Find closest prediction (within 5 minutes)
  const prediction = findClosestPrediction(dataPoint.timestamp, modelData)
  
  // Subtract and ensure non-negative
  dataPoint.value = Math.max(0, dataPoint.value - prediction)
}
```

## UI/UX Features
- Green-tinted section to distinguish from sensor subtraction (blue-tinted)
- Model names are displayed with capitalization
- Helpful hint text explains the feature
- Real-time chart updates when models are added/removed
- Error handling with user-friendly messages
- Loading states while fetching models

## Requirements
- Trained seq2point models must exist in `server/ml/saved_models/`
- Models must be trained using `seq2point-train.js`
- Each model should have proper metadata with normalization stats

## Best Practices

### Training Models for Subtraction
1. **Use adequate training data**: 30+ days recommended
2. **Balance on/off samples**: Ensure model learns both states
3. **Validate first**: Test model accuracy before subtracting
4. **Start with high-power appliances**: Easier to validate accuracy
5. **One appliance per model**: Don't combine multiple appliances

### Subtraction Order
1. Physical sensors first (most accurate)
2. High-confidence models next (well-trained, high-power)
3. Experimental models last (lower confidence)

### Monitoring Results
- After subtraction, remaining power should be:
  - **Positive**: Always non-negative
  - **Reasonable**: Not suspiciously low or high
  - **Explainable**: Corresponds to known unmodeled loads
- If results look wrong:
  - Check model training quality
  - Verify sensor calibration
  - Review raw data for anomalies

## Future Enhancements
- Model confidence visualization
- Stacked area chart showing each model's contribution
- Automatic model retraining suggestions
- Model ensemble/averaging for better accuracy
- Export disaggregated data per model
- Compare multiple model versions

## Troubleshooting

### "No models available"
- Train a model first: `node server/ml/seq2point-train.js appliance_name`
- Check that models exist in `server/ml/saved_models/`

### "Failed to get predictions"
- Ensure server is running on port 3000
- Check that model loaded successfully (see server logs)
- Verify power data has enough points (need window length, usually 599)

### "Subtraction produces negative values"
- Model is over-predicting
- Consider retraining with better balanced data
- Check normalization stats in model metadata

### "Remaining power seems too high"
- Model is under-predicting
- May need more training data
- Verify appliance was active during training periods
