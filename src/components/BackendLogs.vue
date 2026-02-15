<template>
  <div class="backend-logs">
    <div class="logs-header">
      <div class="header-content">
        <h2>📔 Backend Logs</h2>
        <p class="header-description">Live logs from backend training and data operations</p>
      </div>
      <div class="header-actions">
        <button @click="clearLogs" class="btn btn-secondary">
          <span class="btn-icon">🗑️</span>
          <span>Clear Logs</span>
        </button>
        <label class="auto-scroll-toggle">
          <input type="checkbox" v-model="logsAutoScroll" />
          <span>Auto-scroll</span>
        </label>
      </div>
    </div>

    <div class="logs-container">
      <div class="logs-body" ref="logsBody">
        <div v-if="backendLogs.length === 0" class="no-logs">
          <div class="no-logs-icon">📋</div>
          <p>No logs yet.</p>
          <p class="no-logs-hint">Logs will appear here during training and data preparation operations.</p>
        </div>
        <div v-for="(log, index) in backendLogs" :key="index" class="log-entry" :class="log.type">
          <span class="log-timestamp">{{ log.timestamp }}</span>
          <span class="log-type-badge" :class="log.type">{{ getLogTypeBadge(log.type) }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </div>

    <div class="logs-stats">
      <span class="stat-item">
        <span class="stat-label">Total:</span>
        <span class="stat-value">{{ backendLogs.length }}</span>
      </span>
      <span class="stat-item">
        <span class="stat-label">Errors:</span>
        <span class="stat-value error">{{ errorCount }}</span>
      </span>
      <span class="stat-item">
        <span class="stat-label">Warnings:</span>
        <span class="stat-value warning">{{ warningCount }}</span>
      </span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BackendLogs',
  data() {
    return {
      backendLogs: [],
      logsAutoScroll: true,
      eventSource: null
    }
  },
  computed: {
    errorCount() {
      return this.backendLogs.filter(log => log.type === 'error').length
    },
    warningCount() {
      return this.backendLogs.filter(log => log.type === 'warning').length
    }
  },
  mounted() {
    // Connect to SSE endpoint for live logs
    this.connectToLogStream()
    
    // Listen for log events from other components (like MLTrainer)
    window.addEventListener('backend-log', this.handleLogEvent)
  },
  beforeUnmount() {
    if (this.eventSource) {
      this.eventSource.close()
    }
    window.removeEventListener('backend-log', this.handleLogEvent)
  },
  methods: {
    connectToLogStream() {
      // Try to connect to SSE endpoint if available
      // For now, we'll rely on the event system
      // In the future, this could connect to /api/logs/stream
    },
    
    handleLogEvent(event) {
      const { type, message } = event.detail
      this.addLog(type, message)
    },
    
    addLog(type, message) {
      const timestamp = new Date().toLocaleTimeString()
      this.backendLogs.push({ type, message, timestamp })
      
      // Auto-scroll to bottom if enabled
      if (this.logsAutoScroll) {
        this.$nextTick(() => {
          const logsBody = this.$refs.logsBody
          if (logsBody) {
            logsBody.scrollTop = logsBody.scrollHeight
          }
        })
      }
      
      // Keep only last 1000 logs to prevent memory issues
      if (this.backendLogs.length > 1000) {
        this.backendLogs.shift()
      }
    },
    
    clearLogs() {
      this.backendLogs = []
      this.addLog('info', 'Logs cleared')
    },
    
    getLogTypeBadge(type) {
      const badges = {
        info: 'ℹ️',
        success: '✓',
        error: '✕',
        warning: '⚠',
        epoch: '📊'
      }
      return badges[type] || 'ℹ️'
    }
  }
}
</script>

<style scoped>
.backend-logs {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 25px 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom: 1px solid #333;
}

.header-content h2 {
  margin: 0 0 5px 0;
  font-size: 24px;
  font-weight: 600;
}

.header-description {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

.header-actions {
  display: flex;
  gap: 15px;
  align-items: center;
}

.btn {
  padding: 10px 18px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  backdrop-filter: blur(10px);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.25);
}

.btn-icon {
  font-size: 16px;
}

.auto-scroll-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 14px;
}

.auto-scroll-toggle input[type="checkbox"] {
  cursor: pointer;
}

.logs-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0d0d0d;
}

.logs-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.no-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  text-align: center;
  padding: 40px;
}

.no-logs-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.no-logs p {
  margin: 5px 0;
  font-size: 16px;
}

.no-logs-hint {
  font-size: 13px !important;
  color: #555;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #222;
  align-items: flex-start;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-timestamp {
  color: #666;
  min-width: 90px;
  flex-shrink: 0;
  font-size: 12px;
}

.log-type-badge {
  min-width: 24px;
  flex-shrink: 0;
  text-align: center;
  font-size: 14px;
}

.log-message {
  flex: 1;
  word-break: break-word;
  color: #ccc;
}

.log-entry.info .log-message {
  color: #4a9eff;
}

.log-entry.success .log-message {
  color: #42b983;
}

.log-entry.error .log-message {
  color: #ff5555;
  font-weight: 600;
}

.log-entry.warning .log-message {
  color: #ffa500;
}

.log-entry.epoch .log-message {
  color: #bb86fc;
}

.logs-stats {
  display: flex;
  gap: 30px;
  padding: 15px 30px;
  background: #1a1a1a;
  border-top: 1px solid #333;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.stat-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.stat-label {
  color: #999;
}

.stat-value {
  color: #fff;
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.stat-value.error {
  color: #ff5555;
  background: rgba(255, 85, 85, 0.15);
}

.stat-value.warning {
  color: #ffa500;
  background: rgba(255, 165, 0, 0.15);
}

/* Scrollbar styling */
.logs-body::-webkit-scrollbar {
  width: 10px;
}

.logs-body::-webkit-scrollbar-track {
  background: #0d0d0d;
}

.logs-body::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 5px;
}

.logs-body::-webkit-scrollbar-thumb:hover {
  background: #444;
}

@media (max-width: 768px) {
  .logs-header {
    flex-direction: column;
    gap: 15px;
    align-items: flex-start;
    padding: 20px;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .logs-body {
    font-size: 12px;
    padding: 15px;
  }

  .logs-stats {
    flex-wrap: wrap;
    gap: 15px;
    padding: 15px 20px;
  }
}
</style>
