# Power Consumption Viewer - Project Summary

## ✅ Completed Implementation

Your Vue.js application for tagging Home Assistant power consumption history is now ready!

### What's Been Built

1. **Frontend (Vue 3 + Vite)**
   - Interactive Chart.js power consumption visualization
   - Click-and-drag time range selection
   - Day navigation (previous/next buttons + date picker)
   - Tag management UI with add/edit/delete
   - Statistics panel showing tag counts and breakdowns
   - Responsive design for mobile and desktop

2. **Backend (Express + Node.js)**
   - RESTful API proxy server
   - Solves CORS issues between localhost and Home Assistant
   - Session management for secure connections
   - Endpoints for connection, history, state, and entities

3. **Integration Features**
   - Home Assistant REST API integration
   - Secure token-based authentication
   - LocalStorage for tags and credentials
   - Real-time data fetching and visualization

### Tech Stack

- **Frontend**: Vue 3, Vite, Chart.js, date-fns
- **Backend**: Express, Node.js, CORS middleware
- **Integration**: Home Assistant REST API
- **Storage**: Browser localStorage (tags), In-memory sessions (backend)

---

## 🚀 Getting Started

### Quick Start

**Option 1: Use the startup script**
```bash
./start.sh
```

**Option 2: Manual start**
```bash
# Terminal 1
npm run dev:server

# Terminal 2  
npm run dev
```

Then open: http://localhost:5173

### First Connection

1. Enter your Home Assistant URL (e.g., `http://192.168.1.100:8123`)
2. Paste your long-lived access token
3. Enter your power sensor entity ID (e.g., `sensor.power_consumption`)
4. Click "Connect"

---

## 📋 Key Features

### Power Visualization
- Line chart showing hourly power consumption
- Hover tooltips with exact values
- Smooth animations and transitions
- Color-coded tagged regions overlay

### Time Range Tagging
- **Click and drag** on chart to select time periods
- Automatic time population from selection
- Manual time adjustment available
- Multiple tags per day supported

### Tag Management
- Add unlimited tags per day
- Each tag has: start time, end time, and label
- Delete tags with confirmation
- Tags persist in browser storage
- Filter by current day

### Statistics
- Total tagged periods count
- Unique labels count
- Breakdown by label with counts
- Visual organization of tag data

### Navigation
- Previous/Next day buttons
- Date picker for jumping to any date
- Current date display
- Smooth day transitions

---

## 📁 Project Structure

```
ai-power-viewer/
├── src/
│   ├── components/
│   │   ├── PowerViewer.vue      # Main container with state management
│   │   ├── PowerChart.vue       # Chart.js with selection logic
│   │   └── TagManager.vue       # Tag CRUD + statistics
│   ├── services/
│   │   └── homeassistant.js     # Backend API client
│   ├── App.vue                  # Root component
│   └── main.js                  # Entry point
├── server/
│   └── index.js                 # Express proxy server
├── .env                         # Environment config
├── .env.example                 # Config template
├── start.sh                     # Startup script
├── QUICKSTART.md                # User guide
├── README.md                    # Documentation
└── package.json                 # Dependencies
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file:
```env
PORT=3001
VITE_API_URL=http://localhost:3001
```

### Ports
- Frontend: `5173` (Vite default)
- Backend: `3001` (configurable)

---

## 💾 Data Storage

### LocalStorage Keys
- `haUrl` - Home Assistant URL
- `haToken` - Access token
- `entityId` - Power sensor entity ID
- `haSessionId` - Current session ID
- `powerTags` - JSON array of all tags

### Tag Structure
```json
{
  "id": 1234567890,
  "date": "2025-11-27",
  "startTime": "13:30",
  "endTime": "16:30",
  "label": "Water Heater"
}
```

---

## 🎯 Use Cases

### Appliance Identification
Tag power spikes to identify which appliances are running:
- Fridge cycles (recurring patterns)
- Water heater schedules
- HVAC operation
- Large appliances (washer, dryer, etc.)

### Consumption Analysis
- Identify standby power consumption
- Track peak usage times
- Compare weekday vs. weekend patterns
- Monitor seasonal changes

### Optimization
- Find opportunities to shift usage
- Identify inefficient appliances
- Validate timer settings
- Measure impact of behavior changes

---

## 🔒 Security Notes

- Credentials stored in browser localStorage only
- Session IDs used for backend communication
- No credentials sent in URLs or logged
- Backend runs locally on your machine
- HTTPS recommended for production deployment

---

## 🐛 Troubleshooting

### Backend Issues
- Ensure port 3001 is available
- Check `npm run dev:server` output for errors
- Verify `.env` file exists

### Frontend Issues
- Clear browser cache and reload
- Check browser console for errors
- Verify backend is running first

### Home Assistant Issues
- Test HA URL in browser first
- Verify token is valid and not expired
- Check entity ID exists in HA
- Ensure HA recorder is enabled for history

---

## 🚀 Future Enhancements

Potential features to add:
- Export/import tags as JSON/CSV
- Tag templates for common appliances
- Multi-day comparison view
- Cost calculations based on electricity rates
- Pattern recognition and suggestions
- Mobile app with touch gestures
- Dark mode theme
- Real-time power monitoring
- Notifications for unusual patterns
- Integration with other smart home platforms

---

## 📚 Documentation

- `README.md` - Full documentation
- `QUICKSTART.md` - User guide
- `.env.example` - Configuration template
- Code comments throughout

---

## ✨ Summary

You now have a fully functional power consumption viewer with:
- ✅ Vue.js frontend with Chart.js visualization
- ✅ Express backend proxy (no CORS issues!)
- ✅ Home Assistant integration
- ✅ Click-and-drag time selection
- ✅ Tag management with labels
- ✅ Day navigation
- ✅ Statistics panel
- ✅ Persistent storage
- ✅ Responsive design

**Both servers are currently running:**
- Backend: http://localhost:3001 ✅
- Frontend: http://localhost:5173 ✅

Open the frontend URL in your browser and start tagging your power consumption!

Enjoy! 📊⚡
