<style scoped>
</style>
<template>
  <v-container class="grey lighten-5 fill-height">
    <v-row no-gutters style="flex-wrap: nowrap;">
      <v-col cols="10" sm="10">
        <PowerGraph mode="power" groupby="1d" v-bind:from="dates[0]" v-bind:to="dates[1]"/>
      </v-col>
      <v-col cols="2" sm="2">
        <v-date-picker v-model="dates" range></v-date-picker>
      </v-col>
    </v-row>
  </v-container>
</template>
<script>
import PowerGraph from '../components/PowerGraph';


export default {
  name: 'history',
  components: {
    PowerGraph
  },
  computed: {
    dateRangeText () {
      return this.dates.join(' ~ ')
    },
  },
  data() {
    return {
      dates: ['2019-09-10', '2019-09-20'],
    }
  }
}
</script>