# Quick Start Guide

## Starting the Application

### Method 1: Start servers separately (Recommended for development)

**Terminal 1 - Backend Server:**
```bash
npm run dev:server
```
This starts the Express backend on `http://localhost:3001`

**Terminal 2 - Frontend:**
```bash
npm run dev
```
This starts the Vue.js frontend on `http://localhost:5173`

### Method 2: Start both together (Linux/Mac only)

```bash
npm run dev:all
```

Note: This runs both in the same terminal. Use Ctrl+C to stop both.

---

## First Time Setup

1. Open your browser to `http://localhost:5173`

2. You'll see the connection form. Enter:
   - **Home Assistant URL**: Your HA instance URL (e.g., `http://192.168.1.100:8123`)
   - **Access Token**: Your long-lived access token from HA
   - **Entity ID**: Your power sensor entity (e.g., `sensor.power_consumption`)

3. Click "Connect"

### Getting Your Home Assistant Access Token

1. Open Home Assistant
2. Click on your profile (bottom left corner)
3. Scroll down to "Long-Lived Access Tokens"
4. Click "Create Token"
5. Give it a name (e.g., "Power Viewer App")
6. Copy the token immediately (you won't see it again!)
7. Paste into the app

---

## Using the Application

### Viewing Power Data

- Use the date picker or arrow buttons to navigate between days
- The chart shows your power consumption for the selected day
- Hover over the chart to see exact values

### Tagging Power Usage

1. **Click and drag** on the chart to select a time range
2. A form will appear with:
   - Start time (auto-filled from selection)
   - End time (auto-filled from selection)
   - Label field (enter a description)

3. Adjust times if needed

4. Enter a label like:
   - "Fridge"
   - "Water Heater"
   - "Standby"
   - "Washing Machine"
   - "Air Conditioner"

5. Click "Add Tag"

### Managing Tags

- All tags for the current day are listed below the chart
- Click the **×** button to delete a tag
- Tags are color-coded on the chart
- View statistics showing tag counts and breakdown by label

### Tag Examples

**Identifying Appliances:**
- `00:30 - 02:00` → "Fridge cycle"
- `06:00 - 07:00` → "Morning coffee + breakfast"
- `13:00 - 16:00` → "Water heater"
- `19:00 - 21:00` → "Cooking + TV"
- `02:00 - 06:00` → "Standby power"

**Pattern Analysis:**
- Tag similar patterns across multiple days
- Identify peak usage times
- Track standby consumption
- Monitor specific appliances

---

## Data Storage

- **Connection settings**: Saved in browser's localStorage
- **Session**: Managed by backend server (temporary)
- **Tags**: Saved in browser's localStorage (persistent)

Your Home Assistant credentials are never stored permanently. Only a session ID is kept for the duration of your browsing session.

---

## Troubleshooting

### Backend won't start
- Check if port 3001 is already in use
- Change port in `.env` file if needed
- Make sure you ran `npm install`

### Frontend won't connect
- Ensure backend is running first
- Check browser console for errors
- Verify you're accessing `http://localhost:5173`

### Can't connect to Home Assistant
- Verify your HA instance is accessible
- Check that your access token is valid
- Ensure the entity ID exists in your HA instance
- Try accessing your HA URL in a browser first

### No data showing
- Check that your power sensor records history
- Verify the entity ID is correct
- Select a date that has data
- Check Home Assistant recorder configuration

### Tags disappear
- Tags are stored per-browser
- Clearing browser data will remove tags
- Consider exporting tags (feature to be added)

---

## Tips & Best Practices

1. **Start tagging gradually**: Begin with major appliances and obvious patterns
2. **Be consistent**: Use the same labels across days for better analysis
3. **Use descriptive labels**: "Kitchen appliances AM" is better than "stuff"
4. **Tag standby periods**: They reveal baseline consumption
5. **Compare days**: Look at weekdays vs. weekends
6. **Monitor changes**: Tag before/after changing habits or upgrading appliances

---

## What's Next?

Future features to consider:
- Export/import tags as JSON
- Tag templates for common appliances
- Multi-day view
- Cost calculation based on tags
- Pattern recognition suggestions
- Mobile touch gestures for selection
- Dark mode

Enjoy analyzing your power consumption! 📊⚡
