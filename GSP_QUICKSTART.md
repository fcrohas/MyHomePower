# GSP Energy Disaggregation - Quick Start Guide

## Overview

GSP (Graph Signal Processing) is a **training-less** energy disaggregation method that automatically identifies appliances in your home without requiring any labeled training data. It uses graph signal processing techniques to detect power change events and cluster them into individual appliances.

## Key Advantages

✅ **No Training Required** - Works immediately without training data  
✅ **Automatic Appliance Detection** - Discovers appliances automatically  
✅ **Real-time Analysis** - Fast disaggregation for any day  
✅ **Adaptive** - Adjusts to your home's power patterns  

## Installation

### 1. Install Node.js Dependencies

```bash
npm install
# This will install mathjs which is required for GSP
```

### 2. Verify Installation

Run the test script to verify everything works:

```bash
cd server/ml
node gsp-test.js
```

## Using GSP in the UI

### 1. Enable GSP in Settings

1. Go to the **Power Detector** tab
2. Click the **⚙️ Settings** button
3. Enable **"Use GSP energy disaggregation"** checkbox
4. Click **Close**

### 2. Analyze a Day

1. Select a date using the date picker
2. Click **🔄 Analyze**
3. GSP will automatically identify all appliances and their usage patterns
4. View the results in the charts and detailed predictions table

## How GSP Works

GSP identifies appliances through a multi-step process:

1. **Event Detection** - Finds significant power changes (ON/OFF events)
2. **Clustering** - Groups similar events using graph signal processing
3. **Pairing** - Matches ON events with corresponding OFF events
4. **Disaggregation** - Reconstructs individual appliance power profiles

## Configuration Parameters

You can customize GSP behavior through the API:

```javascript
const config = {
  sigma: 20,              // Clustering sensitivity (5-50)
  ri: 0.15,               // Variation threshold (0.05-0.3)
  T_Positive: 20,         // Minimum ON power change (Watts)
  T_Negative: -20,        // Minimum OFF power change (Watts)
  alpha: 0.5,             // Weight for power matching (0-1)
  beta: 0.5,              // Weight for time matching (0-1)
  instancelimit: 3        // Min appliance activations (2-10)
}
```

### Parameter Tuning Tips

- **Increase `T_Positive/T_Negative`** to ignore small appliances
- **Decrease `sigma`** for more fine-grained appliance separation
- **Increase `instancelimit`** to filter out rarely-used appliances
- **Adjust `alpha/beta`** to balance power vs. timing in matching

## API Usage

### Analyze a Day

```javascript
POST /api/gsp/analyze-day

Body:
{
  "date": "2025-12-16",
  "powerData": [
    { "timestamp": "2025-12-16T00:00:00Z", "power": 150 },
    { "timestamp": "2025-12-16T00:01:00Z", "power": 155 },
    ...
  ],
  "config": {  // Optional
    "sigma": 20,
    "T_Positive": 30
  }
}

Response:
{
  "success": true,
  "date": "2025-12-16",
  "numAppliances": 3,
  "appliances": [
    {
      "id": "appliance_1",
      "name": "Appliance 1",
      "avgPower": 850.5,
      "maxPower": 1200,
      "activations": 5,
      "timeseries": [
        { "timestamp": "2025-12-16T08:15:00Z", "power": 0 },
        { "timestamp": "2025-12-16T08:16:00Z", "power": 850 },
        ...
      ]
    },
    ...
  ]
}
```

### Get Configuration Info

```javascript
GET /api/gsp/config

Response:
{
  "algorithm": "GSP (Graph Signal Processing)",
  "trainingRequired": false,
  "parameters": { ... }
}
```

## Testing

Run the test script with sample data:

```bash
cd server/ml
node gsp-test.js
```

This will:
- Check Python dependencies
- Load sample power data
- Run GSP disaggregation
- Display identified appliances
- Save detailed results to `test_results/gsp_test_results.json`

## Troubleshooting

### "Missing mathjs dependency"

Install required package:
```bash
npm install mathjs
```

### "No significant power events detected"

Try lowering the event thresholds:
```javascript
{
  "T_Positive": 10,
  "T_Negative": -10
}
```

### "Could not identify distinct appliances"

This can happen if:
- Data period is too short (try a full day)
- Power usage is too stable (no appliance changes)
- Appliances have very similar power signatures

Try:
- Adjusting `sigma` (try 10-30 range)
- Lowering `instancelimit` to 2
- Using a day with more varied appliance usage

### Too many/few appliances detected

- **Too many**: Increase `sigma` or `instancelimit`
- **Too few**: Decrease `sigma` or lower `T_Positive/T_Negative`

## Comparison with Seq2Point

| Feature | GSP | Seq2Point |
|---------|-----|-----------|
| Training Required | ❌ No | ✅ Yes |
| Appliance-Specific | ❌ No (auto-detects all) | ✅ Yes (one model per appliance) |
| Accuracy | Medium | High |
| Speed | Fast | Fast |
| Setup Time | Instant | Requires training data |
| Best For | Quick analysis, new homes | Known appliances, high accuracy |

## Best Practices

1. **Full Day Analysis** - Use complete 24-hour periods for best results
2. **Varied Usage** - Works best on days with clear appliance ON/OFF events
3. **Parameter Experimentation** - Try different config values for your home
4. **Combine Methods** - Use GSP for discovery, Seq2Point for specific appliances

## Reference

Based on the paper:  
**"On a training-less solution for non-intrusive appliance load monitoring using graph signal processing"**

Original implementation: https://github.com/loneharoon/GSP_energy_disaggregator

## Next Steps

- Try GSP on different days to see how it adapts
- Experiment with configuration parameters
- Compare results with Seq2Point models
- Use identified appliances to create Seq2Point training data

---

For more technical details, see [GSP_IMPLEMENTATION.md](GSP_IMPLEMENTATION.md)
