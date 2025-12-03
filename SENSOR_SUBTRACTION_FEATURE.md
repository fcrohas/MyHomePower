# Sensor Subtraction Feature

## Overview
Added a new feature to the TagManager component that allows users to subtract individual power sensor data from the main power consumption chart. This helps identify unaccounted power usage by removing known consumption sources.

## Features

### 1. Settings Dialog
- Click the ⚙️ settings button in the TagManager header
- Opens a dialog that fetches all power sensors from Home Assistant
- Displays available sensors with:
  - Friendly name
  - Entity ID
  - Current power state (in Watts)
- Checkboxes allow selecting multiple sensors
- Only shows sensors with unit of measurement in Watts (W)

### 2. Sensor Selection
- Select sensors you want to be available for subtraction
- Selected sensors are saved to localStorage
- Click "Apply Selection" to save your choices

### 3. Sensor Subtraction
- After selecting available sensors, a dropdown appears in the TagManager
- Select a sensor from the dropdown to add it to the subtraction list
- Multiple sensors can be added one by one
- Each added sensor's historical data is fetched and subtracted from the main chart

### 4. Active Subtractions Display
- Shows all currently active sensor subtractions
- Each sensor has a remove button (✕) to stop subtracting it
- Changes are immediately reflected in the chart

## How It Works

### Data Flow
1. **Raw Data**: The original power consumption data is stored in `rawPowerData`
2. **Sensor History**: When a sensor is added, its history is fetched for the current date
3. **Subtraction Algorithm**: 
   - For each data point in the main power data
   - Finds the closest sensor reading (within 5 minutes)
   - Subtracts the sensor value from the main value
   - Ensures the result is non-negative (minimum 0)
4. **Chart Update**: The chart displays the resulting subtracted data

### Persistence
- Available sensors are saved to `localStorage` as `availableSensors`
- Active subtracted sensors are saved as `subtractedSensors`
- Settings persist across page reloads

## Use Cases

### Identify Unknown Consumption
If you have a main power meter and individual device meters:
1. Add known devices (fridge, HVAC, water heater) to subtraction
2. The resulting chart shows "mystery" power usage
3. Use this to identify overlooked devices or vampire loads

### Analyze Specific Circuits
Subtract all but one circuit to see its isolated consumption pattern

### Debug Power Issues
Compare expected vs actual power by subtracting known loads

## Technical Details

### Components Modified
- **TagManager.vue**: Added settings dialog, sensor selection UI, and subtraction controls
- **PowerViewer.vue**: Added sensor subtraction logic and data processing

### New Functions
- `loadPowerSensors()`: Fetches all power sensors from Home Assistant
- `applySensorSubtractions()`: Applies all active sensor subtractions to the data
- `subtractSensorData()`: Algorithm for subtracting one sensor's data from main data
- `onSensorsChanged()`: Event handler when subtracted sensors list changes

### API Integration
- Uses existing `getEntities()` to fetch all Home Assistant entities
- Uses `fetchHistory()` to get historical data for each sensor
- Filters entities to only show power sensors (W unit)

## UI/UX Features
- Visual feedback with sensor cards that highlight on selection
- Color-coded sections (light blue for sensor subtraction area)
- Real-time chart updates when sensors are added/removed
- Error handling with user-friendly messages
- Responsive dialog design

## Future Enhancements
- Graph overlay showing individual sensor contributions
- Percentage breakdown of power usage
- Sensor grouping (e.g., "Kitchen Appliances")
- Export subtracted data
- Historical comparison of subtractions
