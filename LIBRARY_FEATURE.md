# Appliance Model Library Feature

## Overview

The **Libraries** feature allows you to manage, share, and reuse appliance models for power disaggregation. Each model card contains detailed information about an appliance including its power characteristics, technical specifications, and can be linked to trained ML models.

## Features

### 📚 Model Management
- **Create Models**: Add new appliance models with detailed specifications
- **Edit Models**: Update existing model information
- **Delete Models**: Remove models from your library
- **View Models**: Browse all models in a beautiful card-based interface

### 💾 Import/Export
- **Export Models**: Save individual models as JSON files for sharing
- **Import Models**: Load models from JSON files shared by others
- **Share Libraries**: Exchange appliance profiles with the community

### 🔗 TensorFlow Model Linking
- **Link Trained Models**: Associate trained TensorFlow models with library entries
- **Model Status**: Track which appliances have trained models available

## Model Card Structure

Each model card contains:

### Basic Information
- **Name**: Descriptive name of the appliance (e.g., "Washing Machine - Samsung WF45")
- **Description**: Detailed description of the appliance and usage patterns

### Technical Specifications
- **Device Type**: Category of appliance (washing machine, dishwasher, etc.)
- **Manufacturer**: Brand name
- **Model Number**: Specific model identifier

### Power Properties
- **Power Min (W)**: Minimum power consumption in watts
- **Power Max (W)**: Maximum power consumption in watts
- **On/Off States**: Whether the appliance has distinct on/off states
- **Annual Power (Wh)**: Estimated annual power consumption

### Metadata
- **Created Date**: When the model was added to the library
- **Trained Model Status**: Whether a trained ML model exists
- **Linked Appliance**: Name of linked TensorFlow model

## Usage Guide

### Adding a New Model

1. Navigate to the **📚 Libraries** tab
2. Click **➕ Add New Model**
3. Fill in the form:
   - Enter a descriptive name
   - Add technical specifications
   - Define power properties
4. Click **Create Model**

### Exporting a Model

1. Find the model card you want to export
2. Click the **💾** (save) icon
3. The model will be downloaded as a JSON file
4. Share this file with others

### Importing a Model

1. Click **📥 Import Model** in the header
2. Select a JSON file from your computer
3. The model will be added to your library
4. Review and edit if needed

### Linking to Trained Models

Models can be linked to trained TensorFlow models through the API:

```javascript
POST /api/library/models/:id/link
{
  "applianceName": "washing_machine"
}
```

This automatically checks if a trained model exists and updates the card status.

## API Endpoints

### GET /api/library/models
Get all models in the library.

**Response:**
```json
[
  {
    "id": "1234567890",
    "name": "Washing Machine - Samsung WF45",
    "description": "Front-load washer with multiple cycles",
    "deviceType": "washing_machine",
    "manufacturer": "Samsung",
    "modelNumber": "WF45R6100AW",
    "properties": {
      "powerMin": 10,
      "powerMax": 2000,
      "hasOnOff": true,
      "annualPowerWh": 180000
    },
    "hasTrainedModel": false,
    "createdAt": "2025-12-31T12:00:00.000Z",
    "updatedAt": "2025-12-31T12:00:00.000Z"
  }
]
```

### POST /api/library/models
Create a new model.

**Request:**
```json
{
  "name": "Dishwasher - Bosch 800",
  "description": "Energy-efficient dishwasher",
  "deviceType": "dishwasher",
  "manufacturer": "Bosch",
  "modelNumber": "SHPM88Z75N",
  "properties": {
    "powerMin": 5,
    "powerMax": 1800,
    "hasOnOff": true,
    "annualPowerWh": 270000
  }
}
```

### PUT /api/library/models/:id
Update an existing model.

### DELETE /api/library/models/:id
Delete a model from the library.

### GET /api/library/export/:id
Export a model as a JSON file.

### POST /api/library/import
Import a model from JSON.

**Request:**
```json
{
  "model": {
    "name": "...",
    "description": "...",
    "properties": { ... }
  }
}
```

### POST /api/library/models/:id/link
Link a trained TensorFlow model to a library model.

**Request:**
```json
{
  "applianceName": "washing_machine"
}
```

## File Storage

Models are stored in `server/library/models.json`:

```json
{
  "models": [
    { ... },
    { ... }
  ]
}
```

This file-based approach makes it easy to:
- Back up your library
- Version control model definitions
- Share entire libraries
- Migrate between systems

## Device Types

Supported device types:
- Washing Machine (`washing_machine`)
- Dishwasher (`dishwasher`)
- Refrigerator (`refrigerator`)
- Dryer (`dryer`)
- Oven (`oven`)
- Microwave (`microwave`)
- Air Conditioner (`air_conditioner`)
- Water Heater (`water_heater`)
- Other (`other`)

## Best Practices

### Power Properties
1. **Accurate Ranges**: Set realistic min/max power values based on actual measurements
2. **Annual Consumption**: Calculate from manufacturer specs or actual usage data
3. **On/Off States**: Only enable if the appliance has clear on/off transitions

### Descriptions
- Include typical usage patterns
- Note any special power characteristics
- Mention modes or cycles if applicable

### Naming Convention
Use the format: `[Device Type] - [Manufacturer] [Model]`
- Example: "Washing Machine - Samsung WF45R6100AW"
- Example: "Dishwasher - Bosch 800 Series"

## Integration with ML Training

The library feature integrates with the ML Trainer:

1. **Model Selection**: Choose appliances from library during training
2. **Auto-configuration**: Pre-fill power thresholds from library data
3. **Model Linking**: Automatically link trained models to library entries
4. **Status Tracking**: See which appliances have trained models

## Sharing Models

### Exporting for Sharing
1. Export the model as JSON
2. Share the file via email, cloud storage, or repository
3. Include a README with context about the appliance

### Importing Shared Models
1. Download the JSON file
2. Use the import feature
3. Verify the power properties match your setup
4. Adjust if needed for your specific appliance

## Future Enhancements

Planned improvements:
- **Community Library**: Central repository of shared models
- **Model Validation**: Automatic validation against real power data
- **Batch Import/Export**: Import/export multiple models at once
- **Model Templates**: Pre-configured templates for common appliances
- **Power Signature Visualization**: Visual representation of power patterns
- **Model Versioning**: Track changes to model definitions over time

## Troubleshooting

### Model Not Showing Trained Status
- Ensure the TensorFlow model directory name matches the linked appliance name
- Check that model files exist in `server/models/[appliance_name]/`
- Use the link endpoint to refresh the status

### Import Failed
- Verify the JSON file structure matches the expected format
- Check that required fields (name, properties) are present
- Ensure power values are valid numbers

### Export Not Working
- Check browser download settings
- Verify the model exists in the library
- Try a different browser if issues persist

## Technical Details

### Frontend Component
- **Location**: `src/components/LibraryManager.vue`
- **Service**: `src/services/library.js`
- **Styling**: Responsive card-based layout with modal forms

### Backend Implementation
- **Location**: Server endpoints in `server/index.js`
- **Storage**: JSON file at `server/library/models.json`
- **Functions**: CRUD operations for model management

### Data Model
```typescript
interface ApplianceModel {
  id: string
  name: string
  description?: string
  deviceType?: string
  manufacturer?: string
  modelNumber?: string
  properties: {
    powerMin: number
    powerMax: number
    hasOnOff: boolean
    annualPowerWh: number
  }
  hasTrainedModel: boolean
  linkedApplianceName?: string
  createdAt: string
  updatedAt: string
}
```

## Support

For questions or issues with the library feature:
1. Check this documentation
2. Review the API documentation
3. Examine the example models
4. Check the browser console for errors
