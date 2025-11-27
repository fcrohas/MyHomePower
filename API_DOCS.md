# Backend API Documentation

Base URL: `http://localhost:3001`

## Endpoints

### Health Check

**GET** `/api/health`

Check if the API server is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Power Viewer API is running"
}
```

---

### Connect to Home Assistant

**POST** `/api/ha/connect`

Establish a connection to Home Assistant and create a session.

**Request Body:**
```json
{
  "url": "http://homeassistant.local:8123",
  "token": "your_long_lived_access_token",
  "entityId": "sensor.power_consumption"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "1234567890",
  "homeAssistant": "My Home"
}
```

**Error Response:**
```json
{
  "error": "Failed to connect to Home Assistant",
  "message": "Connection refused"
}
```

---

### Fetch History

**POST** `/api/ha/history`

Retrieve power consumption history for a specific time period.

**Request Body:**
```json
{
  "sessionId": "1234567890",
  "entityId": "sensor.power_consumption",
  "startTime": "2025-11-27T00:00:00.000Z",
  "endTime": "2025-11-27T23:59:59.999Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "entity_id": "sensor.power_consumption",
      "state": "150.5",
      "last_changed": "2025-11-27T00:15:00.000Z",
      "attributes": {
        "unit_of_measurement": "W",
        "friendly_name": "Power Consumption"
      }
    }
  ]
}
```

**Error Responses:**
```json
{
  "error": "Invalid session. Please reconnect."
}
```

```json
{
  "error": "Failed to fetch history",
  "message": "Entity not found"
}
```

---

### Get Entity State

**POST** `/api/ha/state`

Get the current state of a specific entity.

**Request Body:**
```json
{
  "sessionId": "1234567890",
  "entityId": "sensor.power_consumption"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entity_id": "sensor.power_consumption",
    "state": "245.3",
    "last_changed": "2025-11-27T10:30:00.000Z",
    "attributes": {
      "unit_of_measurement": "W",
      "friendly_name": "Power Consumption"
    }
  }
}
```

---

### List All Entities

**POST** `/api/ha/entities`

Get a list of all entities from Home Assistant.

**Request Body:**
```json
{
  "sessionId": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "entity_id": "sensor.power_consumption",
      "state": "245.3",
      "attributes": {
        "unit_of_measurement": "W",
        "friendly_name": "Power Consumption"
      }
    },
    {
      "entity_id": "sensor.temperature",
      "state": "22.5",
      "attributes": {
        "unit_of_measurement": "°C",
        "friendly_name": "Temperature"
      }
    }
  ]
}
```

---

### Disconnect

**POST** `/api/ha/disconnect`

Terminate the session and clear connection data.

**Request Body:**
```json
{
  "sessionId": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Disconnected"
}
```

---

## Session Management

- Sessions are stored in-memory on the backend server
- Each successful connection generates a unique `sessionId`
- The `sessionId` must be included in all subsequent requests
- Sessions are cleared when the server restarts
- Sessions can be manually cleared via the disconnect endpoint

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (missing parameters)
- `401` - Unauthorized (invalid session)
- `500` - Internal Server Error (HA connection issues, etc.)

Error responses follow this format:
```json
{
  "error": "Brief error description",
  "message": "Detailed error message"
}
```

---

## CORS

The backend has CORS enabled for all origins in development. For production, consider restricting CORS to specific origins:

```javascript
app.use(cors({
  origin: 'https://your-production-domain.com'
}))
```

---

## Security Considerations

1. **Sessions**: Currently stored in-memory. For production, use Redis or similar
2. **Tokens**: Never logged or exposed in responses
3. **Rate Limiting**: Consider adding rate limiting for production
4. **HTTPS**: Use HTTPS in production for encrypted communication
5. **Authentication**: Consider adding user authentication layer
6. **Validation**: All inputs should be validated and sanitized

---

## Testing with curl

### Test Connection
```bash
curl -X POST http://localhost:3001/api/ha/connect \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://homeassistant.local:8123",
    "token": "your_token_here",
    "entityId": "sensor.power_consumption"
  }'
```

### Fetch History
```bash
curl -X POST http://localhost:3001/api/ha/history \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your_session_id",
    "entityId": "sensor.power_consumption",
    "startTime": "2025-11-27T00:00:00.000Z",
    "endTime": "2025-11-27T23:59:59.999Z"
  }'
```

---

## Development

To modify the backend:

1. Edit `server/index.js`
2. Restart the server: `npm run dev:server`
3. Changes require manual restart (no hot reload)

Consider using `nodemon` for auto-restart during development:

```bash
npm install --save-dev nodemon
```

Update `package.json`:
```json
"dev:server": "nodemon server/index.js"
```
