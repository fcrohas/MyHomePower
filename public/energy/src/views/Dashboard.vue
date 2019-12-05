<style scoped>
</style>
<template>
  <v-container class="grey lighten-5 fill-height">
    <v-row no-gutters style="flex-wrap: nowrap;">
      <v-col cols="12" class="flex-grow-0 flex-shrink-0">
        <PowerIndicator/>
      </v-col>
    </v-row>
    <v-row no-gutters style="flex-wrap: nowrap;">
      <v-col cols="9" class="flex-grow-0 flex-shrink-0">
        <PowerGraph mode="index" groupby="1h"/>
      </v-col>
      <v-spacer></v-spacer>
      <v-col cols="2" style="flex-wrap: nowrap;" class="flex-grow-0 flex-shrink-0">
        <LinkyInfo/>
      </v-col>
    </v-row>
  </v-container>
</template>
<script>
import LinkyInfo from '../components/LinkyInfo';
import PowerIndicator from '../components/PowerIndicator';
import PowerGraph from '../components/PowerGraph';


export default {
  name: 'dashboard',
  components: {
    LinkyInfo,
    PowerIndicator,
    PowerGraph
  }
}
</script>