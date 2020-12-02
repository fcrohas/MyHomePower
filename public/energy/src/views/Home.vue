<template>
  <div class="home">
    <FloorPlanView/>
  </div>
</template>

<script>
// @ is an alias to /src
import FloorPlanView from '@/components/FloorPlanView.vue'

export default {
  name: 'home',
  components: {
    FloorPlanView
  }
}
</script>
