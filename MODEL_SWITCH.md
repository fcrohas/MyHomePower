# Model Switching Guide

This application supports two different NILM (Non-Intrusive Load Monitoring) models that you can easily switch between for comparison.

## Available Models

### 1. PowerTagPredictor (Default)
- **Architecture**: Conv2D-based seq2point
- **Features**: Power regression + on/off classification
- **Best for**: Standard seq2point NILM tasks
- **File**: `server/ml/model.js`

### 2. MSDCPredictor
- **Architecture**: Conv1D-based with dual-branch processing
- **Features**: Multi-Scale Deep Convolutional NILM
- **Best for**: Multi-state appliance detection
- **File**: `server/ml/model-msdc.js`
- **Architectures**:

  **S2P_on** - Binary On/Off Detection:
  - Output: Power + **Binary state** (1 unit with sigmoid)
  - Predicts: `[Power: 150W] + [State: 0.95]` → "ON with 95% confidence"
  - Best for: Simple appliances (lamps, fans, heaters)
  - Layers: 5 Conv1D layers per branch (30→30→40→50→50 filters)
  
  **S2P_State** - Multi-State Classification:
  - Output: Power + **Multiple states** (N units with softmax)
  - Predicts: `[Power: 150W] + [States: [0.05, 0.10, 0.80, 0.05]]` → "Medium mode with 80% confidence"
  - Best for: Appliances with operating modes (dishwasher: off/pre-wash/wash/rinse/dry)
  - Layers: 6 Conv1D layers per branch (30→30→40→50→60→60 filters)
  
  **S2P_State2** - Multi-Scale Inception:
  - Output: Same as S2P_State (multi-state classification)
  - Features: Parallel convolutions (kernel sizes: 11, 9, 7) for multi-scale patterns
  - Best for: Complex appliances with varying temporal patterns
  - Architecture: Inception-style with feature concatenation

## Architecture Comparison

### Understanding the Output Differences

| Architecture | Output Type | Output Format | Example Use Case |
|-------------|-------------|---------------|------------------|
| **S2P_on** | Binary (sigmoid) | Single value 0-1 | `[Power: 150W, OnOff: 0.95]` - Lamp is ON |
| **S2P_State** | Multi-class (softmax) | Probability array | `[Power: 150W, States: [0.05, 0.10, 0.80, 0.05]]` - Dishwasher in wash cycle |
| **S2P_State2** | Multi-class (softmax) | Probability array | Same as S2P_State but with multi-scale features |

### Key Differences:

**S2P_on vs S2P_State:**
- **S2P_on**: Answers "Is it ON or OFF?" (binary: yes/no)
- **S2P_State**: Answers "What mode is it in?" (multi-class: off/low/medium/high)

**S2P_State vs S2P_State2:**
- **S2P_State**: Sequential convolutions (one kernel size at a time)
- **S2P_State2**: Parallel convolutions (multiple kernel sizes simultaneously) → captures short & long patterns at once

### Choosing the Right Architecture:

```
Simple appliance (on/off only)     → Use S2P_on
Multiple operating modes            → Use S2P_State  
Complex temporal patterns           → Use S2P_State2 (slower but more accurate)
```

## How to Switch Models

### Option 1: Environment Variables (Recommended)

Create or edit your `.env` file:

```bash
# Use PowerTagPredictor (default)
MODEL_TYPE=PowerTagPredictor

# Or use MSDCPredictor
MODEL_TYPE=MSDCPredictor
MSDC_ARCHITECTURE=S2P_on  # Options: S2P_on, S2P_State, S2P_State2
```

Then restart your server:
```bash
npm run dev
```

### Option 2: Direct Code Edit

Edit `server/index.js` (around line 43):

```javascript
// Change this line to switch models
const MODEL_TYPE = 'MSDCPredictor'  // or 'PowerTagPredictor'
const MSDC_ARCHITECTURE = 'S2P_State'  // Only for MSDC model
```

## Model Comparison Testing

To compare models in real conditions:

1. **Train with Model 1**:
   ```bash
   MODEL_TYPE=PowerTagPredictor npm run dev
   # Train your model via the UI
   ```

2. **Train with Model 2**:
   ```bash
   MODEL_TYPE=MSDCPredictor MSDC_ARCHITECTURE=S2P_on npm run dev
   # Train the same appliance with the new model
   ```

3. **Compare Results**:
   - Both models save to separate directories based on appliance name
   - Use the prediction API to test both models on the same data
   - Compare metrics: MSE, MAE, accuracy

## Quick Start Examples

### Example 1: Use Original Model
```bash
# Default behavior, no changes needed
npm run dev
```

### Example 2: Use MSDC with Binary On/Off
```bash
MODEL_TYPE=MSDCPredictor MSDC_ARCHITECTURE=S2P_on npm run dev
```

### Example 3: Use MSDC LITE Mode (For GPUs < 16GB)
```bash
# Recommended for RTX 5000 and similar GPUs
MODEL_TYPE=MSDCPredictor MSDC_ARCHITECTURE=S2P_on MSDC_LITE=true npm run dev
```

### Example 4: Use MSDC with Multi-State
```bash
MODEL_TYPE=MSDCPredictor MSDC_ARCHITECTURE=S2P_State npm run dev
```

### Example 5: Use MSDC with Multi-Scale
```bash
MODEL_TYPE=MSDCPredictor MSDC_ARCHITECTURE=S2P_State2 npm run dev
```

## GPU Memory Issues?

If you're getting out-of-memory errors:

1. **Enable LITE mode** (50% fewer parameters):
   ```bash
   MSDC_LITE=true
   ```

2. **Reduce batch size** in the training UI:
   - RTX 5000: 128-256
   - RTX 3060: 64-128
   - GTX 1080: 32-64

3. **See [GPU_MEMORY_GUIDE.md](GPU_MEMORY_GUIDE.md)** for detailed solutions

**LITE mode comparison:**
- FULL: 30→30→40→50→50 filters, 1024 dense = ~1.5M parameters
- LITE: 16→16→20→25→25 filters, 512 dense = ~400K parameters
- Accuracy: 95-98% of FULL model
- Speed: 30-40% faster training

## API Compatibility

Both models implement the same interface:
- `buildModel()`
- `train()`
- `predict()`
- `save()` / `load()`
- `loadONNX()` / `convertToONNX()`

All existing API endpoints work seamlessly with either model!

## Performance Notes

- **PowerTagPredictor**: Faster training, Conv2D captures 2D patterns
- **MSDCPredictor**: More parameters, Conv1D optimized for sequences
- **S2P_State2**: Slowest but captures multi-scale patterns best

## Troubleshooting

**Q: Which model should I use?**
A: Start with `PowerTagPredictor` (default). Try `MSDCPredictor` with `S2P_on` if you want to compare architectures.

**Q: Can I switch models after training?**
A: Yes! Models are saved separately. Just change the environment variable and load the appropriate model.

**Q: Do I need to retrain?**
A: Yes, the architectures are different so you'll need to train separate models. But training data can be reused.
