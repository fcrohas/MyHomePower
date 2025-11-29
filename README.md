# Power Consumption Viewer

A Vue.js application for tagging and analyzing power consumption history from Home Assistant.

## Features

- 📊 **Interactive Power Chart**: Visualize power consumption data with Chart.js
- 🏷️ **Time Range Tagging**: Click and drag on the chart to select time periods and add labels
- 📅 **Day Navigation**: Easily swipe through days to view historical data
- 🔌 **Home Assistant Integration**: Connect directly to your Home Assistant instance via REST API
- 💾 **Local Storage**: Tags are saved locally in your browser
- 📈 **Statistics**: View tag statistics and breakdown by label
- 🧠 **ML Tag Predictor**: Deep learning model to predict power usage tags based on patterns (NEW!)

## What's New: ML Tag Predictor

The app now includes a machine learning feature that learns from your tagged data to predict power usage patterns! 

### Key Capabilities:
- **Train a CNN1D + LSTM model** on your historical tagged data
- **Real-time training progress** with learning curves (loss and accuracy)
- **Make predictions** for the next 10 minutes based on the last 50 minutes of power data
- **View confidence scores** for all possible tags

See [ML_FEATURE.md](ML_FEATURE.md) for detailed documentation.

## Setup

### Prerequisites

- Node.js (v16 or higher)
- A Home Assistant instance with REST API access
- A long-lived access token from Home Assistant

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure the backend (optional):
   - Copy `.env.example` to `.env`
   - Adjust the PORT if needed (default: 3001)

3. Start the backend server:
```bash
npm run dev:server
```

4. In a separate terminal, start the frontend:
```bash
npm run dev
```

Or start both together (Linux/Mac):
```bash
npm run dev:all
```

5. Open your browser to http://localhost:5173

### Architecture

The application uses a **two-tier architecture** to solve CORS issues:

- **Frontend** (Vue.js): Runs on port 5173 (Vite dev server)
- **Backend** (Express): Runs on port 3001 (API proxy)

The backend acts as a proxy between your browser and Home Assistant, avoiding CORS restrictions since it's a server-to-server communication.

## Usage

### Connecting to Home Assistant

1. When you first open the app, you'll see a connection form
2. Enter your Home Assistant details:
   - **Home Assistant URL**: e.g., `http://homeassistant.local:8123`
   - **Access Token**: Your long-lived access token
   - **Power Entity ID**: The entity ID for your power sensor (e.g., `sensor.power_consumption`)
3. Click "Connect"

### Getting a Home Assistant Access Token

1. In Home Assistant, go to your profile (click your username in the bottom left)
2. Scroll down to "Long-Lived Access Tokens"
3. Click "Create Token"
4. Give it a name (e.g., "Power Viewer")
5. Copy the token and paste it into the app

### Tagging Power Consumption

1. **Navigate Days**: Use the "Previous Day" and "Next Day" buttons, or select a date from the date picker
2. **Select Time Range**: Click and drag on the chart to select a time period
3. **Add Label**: 
   - Adjust the start and end times if needed
   - Enter a label (e.g., "Fridge", "Water Heater", "Standby")
   - Click "Add Tag"
4. **View Tags**: All tags for the current day are listed below the chart
5. **Delete Tags**: Click the × button next to any tag to remove it

### Example Use Cases

- **Appliance Identification**: Tag when specific appliances are running
  - `01:00 - 02:30`: Fridge
  - `13:30 - 16:30`: Water Heater
  - `02:30 - 03:30`: Standby
  
- **Activity Tracking**: Identify patterns in your power usage
  - Morning routines
  - Peak usage times
  - Standby consumption periods

### Using the ML Tag Predictor

1. **Save Training Data**: After tagging several days, click "💾 Save Day" to export data to the `data/` folder
2. **Train Model**: Switch to the "🧠 ML Trainer" tab and click "Start Training"
3. **Watch Progress**: Monitor the real-time learning curves showing loss and accuracy
4. **Make Predictions**: Once trained, click "Predict Tag" to test the model
5. **View Results**: See the predicted tag with confidence scores

For detailed ML documentation, see [ML_FEATURE.md](ML_FEATURE.md).

## Technical Details

### Technologies Used

- **Vue 3**: Composition API with `<script setup>`
- **Vite**: Fast build tool and dev server
- **Chart.js**: Interactive charting library
- **date-fns**: Date manipulation and formatting
- **Express**: Node.js backend server
- **TensorFlow.js**: Machine learning library for tag prediction
- **Home Assistant REST API**: For fetching power consumption history (via backend proxy)

### Data Storage

- Connection credentials are stored in `localStorage` (frontend)
- Session management handled by backend server (in-memory)
- Tags are stored in `localStorage` with the key `powerTags`
- Each tag includes:
  - Date
  - Start and end times
  - Label
  - Unique ID

### Project Structure

```
src/
├── components/
│   ├── PowerViewer.vue    # Main container component with tabs
│   ├── PowerChart.vue     # Chart.js integration with selection
│   ├── TagManager.vue     # Tag CRUD and statistics
│   └── MLTrainer.vue      # ML training interface (NEW)
├── services/
│   └── homeassistant.js   # Backend API client
├── App.vue                # Root component
└── main.js                # Application entry point

server/
├── index.js               # Express backend proxy server + ML APIs
└── ml/
    ├── model.js           # CNN1D + LSTM model architecture (NEW)
    └── dataPreprocessing.js # Training data preparation (NEW)

data/                      # Saved training data (NEW)
├── power-data-*.json      # Power consumption data
└── power-tags-*.json      # Tagged segments
```

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory, ready to deploy to any static hosting service.

## Troubleshooting

### Connection Issues

- **Backend not running**: Make sure the backend server is running on port 3001 (`npm run dev:server`)
- **Port conflicts**: If port 3001 is in use, change it in `.env` file
- **Authentication Failed**: Check that your access token is valid and hasn't expired
- **Entity Not Found**: Verify the entity ID exists in your Home Assistant instance
- **CORS Errors**: Should be resolved by the backend proxy. If still occurring, check that you're connecting to `localhost:3001` backend

### No Data Showing

- Check that your power sensor is recording history
- Verify the entity ID is correct
- Make sure the selected date has data

### Tags Not Saving

- Check browser console for errors
- Ensure localStorage is enabled in your browser
- Try clearing your browser cache

## License

MIT

