# Multi-Task Seq2Point Model

## Overview

The multi-task seq2point model learns **two things simultaneously**:
1. **Power Regression**: How much power the appliance is using (continuous value)
2. **On/Off Classification**: Whether the appliance is on or off (binary: 0/1)

## Benefits

- **Better ON/OFF Detection**: The classification task helps the model learn clear boundaries between on and off states
- **More Robust Predictions**: Two complementary objectives guide the learning process
- **Clearer Patterns**: The model learns both "is it on?" and "how much power?" which reinforces correct behavior

## Training

The multi-task model is automatically used for single-appliance seq2point training:

```bash
# Train a new multi-task model
node seq2point-train.js "climate" 599 30 128

# Continue training an existing model
node seq2point-train.js "climate" 599 20 128 --continue
```

## Model Architecture

```
Input: [599 aggregate power samples]
  ↓
5x Conv2D Layers (pattern extraction)
  ↓
Dense Layer (1024 units)
  ↓
  ├─→ Power Output (linear activation) → MSE Loss
  └─→ On/Off Output (sigmoid activation) → Binary Crossentropy Loss
```

## Loss Weighting

- **Power Regression**: Weight = 1.0 (primary task)
- **On/Off Classification**: Weight = 0.5 (helper task)

This ensures the model focuses on accurate power prediction while using on/off classification to improve decision boundaries.

## Testing

Test the model as before - predictions will use both outputs:

```bash
node seq2point-test.js "climate" "2025-12-16"
```

The test script will show:
- Power predictions (from regression output)
- Implicit on/off decisions (from classification output combined with power threshold)

## Expected Improvements

With multi-task learning, the climate model should:
- Predict **0W or very low power** when the appliance is OFF (not 330-391W)
- Predict **accurate power levels** when the appliance is ON
- Have **sharper transitions** between ON and OFF states
- Show **better generalization** to unseen data
