# Agent Guidelines for AI Power Viewer

This document provides coding guidelines and commands for AI agents working on the MyHomePower/AI Power Viewer codebase.

## Project Overview

Full-stack JavaScript application for energy monitoring and ML-based power disaggregation (NILM):
- **Frontend**: Vue 3 (Composition API) + Vite
- **Backend**: Express.js with TensorFlow.js Node
- **Language**: Pure JavaScript (ES Modules) with JSDoc type annotations
- **No TypeScript, no formal testing framework**

## Build, Test, and Run Commands

### Development
```bash
# Start frontend dev server (port 5173)
npm run dev

# Start backend server (port 3001)
npm run dev:server

# Start both frontend and backend (Linux/Mac)
npm run dev:all
```

### Production
```bash
# Build frontend for production
npm run build

# Preview production build
npm preview

# Start production server
npm run server
```

### Testing
**No formal test framework** - Manual test scripts only:
```bash
# Run ML model tests (manual verification required)
node server/ml/seq2point-test.js
node server/ml/gsp-test-edge-cases.js
node server/ml/test-lapack-simple.js

# Validate model file format
node validate-model.js
```

To test a single manual test file, run: `node <test-file-path>`

## Code Style Guidelines

### 1. File Naming Conventions

- **Vue components**: PascalCase - `PowerViewer.vue`, `MLTrainer.vue`
- **JavaScript modules**: camelCase - `homeassistant.js`, `autoPredictor.js`
- **Test scripts**: kebab-case - `seq2point-test.js`, `gsp-test-edge-cases.js`
- **Data files**: kebab-case - `power-data-*.json`, `power-tags-*.json`

### 2. Import Patterns

Use **ES Modules** with relative imports (no path aliases):

```javascript
// Frontend imports
import { ref, computed, onMounted } from 'vue'
import PowerViewer from './components/PowerViewer.vue'
import { connectToHA } from '../services/homeassistant'

// Backend imports (with .js extensions)
import express from 'express'
import tf from './ml/tf-provider.js'
import { PowerTagPredictor } from './ml/model.js'

// Environment variables (frontend)
const API_URL = import.meta.env.VITE_API_URL || ''
```

**Always include `.js` extensions** for local module imports in backend code.

### 3. Naming Conventions

- **Variables/Functions**: camelCase - `sessionId`, `fetchHistory()`, `connectToHA()`
- **Constants**: UPPER_SNAKE_CASE - `API_BASE_URL`, `MODEL_TYPE`, `MSDC_ARCHITECTURE`
- **Classes**: PascalCase - `PowerTagPredictor`, `RepositoryManager`, `AutoPredictor`
- **API Endpoints**: kebab-case - `/api/ha/connect`, `/api/auto-predictor/start`

### 4. Vue 3 Patterns

Use **Composition API with `<script setup>`** syntax:

```vue
<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// Reactive state
const powerData = ref([])
const isLoading = ref(false)

// Computed properties
const totalPower = computed(() => {
  return powerData.value.reduce((sum, d) => sum + d.power, 0)
})

// Lifecycle hooks
onMounted(async () => {
  await loadData()
})

// Watchers
watch(powerData, (newData) => {
  console.log('Data updated:', newData.length)
})
</script>

<template>
  <div class="container">
    <!-- Template content -->
  </div>
</template>

<style scoped>
/* Component styles */
</style>
```

**Key patterns**:
- Use `ref()` for reactive primitives
- Use `computed()` for derived state
- No Vuex/Pinia - use local component state with props/emits
- Service layer (`src/services/`) for API calls

### 5. Error Handling

Use comprehensive try-catch blocks with descriptive error messages:

```javascript
try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  
  return await response.json()
} catch (error) {
  console.error('❌ Error fetching data:', error)
  // For backend: send structured error response
  res.status(500).json({ 
    error: 'User-friendly message',
    message: error.message 
  })
  throw error // or handle gracefully
}
```

**Error handling rules**:
- Always validate `response.ok` before parsing JSON
- Provide context in error messages
- Log errors with emoji markers (✅ ❌ ⚠️ 🔧 🧠 📊)
- Backend: return structured JSON errors with status codes
- Frontend: show user-friendly error messages

### 6. Type Annotations (JSDoc)

Use JSDoc for function documentation (no TypeScript):

```javascript
/**
 * Connect to Home Assistant via backend proxy
 * @param {string} url - Home Assistant URL
 * @param {string} token - Long-lived access token
 * @param {string} entityId - Entity ID for power sensor
 * @returns {Promise<boolean>} True if connection successful
 */
export async function connectToHA(url, token, entityId) {
  // Implementation
}

/**
 * Repository manager for handling model libraries
 */
class RepositoryManager {
  /**
   * Initialize repository manager
   * @param {Object} config - Configuration object
   * @param {number} config.refreshInterval - Auto-refresh interval in ms
   */
  constructor(config) {
    this.refreshInterval = config.refreshInterval || 86400000
  }
}
```

**JSDoc patterns**:
- Document all exported functions
- Use `@param` with types: `{string}`, `{number}`, `{Array}`, `{Object}`, `{Promise<T>}`
- Use `@returns` to document return types
- Include descriptions for complex parameters

### 7. Backend API Patterns

Express routes follow RESTful conventions:

```javascript
// Authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body
    // Validate and authenticate
    res.json({ sessionId, success: true })
  } catch (error) {
    console.error('❌ Login failed:', error)
    res.status(401).json({ error: 'Authentication failed', message: error.message })
  }
})

// Resource CRUD
app.get('/api/library/models', async (req, res) => { /* List */ })
app.post('/api/library/models', async (req, res) => { /* Create */ })
app.put('/api/library/models/:id', async (req, res) => { /* Update */ })
app.delete('/api/library/models/:id', async (req, res) => { /* Delete */ })
```

**Backend guidelines**:
- Main server file: `server/index.js` (monolithic architecture)
- JSON payloads with 50MB limit for power data
- In-memory session storage (Map objects)
- File-based persistence (JSON files in `data/` directory)
- CORS enabled for cross-origin requests

### 8. Code Organization

**Frontend structure**:
- `src/components/` - Vue components (feature-based)
- `src/services/` - API service layer (abstracts fetch calls)
- `src/config/` - Configuration (API URLs, constants)
- `src/main.js` - Application entry point

**Backend structure**:
- `server/index.js` - Main Express server (all routes)
- `server/managers/` - Business logic managers
- `server/ml/` - Machine learning modules (TensorFlow.js)
- `server/library/` - Model repository data

## Development Workflow

1. **Feature changes**: Update relevant components in `src/components/` and services in `src/services/`
2. **API changes**: Add/modify endpoints in `server/index.js`
3. **ML models**: Update modules in `server/ml/`
4. **Manual testing**: Run manual test scripts for ML validation
5. **Build**: Run `npm run build` to verify production build

## Important Notes

- **Large files**: `server/index.js` is ~5000 lines (monolithic design)
- **No linting**: No ESLint/Prettier config - follow existing code style
- **Extensive logging**: Use emoji markers for log categorization
- **ES Module syntax**: Use `import`/`export`, not `require()`
- **Environment config**: Use `.env` for backend, Vite env vars for frontend
