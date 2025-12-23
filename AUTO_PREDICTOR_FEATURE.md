# Automatic Background Predictions

## Overview

The auto-predictor runs predictions automatically in the backend every hour (configurable) without requiring the UI. It fetches power data, runs predictions using Seq2Point and/or GSP, calculates energy consumption, and updates Home Assistant sensors automatically.

## Features

- ✅ **Automatic hourly predictions** - Runs in the backend on a schedule
- ✅ **No UI required** - Works 24/7 in the background
- ✅ **Configurable interval** - Default 60 minutes (1 hour)
- ✅ **Manual trigger** - Run predictions on-demand via UI or API
- ✅ **Status monitoring** - View last run time and results
- ✅ **Supports both methods** - Seq2Point and GSP
- ✅ **Direct sensor updates** - Updates Home Assistant sensors immediately

## Quick Start

### Enable from UI

1. Open **Power Detector** tab
2. Click **⚙️ Settings**
3. Scroll to **🤖 Automatic Background Predictions**
4. Check **"Enable automatic predictions every hour"**
5. Status will show: 🟢 Running

### Enable via API

```bash
curl -X POST http://localhost:3001/api/auto-predictor/start \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "intervalMinutes": 60,
    "useSeq2Point": true,
    "selectedModels": ["water heater", "dishwasher"],
    "useGSP": false
  }'
```

## How It Works

1. **Every hour** (or configured interval):
   - Fetches power data from Home Assistant for today
   - Runs predictions using configured method(s)
   - Calculates total energy (Wh) for each appliance
   - Updates `sensor.p_<appliance>` entities in Home Assistant

2. **Sensors are updated** with:
   - State: Accumulated energy in Wh
   - Attributes: device_class=energy, state_class=total_increasing
   - Metadata: appliance name, prediction date, last updated

3. **Runs independently** of the UI:
   - No browser needed to be open
   - Continues after server restart (auto-restores if enabled)
   - Logs all activity to console

## API Endpoints

### Start Auto-Predictor
```
POST /api/auto-predictor/start
```
Body:
```json
{
  "sessionId": "1234567890",
  "intervalMinutes": 60,
  "useSeq2Point": true,
  "selectedModels": ["water heater", "dishwasher", "oven"],
  "useGSP": false,
  "gspConfig": {
    "sigma": 20,
    "T_Positive": 20,
    "T_Negative": -20
  }
}
```

### Stop Auto-Predictor
```
POST /api/auto-predictor/stop
```

### Get Status
```
GET /api/auto-predictor/status
```
Response:
```json
{
  "enabled": true,
  "isRunning": true,
  "intervalMinutes": 60,
  "lastRun": "2025-12-22T10:30:00.000Z",
  "lastStatus": "Success: Updated 3/3 sensors in 2.5s"
}
```

### Trigger Manual Run
```
POST /api/auto-predictor/run
```

## Configuration

### Interval
Default: 60 minutes (1 hour)

Can be configured when starting:
```javascript
{
  "intervalMinutes": 30  // Run every 30 minutes
}
```

### Prediction Methods

**Seq2Point** (default):
- Uses trained models for specific appliances
- Requires models to be trained first
- High accuracy for known appliances

**GSP**:
- Training-free, auto-discovers appliances
- Good for unknown/new appliances
- Lower accuracy but no training needed

**Both**:
- Can run both methods simultaneously
- Combines results from all detected appliances

## Status Monitoring

### From UI
- Settings dialog shows real-time status
- Last run time and result
- Manual "Run Now" button

### From Logs
```bash
# Server console output
🤖 Starting auto-predictor (every 60 minutes)
🔄 Auto-predictor: Starting prediction run...
📊 Fetching power data from ...
✅ Fetched 8640 power data points
🧠 Running Seq2Point predictions for 3 models
  ✓ water heater: 1250.50 Wh
  ✓ dishwasher: 480.25 Wh
  ✓ oven: 320.75 Wh
📡 Updating 3 sensors in Home Assistant
  ✓ Updated sensor.p_water_heater: 1250.5 Wh
  ✓ Updated sensor.p_dishwasher: 480.25 Wh
  ✓ Updated sensor.p_oven: 320.75 Wh
✅ Auto-predictor run completed: Success: Updated 3/3 sensors in 2.5s
```

## Use Cases

### 1. Daily Energy Tracking
- Auto-predictor runs every hour
- Sensors accumulate energy throughout the day
- Energy dashboard shows real-time daily totals

### 2. Overnight Monitoring
- No need to keep UI open
- Predictions continue automatically
- Wake up to updated energy data

### 3. Long-term Tracking
- Runs continuously for weeks/months
- Historical data in Home Assistant
- Trend analysis and insights

### 4. Automation Triggers
- Create Home Assistant automations based on predicted energy
- Alert when appliance energy exceeds threshold
- Track usage patterns

## Troubleshooting

**Auto-predictor won't start**
- Check Home Assistant connection (valid session)
- Verify at least one prediction method is enabled
- Check server logs for errors

**No sensors updated**
- Verify models are trained (for Seq2Point)
- Check power data is available for today
- Look at lastStatus for error messages

**Status shows "No data available"**
- Predictions run but no power data found
- Check Home Assistant sensor is working
- Verify entityId is correct

**High CPU usage**
- Adjust interval (increase from 60 minutes)
- Reduce number of selected models
- Use GSP instead of Seq2Point (faster)

## Best Practices

1. **Start with longer intervals**: Begin with 60+ minutes until stable
2. **Monitor first runs**: Check logs to ensure everything works
3. **Use Seq2Point for accuracy**: Better results than GSP for known appliances
4. **Train models first**: Ensure models are trained before enabling auto-run
5. **Check Home Assistant**: Verify sensors appear and update correctly

## Technical Details

### Backend Service
- File: `server/auto-predictor.js`
- Class: `AutoPredictor`
- Uses Node.js `setInterval` for scheduling
- Maintains state across runs

### Graceful Shutdown
- Stops auto-predictor on server shutdown
- Cleans up intervals properly
- Can be restarted without issues

### Memory Management
- Models loaded once and cached
- Power data fetched fresh each run
- Results not stored (written directly to HA)

## Future Enhancements

- Configurable start/end times (e.g., only run 8am-10pm)
- Multiple schedules (different intervals for different times)
- Email/notification on failures
- Historical run logs stored to database
- Adaptive intervals based on data freshness
