# MyHomePower Models Repository Structure

This document explains how to structure your MyHomePower Models repository for sharing device models.

## Repository Structure

```
MyHomePower-Models/
├── index.json                          # Master catalog of all models
├── README.md                           # Repository documentation
├── CONTRIBUTING.md                     # Contribution guidelines
└── models/                             # All models organized by type
    ├── air_conditioner/
    │   └── daikin-fba71/
    │       ├── metadata.json           # Model metadata
    │       ├── model.zip               # Trained model files (optional)
    │       └── preview.png             # Preview image (optional)
    ├── washing_machine/
    │   └── samsung-wf45/
    │       ├── metadata.json
    │       └── model.zip
    └── ...
```

## index.json Format

The `index.json` file at the repository root contains the catalog of all available models:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-02-14T10:00:00Z",
  "repository": {
    "name": "Official MyHomePower Models Library",
    "url": "https://github.com/fcrohas/MyHomePower-Models",
    "author": "MyHomePower Community"
  },
  "models": [
    {
      "id": "daikin-fba71-ac-123456",
      "name": "Daikin FBA71 Air Conditioner",
      "deviceType": "air_conditioner",
      "manufacturer": "Daikin",
      "modelNumber": "FBA71",
      "description": "7kW ducted air conditioning unit with high efficiency",
      "properties": {
        "powerMin": 300,
        "powerMax": 4000,
        "hasOnOff": true,
        "annualPowerWh": 2500000
      },
      "metadata": {
        "author": "john_doe",
        "uploadDate": "2026-02-01T12:00:00Z",
        "downloads": 45,
        "version": "1.0.0",
        "trainingInfo": {
          "samples": 10000,
          "days": 30,
          "accuracy": 0.92
        }
      },
      "files": {
        "metadata": "models/air_conditioner/daikin-fba71/metadata.json",
        "model": "models/air_conditioner/daikin-fba71/model.zip",
        "preview": "models/air_conditioner/daikin-fba71/preview.png"
      },
      "visibility": "public",
      "size": 2456789
    }
  ]
}
```

## metadata.json Format

Each model directory should contain a `metadata.json` file with detailed information:

```json
{
  "id": "daikin-fba71-ac-123456",
  "name": "Daikin FBA71 Air Conditioner",
  "deviceType": "air_conditioner",
  "manufacturer": "Daikin",
  "modelNumber": "FBA71",
  "description": "7kW ducted air conditioning unit. Trained on 30 days of data from a residential installation in southern France.",
  "properties": {
    "powerMin": 300,
    "powerMax": 4000,
    "hasOnOff": true,
    "annualPowerWh": 2500000
  },
  "metadata": {
    "author": "john_doe",
    "uploadDate": "2026-02-01T12:00:00Z",
    "version": "1.0.0",
    "trainingInfo": {
      "samples": 10000,
      "days": 30,
      "accuracy": 0.92,
      "trainingDate": "2026-01-15",
      "notes": "Model performs best in moderate climate conditions"
    }
  },
  "visibility": "public"
}
```

## model.zip Format

If your model includes trained ML files, package them in a `model.zip` file containing:

```
model.zip
├── model.json              # TensorFlow.js model architecture
├── weights.bin             # Model weights (or group1-shard*.bin files)
├── metadata.json           # Training metadata (optional)
├── model.onnx              # ONNX format (optional)
└── autoencoder/            # Autoencoder files (optional)
    ├── model.json
    └── weights.bin
```

## Device Types

Use one of these standardized device types:

- `air_conditioner`
- `washing_machine`
- `dishwasher`
- `refrigerator`
- `dryer`
- `oven`
- `microwave`
- `water_heater`
- `other`

## Contributing Your Model

### Using the AI Power Viewer App

1. **Export your model:**
   - Open AI Power Viewer
   - Go to the Libraries tab
   - Click "📤 Share Model"
   - Follow the wizard to export your model

2. **The wizard will generate:**
   - A ZIP file containing all necessary files
   - A README with step-by-step instructions
   - An `index-entry.json` with the entry to add to `index.json`

3. **Submit to repository:**
   - Fork this repository
   - Extract the ZIP into the appropriate model directory
   - Add the model entry to `index.json`
   - Create a Pull Request

### Manual Process

1. **Fork this repository**

2. **Create your model directory:**
   ```bash
   mkdir -p models/{device_type}/{manufacturer}-{model}
   ```

3. **Add your files:**
   - `metadata.json` (required)
   - `model.zip` (optional, if you have trained files)
   - `preview.png` (optional, device image)

4. **Update index.json:**
   Add your model entry to the `models` array

5. **Commit and create PR:**
   ```bash
   git add .
   git commit -m "Add {manufacturer} {model} model"
   git push origin main
   ```

6. **Create Pull Request:**
   Go to GitHub and create a PR to the main repository

## Model Guidelines

### Quality Standards

- **Description:** Provide detailed, accurate descriptions
- **Training Data:** At least 7 days of continuous data recommended
- **Accuracy:** Document model performance metrics
- **Testing:** Test the model on different days before sharing

### Privacy

- Never include personal information in model files
- Don't share data that could identify your location or habits
- Model files should only contain statistical patterns, not raw data

### Licensing

By contributing models, you agree to share them under the MIT License, allowing others to freely use and modify them.

## Getting Help

- **Issues:** Report problems on GitHub Issues
- **Discussions:** Ask questions in GitHub Discussions
- **Documentation:** Check the main AI Power Viewer documentation

## Raw GitHub URLs

When adding this repository to AI Power Viewer:

```
https://raw.githubusercontent.com/fcrohas/MyHomePower-Models/main
```

For custom forks, replace username:
```
https://raw.githubusercontent.com/YOUR_USERNAME/MyHomePower-Models/main
```
