# Seq2Point NILM Implementation Summary

## ✅ Completed Transformation

Successfully transformed your power tagging model to a **seq2point** architecture following the [MingjunZhong/seq2point-nilm](https://github.com/MingjunZhong/seq2point-nilm) implementation.

## 📁 Files Created/Modified

### Core Model Files
1. **`server/ml/model.js`** ✏️ Modified
   - Replaced CNN1D+LSTM architecture with Conv2D-based seq2point
   - Changed from multi-label classification to regression
   - Input: `[batch, 599]` aggregate power window
   - Output: `[batch, 1]` appliance power at midpoint
   - Added normalization utilities

2. **`server/ml/seq2pointPreprocessing.js`** ✨ New
   - Data loading and preprocessing for seq2point
   - Sliding window generation
   - Mains and appliance statistics calculation
   - Normalization/denormalization functions
   - Complete dataset preparation pipeline

3. **`server/ml/seq2point-train.js`** ✨ New
   - Command-line training script
   - Usage: `node seq2point-train.js <appliance> [windowLength] [epochs] [batchSize]`
   - Auto-saves best model
   - Saves metadata with normalization parameters

4. **`server/ml/seq2point-test.js`** ✨ New
   - Command-line testing script
   - Usage: `node seq2point-test.js <appliance> <testDate>`
   - Generates predictions with sliding windows
   - Calculates metrics (MSE, MAE, RMSE, accuracy)
   - Saves results to JSON

5. **`SEQ2POINT_QUICKSTART.md`** ✨ New
   - Complete documentation
   - Usage examples
   - Architecture explanation
   - Troubleshooting guide

## 🏗️ Architecture Changes

### Before (Multi-Label Classification)
```
Input: [batch, 300, 1] (5 windows × 60 points)
  ↓
CNN1D layers (64→128→128 filters)
  ↓
MaxPooling
  ↓
LSTM layers (64→32 units)
  ↓
Dense (32 units)
  ↓
Output: [batch, numTags] (sigmoid, multi-label)
Loss: Binary Crossentropy
```

### After (Seq2Point Regression)
```
Input: [batch, 599] (single window)
  ↓
Reshape: [batch, 1, 599, 1]
  ↓
Conv2D layer 1: 30 filters (10×1)
  ↓
Conv2D layer 2: 30 filters (8×1)
  ↓
Conv2D layer 3: 40 filters (6×1)
  ↓
Conv2D layer 4: 50 filters (5×1)
  ↓
Conv2D layer 5: 50 filters (5×1)
  ↓
Flatten
  ↓
Dense: 1024 units (ReLU)
  ↓
Output: [batch, 1] (linear, regression)
Loss: Mean Squared Error
```

## 🎯 Key Features

### 1. Seq2Point Learning
- Maps aggregate power window → appliance power at midpoint
- Window length: 599 timesteps (configurable)
- Single appliance per model (following paper)

### 2. Data Preprocessing
- **Automatic statistics calculation** for mains and appliances
- **Z-score normalization**: `(x - mean) / std`
- **Sliding window generation** with configurable step size
- **Train/validation split**: 95%/5% (following paper)

### 3. Training Features
- **Early stopping** with patience=3
- **Auto-save** best model on validation improvement
- **Batch size**: 1000 (default from paper)
- **Optimizer**: Adam (lr=0.001, β₁=0.9, β₂=0.999)
- **Metrics**: MSE, MAE

### 4. Inference Features
- Sliding window predictions over entire day
- Denormalization back to watts
- Ground truth comparison if available
- On/Off state accuracy calculation

## 📊 Data Format

### Power Data (unchanged)
```json
{
  "date": "2025-12-07",
  "dataPoints": 8640,
  "data": [
    {"timestamp": "...", "power": 245.5}
  ]
}
```

### Tag Data (unchanged)
```json
{
  "date": "2025-12-07",
  "entries": [
    {
      "startTime": "07:30",
      "endTime": "07:35",
      "label": "kettle"
    }
  ]
}
```

## 🚀 Quick Start

### Train a Model
```bash
cd server/ml
node seq2point-train.js kettle 599 10 1000
```

This will:
1. Load all power and tag data from `../../data/`
2. Calculate normalization statistics
3. Create sliding window training samples
4. Train for 10 epochs with batch size 1000
5. Save model to `saved_models/seq2point_kettle_model/`

### Test a Model
```bash
node seq2point-test.js kettle 2025-12-07
```

This will:
1. Load trained model and metadata
2. Load test data for the specified date
3. Generate predictions using sliding windows
4. Calculate evaluation metrics
5. Save results to `test_results/`

## 🔄 Migration Path

### If Using Old Model
Your existing multi-label classification model remains in `dataPreprocessing.js`. You can:

1. **Keep both**: Use classification for tag prediction, seq2point for power prediction
2. **Switch gradually**: Train seq2point models for key appliances
3. **Compare**: Evaluate which approach works better for your data

### Data Requirements
- **Minimum**: 7-14 days of labeled data per appliance
- **Optimal**: 30+ days with balanced on/off samples
- **Sampling rate**: Works with your existing 10-second intervals

## 📈 Expected Performance

Based on the paper (UK-DALE dataset):
- **Kettle**: MAE ~20-50W
- **Microwave**: MAE ~30-70W
- **Fridge**: MAE ~10-30W
- **Dishwasher**: MAE ~40-80W
- **Washing Machine**: MAE ~50-100W

Your results may vary based on:
- Data quality and quantity
- Appliance power signatures
- Sampling rate (10s vs 1s)
- Training duration

## 🔍 Differences from Paper

| Aspect | Paper | This Implementation |
|--------|-------|-------------------|
| Language | Python/Keras | JavaScript/TensorFlow.js |
| Dataset | UK-DALE/REFIT/REDD | Custom power monitoring |
| Sampling | 1-second intervals | 10-second intervals |
| Multi-appliance | Separate models | Separate models |
| Framework | Keras 2.3.1 | TensorFlow.js (Node) |

## 🎓 References

- **Paper**: [Sequence-to-point learning with neural networks for NILM](https://arxiv.org/abs/1902.08835)
- **Code**: [MingjunZhong/seq2point-nilm](https://github.com/MingjunZhong/seq2point-nilm)
- **NILM**: [Wikipedia](https://en.wikipedia.org/wiki/Nonintrusive_load_monitoring)

## 📝 Next Steps

1. **Train your first model**:
   ```bash
   node seq2point-train.js kettle
   ```

2. **Test it**:
   ```bash
   node seq2point-test.js kettle 2025-12-07
   ```

3. **Train more appliances**:
   - microwave
   - dishwasher
   - washing machine
   - any other tagged appliances

4. **Evaluate performance**: Compare with your existing tag-based approach

5. **Integrate**: Add seq2point predictions to your application API

6. **Optimize**: Tune hyperparameters based on your results

## 💡 Tips

- **More data = better results**: Use all available training data
- **Balance is key**: Ensure enough "on" time for each appliance
- **Try different window lengths**: 299, 399, 599 (odd numbers)
- **Monitor validation loss**: Should decrease steadily
- **Use early stopping**: Prevents overfitting automatically

## 🐛 Troubleshooting

See `SEQ2POINT_QUICKSTART.md` for detailed troubleshooting guide.

Common issues:
- "Not enough samples" → Need more training days
- "Out of memory" → Reduce batch size
- "Poor predictions" → Check data quality, train longer
- "Model not converging" → Adjust learning rate or normalization

---

**Ready to go!** Start with: `node seq2point-train.js kettle`
