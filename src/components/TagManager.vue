<template>
  <div class="tag-manager">
    <h2>Power Tags</h2>
    
    <!-- Add Tag Form -->
    <div class="add-tag-form" v-if="selectedRange">
      <h3>Add New Tag</h3>
      <p class="selected-range">
        Selected: {{ formatTime(selectedRange.start) }} - {{ formatTime(selectedRange.end) }}
      </p>
      
      <div class="form-row">
        <div class="form-group">
          <label>Start Time:</label>
          <input 
            v-model="newTag.startTime" 
            type="time" 
            step="60"
          />
        </div>
        
        <div class="form-group">
          <label>End Time:</label>
          <input 
            v-model="newTag.endTime" 
            type="time" 
            step="60"
          />
        </div>
      </div>
      
      <div class="form-group">
        <label>Label:</label>
        <input 
          v-model="newTag.label" 
          type="text" 
          placeholder="e.g., Fridge, Water Heater, Standby"
          @keyup.enter="submitTag"
        />
      </div>
      
      <div class="form-actions">
        <button @click="submitTag" :disabled="!newTag.label">
          Add Tag
        </button>
        <button @click="cancel" class="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
    
    <!-- Tags List -->
    <div class="tags-list">
      <h3>Tagged Periods ({{ filteredTags.length }})</h3>
      
      <div v-if="filteredTags.length === 0" class="empty-state">
        No tags for this day. Select a time range on the chart to add a tag.
      </div>
      
      <div v-else class="tags-container">
        <div 
          v-for="tag in filteredTags" 
          :key="tag.id" 
          class="tag-item"
        >
          <div class="tag-info">
            <span class="tag-time">
              {{ tag.startTime }} - {{ tag.endTime }}
            </span>
            <span class="tag-label">{{ tag.label }}</span>
          </div>
          <button 
            @click="deleteTagHandler(tag.id)" 
            class="btn-delete"
            title="Delete tag"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
    
    <!-- Statistics -->
    <div class="statistics" v-if="filteredTags.length > 0">
      <h3>Statistics</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Total Tagged Periods:</span>
          <span class="stat-value">{{ filteredTags.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Unique Labels:</span>
          <span class="stat-value">{{ uniqueLabels.size }}</span>
        </div>
      </div>
      
      <div class="label-breakdown">
        <h4>By Label:</h4>
        <div v-for="[label, count] in labelCounts" :key="label" class="label-stat">
          <span>{{ label }}</span>
          <span class="count-badge">{{ count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { format } from 'date-fns'

const props = defineProps({
  tags: {
    type: Array,
    default: () => []
  },
  selectedRange: {
    type: Object,
    default: null
  },
  currentDate: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['add-tag', 'delete-tag', 'clear-selection'])

const newTag = ref({
  startTime: '',
  endTime: '',
  label: ''
})

// Filtered tags for current date
const filteredTags = computed(() => {
  return props.tags
    .filter(tag => tag.date === props.currentDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
})

// Statistics
const uniqueLabels = computed(() => {
  return new Set(filteredTags.value.map(t => t.label))
})

const labelCounts = computed(() => {
  const counts = new Map()
  filteredTags.value.forEach(tag => {
    counts.set(tag.label, (counts.get(tag.label) || 0) + 1)
  })
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
})

// Format time for display
const formatTime = (date) => {
  return format(new Date(date), 'HH:mm')
}

// Watch for range selection
watch(() => props.selectedRange, (range) => {
  if (range) {
    newTag.value.startTime = format(new Date(range.start), 'HH:mm')
    newTag.value.endTime = format(new Date(range.end), 'HH:mm')
    newTag.value.label = ''
  }
})

// Submit new tag
const submitTag = () => {
  if (!newTag.value.label.trim()) return
  
  emit('add-tag', {
    startTime: newTag.value.startTime,
    endTime: newTag.value.endTime,
    label: newTag.value.label.trim()
  })
  
  // Reset form
  newTag.value = {
    startTime: '',
    endTime: '',
    label: ''
  }
}

// Cancel tag creation
const cancel = () => {
  newTag.value = {
    startTime: '',
    endTime: '',
    label: ''
  }
  emit('clear-selection')
}

// Delete tag
const deleteTagHandler = (tagId) => {
  if (confirm('Are you sure you want to delete this tag?')) {
    emit('delete-tag', tagId)
  }
}
</script>

<style scoped>
.tag-manager {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
}

.tag-manager h2 {
  margin-bottom: 1.5rem;
  color: #2c3e50;
  font-size: 1.5rem;
}

.tag-manager h3 {
  margin-bottom: 1rem;
  color: #2c3e50;
  font-size: 1.2rem;
}

.tag-manager h4 {
  margin-bottom: 0.75rem;
  color: #555;
  font-size: 1rem;
}

.add-tag-form {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  border: 2px solid #42b983;
}

.selected-range {
  background: #fff;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-weight: 500;
  color: #42b983;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.form-group input:focus {
  outline: none;
  border-color: #42b983;
}

.form-actions {
  display: flex;
  gap: 1rem;
}

.form-actions button {
  flex: 1;
}

.btn-secondary {
  background: #6c757d !important;
}

.btn-secondary:hover {
  background: #5a6268 !important;
}

.tags-list {
  margin-bottom: 2rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #999;
  font-style: italic;
}

.tags-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #42b983;
  transition: transform 0.2s, box-shadow 0.2s;
}

.tag-item:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.tag-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tag-time {
  font-size: 0.9rem;
  color: #666;
  font-family: 'Courier New', monospace;
}

.tag-label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.1rem;
}

.btn-delete {
  width: auto;
  padding: 0.5rem 0.75rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  transition: background 0.3s;
}

.btn-delete:hover {
  background: #c82333;
}

.statistics {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: white;
  border-radius: 6px;
}

.stat-label {
  font-size: 0.9rem;
  color: #666;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: #42b983;
}

.label-breakdown {
  margin-top: 1rem;
}

.label-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: white;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.count-badge {
  background: #42b983;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .form-actions {
    flex-direction: column;
  }
}
</style>
