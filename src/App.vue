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
  background: white;
}

header {
  background: #42b983;
  color: white;
  padding: 0.75rem 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

header h1 {
  font-size: 1.25rem;
  font-weight: 600;
}

main {
  padding: 0;
  max-width: 100%;
  margin: 0;
}

@media (max-width: 768px) {
  main {
    padding: 0;
  }
}
</style>
