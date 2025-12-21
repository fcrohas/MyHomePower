# GSP Parameter Optimization Guide

## 📊 Data Analysis Results (2025-11-08)

### Power Characteristics
- **Data points**: 9,490
- **Power range**: 190W - 5,790W
- **Average**: 577.6W
- **Median**: 350W

### Event Detection
- **Significant changes**: 4,071 events at 15W threshold
  - Positive (ON): 1,977 events
  - Negative (OFF): 2,094 events
- **Max change**: +3,700W / -3,180W

### Identified Appliance Signatures
1. **~20W**: 2,016 occurrences (likely standby/LED devices)
2. **~30W**: 721 occurrences
3. **~40W**: 447 occurrences
4. **~50W**: 301 occurrences
5. **~470W**: 40 occurrences (likely heating/cooling)

## ✅ Optimized Parameters (Best Results)

Based on systematic tuning with 11 different configurations:

```json
{
  "sigma": 30,
  "ri": 0.7,
  "T_Positive": 15,
  "T_Negative": -15,
  "alpha": 0.5,
  "beta": 0.5,
  "instancelimit": 2
}
```

### Results with Optimized Parameters
- **Appliances detected**: 2
- **Processing time**: ~50 seconds
- **Clusters formed**: 8 multi-scale clusters
- **Events processed**: 4,071

**Appliance 1**:
- Average power: 29.2W
- Max power: 170W
- Activations: 362 times

**Appliance 2**:
- Average power: TBD
- Activations: TBD

## 🎛️ Parameter Guide

### sigma (Gaussian kernel width)
- **Range**: 10 - 100
- **Recommended**: 30
- **Effect**: Controls smoothness of clustering
  - Lower (10-20): Finer clustering, more sensitive
  - Higher (50-100): Smoother clustering, less sensitive

### ri (Coefficient of variation threshold)
- **Range**: 0.3 - 1.0
- **Recommended**: 0.7
- **Effect**: Allows variation within clusters
  - Lower (0.3-0.5): Strict clustering (less variation)
  - Higher (0.7-1.0): Looser clustering (more variation)
  - **Key insight**: 0.7 performed better than 0.5 for this dataset

### T_Positive / T_Negative (Event thresholds)
- **Range**: ±10W to ±100W
- **Recommended**: ±15W
- **Effect**: Sensitivity of event detection
  - ±15W: 4,071 events (good coverage)
  - ±25W: 2,055 events (misses small appliances)
  - ±50W: 586 events (only large appliances)

### instancelimit (Minimum occurrences)
- **Range**: 2 - 10
- **Recommended**: 2
- **Effect**: Filters out rarely-used appliances
  - 2: Keeps appliances used 2+ times
  - 5-10: Only frequently-used appliances

### alpha / beta (Magnitude vs Temporal weight)
- **Recommended**: 0.5 / 0.5 (balanced)
- **Effect**: Balance between power magnitude and timing similarity

## 🧪 Tuning Results Summary

| Config | σ | ri | T± | Appliances | Time |
|--------|---|----|----|------------|------|
| **Best** | 30 | 0.7 | 15 | **2** | 49.8s |
| Good | 30 | 0.5 | 15 | 1 | 69.2s |
| Good | 20 | 0.5 | 15 | 1 | 29.9s |
| Poor | 30 | 0.5 | 25 | 0 | 14.8s |
| Poor | 50 | 0.5 | 25 | 0 | 22.7s |

## 💡 Key Insights

1. **Lower thresholds are critical**: T±15W finds 2x more events than T±25W
2. **Higher ri improves results**: 0.7 > 0.5 for this dataset
3. **QR decomposition optimization**: Made algorithm 8-9x faster than pseudoinverse
4. **Matrix rank deficiency is normal**: Some windows fail to invert (handled gracefully)

## 🚀 Usage Example

```javascript
import { disaggregatePower } from './server/ml/gspDisaggregator.js';

const result = disaggregatePower(data, {
  sigma: 30,
  ri: 0.7,
  T_Positive: 15,
  T_Negative: -15,
  alpha: 0.5,
  beta: 0.5,
  instancelimit: 2
});

console.log(`Found ${result.numAppliances} appliances`);
result.appliances.forEach(app => {
  console.log(`${app.name}: ${app.avgPower}W, ${app.activations} activations`);
});
```

## 🔧 Further Optimization

To find optimal parameters for different datasets:

```bash
# Analyze your data characteristics
node server/ml/gsp-data-analysis.js

# Run parameter tuning
node server/ml/gsp-tuning.js

# Test with optimized parameters
node server/ml/gsp-test-optimized.js
```

## ⚠️ Troubleshooting

**Problem**: No appliances detected
- **Solution**: Lower T_Positive/T_Negative to 10-15W
- **Solution**: Increase ri to 0.7-1.0
- **Solution**: Check data has clear ON/OFF events

**Problem**: Too slow
- ✅ Already optimized with QR decomposition
- Consider: Reduce event count with higher thresholds
- Consider: Smaller winL (currently 1000)

**Problem**: Too many false positives
- Increase T_Positive/T_Negative
- Decrease ri (stricter clustering)
- Increase instancelimit

## 📈 Performance

- **Dataset size**: 9,490 points
- **Events detected**: 4,071 (at T±15W)
- **Processing time**: ~50 seconds
- **Algorithm**: Multi-scale GSP with 7 sigma levels
- **Optimization**: QR decomposition (8x faster than pseudoinverse)
