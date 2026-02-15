# Quick Setup Guide for MyHomePower-Models Repository

## Step 1: Create the GitHub Repository

1. Go to https://github.com/new
2. Repository name: **MyHomePower-Models**
3. Description: "Community library of power consumption models for MyHomePower"
4. Set to **Public**
5. Initialize with README: **Yes**
6. Click "Create repository"

## Step 2: Create the Initial Structure

Clone your new repository and add these files:

```bash
git clone https://github.com/fcrohas/MyHomePower-Models.git
cd MyHomePower-Models
```

### Create index.json

Create a file named `index.json` in the root:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-02-14T10:00:00Z",
  "repository": {
    "name": "Official MyHomePower Models Library",
    "url": "https://github.com/fcrohas/MyHomePower-Models",
    "author": "MyHomePower Community"
  },
  "models": []
}
```

### Create directory structure

```bash
mkdir -p models/air_conditioner
mkdir -p models/washing_machine
mkdir -p models/dishwasher
mkdir -p models/refrigerator
mkdir -p models/dryer
mkdir -p models/oven
mkdir -p models/microwave
mkdir -p models/water_heater
mkdir -p models/other
```

### Create README.md

```markdown
# MyHomePower Models Library

Community-contributed power consumption models for AI Power Viewer.

## About

This repository contains trained models for appliance power disaggregation. Users can browse, download, and contribute models through the AI Power Viewer application.

## Structure

- `index.json` - Master catalog of all models
- `models/` - Model files organized by device type

## Contributing

You can contribute models directly from the AI Power Viewer app:

1. Train a model using your power consumption data
2. Go to Libraries tab → Click "Share Model"
3. Follow the wizard to export your model
4. Submit a Pull Request

For detailed instructions, see [CONTRIBUTING.md](CONTRIBUTING.md)

## Using This Repository

Add this repository URL to AI Power Viewer:

```
https://raw.githubusercontent.com/fcrohas/MyHomePower-Models/main
```

## License

Models are shared under MIT License unless otherwise specified.
```

### Commit and Push

```bash
git add .
git commit -m "Initial repository structure"
git push origin main
```

## Step 3: Verify in AI Power Viewer

1. Restart your AI Power Viewer server
2. You should see: "✅ Repository refreshed successfully! Found 0 models."
3. Go to Libraries tab → Click "Browse Online Library"
4. The repository is now connected!

## Adding Your First Model

### Option 1: Use the App (Recommended)

1. In AI Power Viewer, go to Libraries tab
2. Click "📤 Share Model"
3. Follow the wizard
4. Submit the generated files via Pull Request

### Option 2: Manual

See `REPOSITORY_STRUCTURE.md` in your AI Power Viewer project for detailed format specifications.

## Testing the Setup

You can test if your repository is set up correctly by accessing:

```
https://raw.githubusercontent.com/fcrohas/MyHomePower-Models/main/index.json
```

This should return your JSON file (not a 404 error).

## Troubleshooting

### Repository not syncing?

1. Check the URL is correct in the app
2. Verify index.json is in the main branch
3. Make sure the repository is public
4. Try "Manage Repositories" → "Refresh" button

### Still having issues?

The app will work fine with local models only. You can set up the repository later.
