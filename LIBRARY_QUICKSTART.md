# Library Feature - Quick Start Guide

Get started with the Appliance Model Library in minutes!

## 🚀 Quick Setup

### 1. Start the Application

```bash
# Start the server
npm run dev:server

# In another terminal, start the frontend
npm run dev
```

### 2. Navigate to Libraries Tab

1. Open the application in your browser
2. Connect to Home Assistant (if not already connected)
3. Click on the **📚 Libraries** tab

## 📋 Your First Model

### Create a New Model

1. Click **➕ Add New Model**
2. Fill in the basic information:
   - **Name**: "My Coffee Maker"
   - **Description**: "Morning coffee maker used daily"
3. Add technical specs:
   - **Device Type**: Other
   - **Manufacturer**: Keurig
   - **Model Number**: K-Elite
4. Set power properties:
   - **Power Min**: 10 W
   - **Power Max**: 1500 W
   - **Annual Power**: 200000 Wh (200 kWh/year)
   - **Has On/Off States**: ✓ (checked)
5. Click **Create Model**

✅ Your first model is created!

## 💾 Import Sample Models

The application comes with 8 pre-configured sample models:
- Washing Machine
- Dishwasher
- Refrigerator
- Electric Dryer
- Microwave
- Electric Oven
- Air Conditioner
- Water Heater

These are automatically available when you first open the Libraries tab!

## ✅ Validating Model Files

Before importing a model, you can validate its format:

```bash
node validate-model.js path/to/your-model.json
```

The validator checks:
- ✅ Required fields (name, powerMin, powerMax)
- ✅ Data types and ranges
- ✅ Logical consistency (min < max)
- ⚠️ Optional fields and standard values

**Example Output:**
```
🔍 Validating Model File...
File: my-dishwasher.json

✅ name: "Dishwasher - Bosch 800"
✅ properties
   ✅ powerMin: 5 W
   ✅ powerMax: 1800 W
   ✅ hasOnOff: true
   ✅ annualPowerWh: 270000 Wh (270.00 kWh/year)

==================================================
✅ Validation Passed!
   This model file is ready to import.
==================================================
```

## 🔄 Common Tasks

### Export a Model

1. Find the model card
2. Click the **💾** icon
3. File downloads automatically as JSON

### Import a Model

1. Click **📥 Import Model**
2. Select a `.json` file
3. Model appears in your library

### Edit a Model

1. Click the **✏️** icon on a model card
2. Update any fields
3. Click **Update Model**

### Delete a Model

1. Click the **🗑️** icon on a model card
2. Confirm deletion
3. Model is removed

## 🔗 Linking to Trained Models

When you train an ML model for an appliance:

### Automatic Linking (Recommended)

After training a model in the ML Trainer tab, use the API:

```bash
curl -X POST http://localhost:3001/api/library/models/YOUR_MODEL_ID/link \
  -H "Content-Type: application/json" \
  -d '{"applianceName": "washing_machine"}'
```

The library model will now show:
- ✅ **Trained Model** badge
- Link to the appliance name

### Benefits of Linking

- See which appliances have trained models
- Track training status
- Organize models by readiness
- Quick reference for predictions

## 📊 Using Library Data

### Power Thresholds for ML Training

Use library model properties when training:

```javascript
const model = libraryModels.find(m => m.name.includes('Washing Machine'))
const { powerMin, powerMax } = model.properties

// Use these values in ML Trainer configuration
```

### Annual Energy Calculations

Calculate expected yearly costs:

```javascript
const annualKwh = model.properties.annualPowerWh / 1000
const electricityRate = 0.12 // $/kWh
const yearlyCost = annualKwh * electricityRate

console.log(`Estimated yearly cost: $${yearlyCost.toFixed(2)}`)
```

## 🎨 Model Card Features

Each model card displays:

### Header (Purple Gradient)
- Model name
- Action buttons (Edit, Export, Delete)

### Body
- Description
- Technical specifications table
- Power properties grid

### Footer
- Training status badge
- Creation date

## 💡 Pro Tips

### 1. Accurate Power Ranges
Measure actual appliance power consumption for best results:
- Use a smart plug with power monitoring
- Record min/max values during operation
- Update library model with real data

### 2. Descriptive Names
Use clear, searchable names:
- ✅ "Washing Machine - Samsung WF45R6100AW"
- ❌ "WM1" or "Appliance 1"

### 3. Detailed Descriptions
Include usage patterns:
- "Runs 2-3 times per week"
- "Typically uses 'Normal' cycle (45 min)"
- "Power spikes during heating phase"

### 4. Organize by Type
Use consistent device types for easy filtering:
- All washing machines: `washing_machine`
- All dishwashers: `dishwasher`

### 5. Regular Updates
Update annual power consumption based on:
- Actual meter readings
- Seasonal variations
- Usage pattern changes

## 🔧 Troubleshooting

### Model Not Appearing
- Check browser console for errors
- Verify `server/library/models.json` exists
- Restart the server

### Import Failed
- Ensure JSON file is valid
- Check required fields are present:
  - `name`
  - `properties.powerMin`
  - `properties.powerMax`

### Export Not Downloading
- Check browser download settings
- Allow downloads from localhost
- Try a different browser

### Trained Model Badge Not Showing
- Link the model using the API endpoint
- Verify TensorFlow model exists in `server/models/`
- Check appliance name matches directory name

## 📖 Next Steps

1. **Create models** for all your monitored appliances
2. **Export models** to back them up
3. **Train ML models** using the ML Trainer tab
4. **Link trained models** to library entries
5. **Share models** with the community

## 🎯 Best Practices Checklist

- [ ] Use descriptive, searchable names
- [ ] Fill in all technical specifications
- [ ] Set accurate power min/max values
- [ ] Include detailed descriptions
- [ ] Specify correct device type
- [ ] Enable "Has On/Off States" if applicable
- [ ] Add annual power consumption
- [ ] Export models for backup
- [ ] Link trained ML models
- [ ] Update models with actual usage data

## 🌟 Example Workflow

### Complete Model Creation → Training → Linking

```bash
# 1. Create model in UI (Libraries tab)
# - Name: "Washing Machine - My House"
# - Power Min: 10W, Max: 2000W

# 2. Tag power data (Power Tagging tab)
# - Tag washing machine usage periods

# 3. Train model (ML Trainer tab)
# - Select washing machine tags
# - Train model

# 4. Link model (API or script)
curl -X POST http://localhost:3001/api/library/models/1234/link \
  -H "Content-Type: application/json" \
  -d '{"applianceName": "washing_machine"}'

# 5. Verify (Libraries tab)
# - Model card shows "✅ Trained Model"
```

## 🆘 Need Help?

1. Check the [LIBRARY_FEATURE.md](./LIBRARY_FEATURE.md) documentation
2. Review [API_DOCS.md](./API_DOCS.md) for API details
3. Examine sample models in `server/library/models.json`
4. Check browser developer console for errors

## 📚 Additional Resources

- [Full Library Documentation](./LIBRARY_FEATURE.md)
- [ML Trainer Guide](./ML_QUICKSTART.md)
- [API Reference](./API_DOCS.md)
- [Project Summary](./PROJECT_SUMMARY.md)

---

**Ready to manage your appliance models!** 🎉

Start by exploring the sample models, then create your own based on the appliances in your home.
