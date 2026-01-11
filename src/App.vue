<template>
  <div id="app">
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
