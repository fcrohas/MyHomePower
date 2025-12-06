# Auto Labels Feature

## Overview
The Auto Labels feature uses machine learning models to automatically generate tag predictions for power consumption data. This helps users quickly label their power curves without manual selection of each time range.

## Recent Updates

### Version 2.0 (December 2025)
- ✅ **Model Names**: Now displays custom model names you entered during training
- ✅ **Multi-Label Support**: Automatically generates separate tag entries for all detected labels above the threshold
- ✅ **Better Formatting**: Model dates are now formatted in a readable format (e.g., "Dec 6, 2025, 11:30 AM")
- ✅ **Tag List Integration**: Predictions now appear directly in the TagManager's "Tagged Periods" list instead of only on the chart
- ✅ **Visual Distinction**: Predicted tags have a yellow/orange dashed border and show confidence percentage
- ✅ **Batch Actions**: Accept or clear all predictions with one click from the TagManager

## Features

### 1. **Auto Labels Button**
- Located at the top of the Power Chart
- Opens a settings dialog to configure prediction parameters
- Shows a 🤖 icon for easy identification

### 2. **Settings Dialog**
Configure the following parameters:

#### Model Selection
- Choose from available trained ML models with their custom names
- Shows model name (if provided during training) or Model ID
- Displays formatted training date and time for easy identification
- Default option uses the currently loaded model (`saved_model`)
- Models are sorted by training date (newest first)

#### Confidence Threshold (0.1 - 0.9)
- Controls which predictions to include
- Higher threshold = fewer but more confident predictions
- Lower threshold = more predictions but potentially less accurate
- Default: 0.3 (30%)
- Recommended range: 0.2 - 0.5 depending on your data quality

#### Sliding Window Size (5-30 minutes)
- Controls the granularity of predictions
- Smaller values (5-10 min): More detailed predictions, slower processing
- Larger values (15-30 min): Faster processing, less granular
- Default: 10 minutes
- Trade-off: speed vs. detail

### 3. **Predicted Tags in TagManager**
Once generated, predicted tags appear in the **"Tagged Periods"** list with:
- **Yellow/orange background** (vs gray for confirmed tags)
- **Dashed left border** (vs solid for confirmed tags)
- **Confidence badge** showing percentage (e.g., "85%")
- **Action buttons** to accept all or clear all predictions
- **Individual deletion** - Click ✕ to remove specific predictions

Visual appearance in the list:
- Confirmed tags: Gray background, green solid border
- Predicted tags: Yellow background, orange dashed border with confidence %

### 4. **Managing Predictions**

#### In TagManager Header
When predictions are present, two buttons appear:
- **✓ Accept [N] predictions**: Converts all predictions to confirmed tags
- **✕ Clear predictions**: Removes all predictions without confirming

#### Individual Management
- Click the **✕** button on any predicted tag to remove it
- Predictions are mixed with confirmed tags in chronological order
- Easy to spot by their yellow background and confidence badge

#### Accept Predictions
- Converts predicted tags to regular confirmed tags
- Removes the "isPrediction" flag and confidence badge
- Tags become permanent and are saved with the day's data
- The yellow background changes to gray (confirmed state)

#### Multi-Label Behavior
When a time window has multiple detected labels:
- Each label appears as a **separate entry** in the tag list
- All entries share the same time range
- Each has its own confidence percentage
- You can delete individual labels or accept all together

## Usage Workflow

1. **Load Power Data**
   - Navigate to a specific day
   - Ensure power data is loaded and visible on the chart

2. **Open Auto Labels Settings**
   - Click the "🤖 Auto Labels" button
   - Settings dialog appears

3. **Configure Parameters**
   - Select a trained model (optional)
   - Adjust confidence threshold based on your needs
   - Set sliding window size (10 min is a good starting point)

4. **Generate Labels**
   - Click "Generate Labels"
   - Wait for processing (typically a few seconds)
   - Predictions appear on the chart with dashed borders

5. **Review Predictions**
   - Check predicted tags on the chart
   - Verify labels and time ranges
   - Look at confidence percentages

6. **Accept or Adjust**
   - **Option A**: Click "✓ Accept All" to confirm all predictions
   - **Option B**: Click "✕ Clear" and adjust settings to regenerate
   - **Option C**: Manually adjust individual predictions (future enhancement)

## Tips for Best Results

### Model Selection
- Use models trained on similar power consumption patterns
- More recent models may perform better with current usage patterns
- Test different models to find the best fit

### Confidence Threshold
- Start with 0.3 and adjust based on results
- If you get too many false positives, increase to 0.4-0.5
- If you miss obvious patterns, decrease to 0.2-0.25

### Sliding Window Size
- 10 minutes: Good balance for most use cases
- 5 minutes: Use for appliances with short cycles
- 15-30 minutes: Use for longer-running appliances or faster processing

### Data Quality
- More training data = better predictions
- Consistent labeling in training data = more accurate results
- Clean data without gaps = better window coverage

## Technical Details

### API Endpoint
Uses the `/api/ml/predict-day-sliding` endpoint with:
```json
{
  "date": "2025-12-06",
  "powerData": [...],
  "stepSize": 10,
  "threshold": 0.3
}
```

### Prediction Process
1. Converts chart data points to API format
2. Loads selected model (if specified)
3. Runs sliding window predictions across the day
4. Filters results by confidence threshold
5. Returns time ranges with labels and confidence scores

### Visual Distinction
Predicted tags use:
- Border dash: `[5, 5]` (dashed)
- Background opacity: 0.1 (vs 0.2 for confirmed)
- Border opacity: 0.6 (vs 0.8 for confirmed)
- Label includes confidence: "Label (XX%)"

## Future Enhancements

Potential improvements for this feature:
- [ ] Individual prediction editing (adjust time ranges)
- [ ] Cherry-pick predictions (accept/reject individually)
- [ ] Real-time confidence visualization
- [ ] Batch export predicted tags
- [ ] Prediction history and comparison
- [ ] Auto-merge overlapping predictions
- [ ] Confidence-based color coding

## Troubleshooting

### "No trained model found"
- Train a model first using the ML Trainer tab
- Ensure the model is saved successfully

### "Failed to generate auto labels"
- Check that the ML server is running
- Verify power data is loaded for the selected day
- Check browser console for detailed error messages

### Low quality predictions
- Increase training data quantity
- Ensure consistent labeling in training set
- Try adjusting confidence threshold
- Experiment with different sliding window sizes

### Too many/few predictions
- Adjust confidence threshold accordingly
- More predictions: Lower threshold (0.2-0.25)
- Fewer predictions: Higher threshold (0.4-0.5)

## Related Files

- `src/components/PowerChart.vue` - Main implementation
- `server/ml/slidingWindowPredictor.js` - Prediction logic
- `server/index.js` - API endpoints (`/api/ml/predict-day-sliding`)
