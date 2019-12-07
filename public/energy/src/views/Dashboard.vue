<style scoped>
</style>
<template>
  <v-container class="lighten-5 fill-height">
    <v-row no-gutters>
      <v-col cols="12" class="flex-grow-0 flex-shrink-1">
        <PowerIndicator/>
      </v-col>
    </v-row>
    <v-row no-gutters>
      <v-col cols="12" xs="12" sm="12" md="9" class="flex-grow-1 flex-shrink-1">
        <PowerGraph mode="index" groupby="1h"/>
      </v-col>
      <v-spacer></v-spacer>
      <v-col cols="12"  xs="12" sm="12" md="3" class="flex-grow-1 flex-shrink-1">
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