<template>
  <v-container>
    <v-layout
      text-center
      wrap
    >
      <v-flex mb-12>
        <FloorPlan ref="plan"></FloorPlan>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
/* eslint-disable no-console */

import FloorPlan from '../assets/floorplan.svg';

export default {
  name: 'FloorPlanView',
  components: {
    FloorPlan,
  },
  data: () => ({
  }),
  mounted() {
    // no-console
    console.log(this.$refs.plan);
    let g_tags = this.$refs.plan.getElementsByTagName('path')
    g_tags.forEach(el => {
        console.log(el.getAttribute('id'));
        if(el.getAttribute('id') && el.getAttribute('id').indexOf('salon') !== -1) {
            el.setAttribute('fill', '#eebb99')
            console.log(el);
        }
    })
  },
  computed: {
    salonActivated() {
      return 'blue'
    }
  }
};
</script>
