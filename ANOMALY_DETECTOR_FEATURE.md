# Anomaly Detector Feature

## Overview
A new tab has been added to the AI Power Viewer application that uses an autoencoder neural network to detect anomalies in power consumption patterns for specific tags.

## Components Added

### 1. Backend: Autoencoder Model (`server/ml/autoencoder.js`)
- **PowerAutoencoder class**: Implements a 1D convolutional autoencoder
- **Architecture**: 
  - Encoder: Compresses 60-point time series into 8-dimensional latent space
  - Decoder: Reconstructs the original signal from latent representation
  - Uses Conv1D layers with ReLU activation
- **Features**:
  - Train on normal power patterns
  - Detect anomalies based on reconstruction error
  - Configurable sensitivity threshold
  - Model persistence (save/load)

### 2. Backend: API Endpoints (`server/index.js`)
- `GET /api/anomaly/tags` - Get available tags and trained models
- `POST /api/anomaly/tag-predictions` - Get predictions for a specific tag/date
- `POST /api/anomaly/train` - Train autoencoder for a tag using historical data
- `POST /api/anomaly/detect` - Detect anomalies in a tag's power curve

### 3. Frontend: AnomalyDetector Component (`src/components/AnomalyDetector.vue`)
- **Tag Selection**: Dropdown to select tags one by one
- **Training Interface**: 
  - Select 3-10 dates with normal behavior
  - Train autoencoder on those patterns
  - Visual feedback during training
- **Detection Interface**:
  - Select date to analyze
  - Adjustable sensitivity threshold (1.5-4.0)
  - Real-time anomaly detection
- **Visualizations**:
  - Timeline overview showing all windows (normal/anomaly)
  - Anomaly score distribution chart
  - Detailed window comparison (original vs reconstructed curves)
  - Interactive selection for detailed analysis

### 4. Integration (`src/components/PowerViewer.vue`)
- Added "🔬 Anomaly Detector" tab to main navigation
- Passes sessionId prop to component

## How It Works

1. **Training Phase**:
   - User selects a tag (e.g., "washing_machine")
   - Selects 3-7 dates with normal/typical behavior
   - System fetches power data for those dates
   - Extracts power curves where the tag was active
   - Trains autoencoder to reconstruct these normal patterns

2. **Detection Phase**:
   - User selects date to analyze
   - System gets all windows where tag was predicted to be active
   - Autoencoder attempts to reconstruct each power curve
   - High reconstruction error = anomaly (unusual pattern)
   - Results displayed with visual indicators

3. **Anomaly Scoring**:
   - Uses Mean Squared Error (MSE) between original and reconstructed curves
   - Threshold determines sensitivity (higher = fewer false positives)
   - Anomaly score represents deviation from learned patterns

## Usage

1. Connect to Home Assistant (Power Tagging tab)
2. Train ML model (ML Trainer tab)
3. Navigate to "🔬 Anomaly Detector" tab
4. Select a tag from dropdown
5. Train autoencoder:
   - Add 3-7 training dates with normal behavior
   - Click "Train Autoencoder"
   - Wait for training to complete
6. Detect anomalies:
   - Select analysis date
   - Adjust sensitivity if needed
   - Click "Detect Anomalies"
7. Review results:
   - Timeline shows all windows
   - Click any window for detailed analysis
   - Compare original vs reconstructed curves

## Benefits

- **Unsupervised Learning**: No need to label anomalies
- **Tag-Specific**: Each tag has its own model trained on its patterns
- **Flexible**: Works with any predicted tag
- **Visual Feedback**: Clear charts showing normal vs anomalous behavior
- **Adjustable**: Sensitivity can be tuned per analysis

## Technical Notes

- Autoencoder uses 60-point sequences (typical for 10-minute windows)
- Models stored in memory (can be persisted to disk)
- Requires trained ML prediction model to identify tag windows
- Uses TensorFlow.js for neural network operations
