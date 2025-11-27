<template>
  <div id="app">
    <header>
      <h1>Power Consumption Viewer</h1>
    </header>
    <main>
      <PowerViewer />
    </main>
  </div>
</template>

<script setup>
import PowerViewer from './components/PowerViewer.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  min-height: 100vh;
  background: #f5f5f5;
}

header {
  background: #42b983;
  color: white;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

main {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  main {
    padding: 1rem;
  }
}
</style>
