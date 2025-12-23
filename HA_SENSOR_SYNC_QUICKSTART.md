# Home Assistant Sensor Sync - Quick Setup

## What This Feature Does

Automatically creates `sensor.p_<appliance>` entities in Home Assistant for each predicted appliance, with proper device_class settings to work with the Energy Dashboard.

## Quick Start

### 1. Enable the Feature
1. Open the **Power Detector** tab
2. Click **⚙️ Settings**
3. Scroll to **🏠 Home Assistant Integration**
4. Check **"Auto-sync predicted power to Home Assistant sensors"**

### 2. Run Analysis
1. Select a date
2. Choose prediction method (Seq2Point or GSP)
3. Click **🔄 Analyze**
4. Sensors will be created/updated automatically

### 3. View Sensors in Home Assistant
- Check **Developer Tools** → **States**
- Look for sensors starting with `sensor.p_`
- Example: `sensor.p_water_heater`, `sensor.p_dishwasher`

### 4. Add to Energy Dashboard
1. Go to **Settings** → **Dashboards** → **Energy**
2. Add device under **Individual Devices**
3. Select your `sensor.p_*` sensor
4. Save

## Sensor Attributes

Each sensor includes:
- **State**: Current predicted power in Watts (W)
- **device_class**: `power` (required for energy dashboard)
- **state_class**: `measurement`
- **friendly_name**: `Predicted <Appliance> Power`
- **appliance**: Original appliance name
- **prediction_date**: Date of the prediction
- **last_updated**: Timestamp of last sync

## Example Sensors Created

For Seq2Point with trained models:
- `sensor.p_water_heater` - Predicted Water Heater Power
- `sensor.p_dishwasher` - Predicted Dishwasher Power
- `sensor.p_oven` - Predicted Oven Power

For GSP (auto-discovered):
- `sensor.p_appliance_1` - Predicted Appliance 1 Power
- `sensor.p_appliance_2` - Predicted Appliance 2 Power

## Files Modified

### Backend
- **server/index.js**: Added `/api/ha/update-sensor` endpoint

### Frontend
- **src/services/homeassistant.js**: Added `updateHASensor()` function
- **src/components/PowerDetector.vue**: 
  - Added auto-sync toggle and status display
  - Added `syncPredictionsToHA()` function
  - Integrated sync after predictions complete

### Documentation
- **HA_SENSOR_SYNC_FEATURE.md**: Complete feature documentation
- **HA_SENSOR_SYNC_QUICKSTART.md**: This quick setup guide

## Testing

1. Make sure you have a valid Home Assistant connection
2. Ensure you have either:
   - Trained Seq2Point models, OR
   - GSP enabled
3. Run analysis on a day with data
4. Check sync status in Settings dialog
5. Verify sensors appear in Home Assistant

## Troubleshooting

**Sensors not appearing?**
- Check you're connected to Home Assistant
- Verify auto-sync is enabled
- Look for sync status messages in Settings

**Wrong values?**
- Check prediction confidence scores
- Verify model training (for Seq2Point)
- Review actual power data for the day

**Energy Dashboard not showing?**
- Restart Home Assistant
- Verify sensor has `device_class: power`
- Check sensor state is numeric (not unavailable)

## Full Documentation

See [HA_SENSOR_SYNC_FEATURE.md](HA_SENSOR_SYNC_FEATURE.md) for complete documentation.
