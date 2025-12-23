# Home Assistant Sensor Sync Feature

## Overview

This feature automatically creates and updates Home Assistant sensors for predicted appliance power consumption. When enabled, the Power Detector will create `sensor.p_<appliance>` entities in Home Assistant with the correct device class to be compatible with the Energy Dashboard.

## Features

### 1. Automatic Sensor Creation
- Creates a sensor for each detected appliance
- Sensor naming convention: `sensor.p_<appliance_name>`
- Example: `sensor.p_water_heater`, `sensor.p_dishwasher`, `sensor.p_oven`

### 2. Energy Dashboard Compatible
Each sensor is created with proper attributes:
- **device_class**: `power` (required for energy dashboard)
- **state_class**: `measurement` (for statistical tracking)
- **unit_of_measurement**: `W` (Watts)
- **icon**: `mdi:flash`
- Additional metadata: appliance name, prediction date, last updated timestamp

### 3. Real-time Updates
- Sensors are updated immediately after each analysis
- Power values are calculated as the average of all prediction windows for each appliance
- Values are rounded to 2 decimal places

### 4. Toggle Control
- Enable/disable auto-sync from the Settings dialog
- Setting is persisted in localStorage
- Real-time sync status messages

## How to Use

### Enable Auto-Sync

1. Open the **Power Detector** tab
2. Click the **⚙️ Settings** button
3. Scroll down to the **🏠 Home Assistant Integration** section
4. Check the box: **"Auto-sync predicted power to Home Assistant sensors"**
5. Click **Close**

### Run Analysis

1. Select a date
2. Configure your prediction method (Seq2Point or GSP)
3. Click **🔄 Analyze**
4. After predictions complete, sensors will be automatically created/updated in Home Assistant

### View Sync Status

In the Settings dialog, you'll see:
- **Last sync**: Timestamp of the last successful sync
- **Status messages**: 
  - ✅ Success: Shows number of sensors synced
  - ⚠️ Warning: Partial success with some failures
  - ❌ Error: Sync failed

## Technical Details

### Backend API

**Endpoint**: `POST /api/ha/update-sensor`

**Request Body**:
```json
{
  "sessionId": "1234567890",
  "entityId": "sensor.p_water_heater",
  "state": 1250.5,
  "attributes": {
    "unit_of_measurement": "W",
    "device_class": "power",
    "state_class": "measurement",
    "friendly_name": "Predicted Water Heater Power",
    "icon": "mdi:flash",
    "source": "AI Power Viewer",
    "appliance": "water heater",
    "prediction_date": "2025-12-22",
    "last_updated": "2025-12-22T10:30:00.000Z"
  }
}
```

**Response**:
```json
{
  "success": true,
  "entityId": "sensor.p_water_heater",
  "state": "1250.5",
  "attributes": { ... }
}
```

### Frontend Service

**Function**: `updateHASensor(entityId, state, attributes)`

Located in: `src/services/homeassistant.js`

### Sensor Naming

Appliance names are sanitized for entity IDs:
- Converted to lowercase
- Spaces replaced with underscores
- Non-alphanumeric characters (except underscores) removed
- Prefixed with `p_` to indicate "predicted"

Examples:
- "Water Heater" → `sensor.p_water_heater`
- "Dishwasher" → `sensor.p_dishwasher`
- "Oven (Main)" → `sensor.p_oven_main`

## Using Sensors in Energy Dashboard

1. Go to **Settings** → **Dashboards** → **Energy**
2. Add a new device under **Individual Devices**
3. Select any of the `sensor.p_*` sensors
4. The sensor will now track energy consumption in the dashboard

## Compatibility

### Seq2Point Method
- Creates one sensor per trained model
- Sensor values represent the predicted power of that specific appliance
- Best for known, trained appliances

### GSP Method
- Creates sensors for all detected appliances
- Appliances are auto-numbered (Appliance 1, Appliance 2, etc.)
- Best for discovering unknown appliances

### Combined Use
When both methods are enabled:
- Seq2Point appliances use their trained names
- GSP appliances use auto-generated names
- All sensors are created/updated simultaneously

## Troubleshooting

### Sensors Not Appearing

1. **Check Connection**: Ensure you're connected to Home Assistant
2. **Check Permissions**: Your access token needs write permissions
3. **Check Logs**: Look in browser console for error messages
4. **Verify Settings**: Auto-sync must be enabled

### Sensor Values Seem Wrong

1. **Check Prediction Quality**: Review the prediction confidence scores
2. **Verify Training**: For Seq2Point, ensure models are properly trained
3. **Adjust Threshold**: Lower confidence threshold may capture more activity
4. **Check Date**: Ensure you're analyzing the correct date

### Energy Dashboard Not Showing Sensors

1. **Verify device_class**: Should be `power`
2. **Check unit**: Must be `W` (Watts)
3. **Restart Home Assistant**: Sometimes needed for new sensors
4. **Check Integration**: The sensor must have `state_class: measurement`

## Benefits

### For Energy Monitoring
- Track individual appliance consumption in the Energy Dashboard
- Compare predicted vs. actual consumption
- Identify high-consumption devices
- Monitor trends over time

### For Automation
- Create automations based on predicted appliance power
- Alert on unusual consumption patterns
- Optimize energy usage based on predictions

### For Analysis
- Historical tracking of appliance usage
- Export energy data for further analysis
- Validate ML model accuracy

## Future Enhancements

Potential improvements for future versions:
- Batch updates for better performance
- Historical data backfill
- Custom sensor naming templates
- Energy (kWh) sensors in addition to power (W)
- Configurable update intervals
- Sensor cleanup for old/unused appliances

## Related Documentation

- [Power Detector Feature](ML_FEATURE.md)
- [Seq2Point Implementation](SEQ2POINT_IMPLEMENTATION.md)
- [GSP Implementation](GSP_IMPLEMENTATION.md)
- [API Documentation](API_DOCS.md)
