# Authentication & Settings System

## Overview

The AI Power Viewer now includes a secure login system with persistent settings management.

## Features

### 1. Login System
- Username/password authentication
- Session-based security
- Automatic session verification on page reload
- Logout functionality

### 2. Settings Management
- Settings stored server-side in `settings.json`
- Auto-sync between frontend and backend
- Persistent across sessions
- Available settings:
  - Home Assistant URL
  - Home Assistant Access Token
  - Power Entity ID
  - Auto-connect on login

### 3. Auto-Connect
- Enable "Auto-connect to Home Assistant on startup" in Settings > General
- System will automatically connect to Home Assistant when you login
- No need to manually enter credentials each time

## Setup

### 1. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and set your credentials:

```env
# Authentication - Change these!
APP_USERNAME=your_username
APP_PASSWORD=your_secure_password
```

### 2. First Login

1. Start the application
2. Login with your configured username/password
3. Go to Settings → Home Assistant
4. Enter your Home Assistant connection details
5. Click "Reconnect" to test the connection
6. Enable "Auto-connect to Home Assistant on startup" in General settings

### 3. Subsequent Logins

After initial setup with auto-connect enabled:
1. Login with your credentials
2. The system automatically connects to Home Assistant
3. Data is ready to use immediately

## Security Notes

- Sessions are stored in memory (restart clears all sessions)
- Settings are stored in `settings.json` (excluded from git)
- Never commit `.env` file with real credentials
- Use strong passwords in production
- Consider implementing HTTPS for production deployments

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout and clear session
- `POST /api/auth/verify` - Verify existing session

### Settings
- `GET /api/settings` - Get current settings (requires auth)
- `POST /api/settings` - Update settings (requires auth)

## Default Credentials

**⚠️ Change these immediately in production!**

- Username: `admin`
- Password: `admin`

## Settings File Location

Settings are stored in: `settings.json` (root directory)

Example structure:
```json
{
  "haUrl": "http://homeassistant.local:8123",
  "haToken": "your_long_lived_token",
  "entityId": "sensor.power_consumption",
  "autoConnect": true
}
```

## Troubleshooting

### Can't Login
- Check `.env` file has correct `APP_USERNAME` and `APP_PASSWORD`
- Restart the server after changing `.env`
- Clear browser cache and localStorage

### Auto-Connect Not Working
- Verify settings in Settings → Home Assistant
- Check Home Assistant is reachable
- Review browser console for errors
- Ensure auto-connect is enabled in General settings

### Session Expired
- Sessions are cleared on server restart
- Login again to create a new session
- Enable "Remember me" if implementing persistent sessions
