<style scoped>
</style>
<template>
  <v-container class="lighten-5 fill-height">
    <v-row no-gutters>
      <v-col cols="12" xs="12" sm="5" md="3" lg="3">
          <v-menu
          ref="menu"
          v-model="menu"
          :close-on-content-click="false"
          :return-value.sync="dates"
          transition="scale-transition"
          offset-y
          min-width="290px"
        >
          <template v-slot:activator="{ on }">
            <v-text-field
              v-model="dates"
              label="Plage de date"
              prepend-icon="mdi-filter"
              readonly
              v-on="on"
            ></v-text-field>
          </template>
          <v-date-picker v-model="dates" range first-day-of-week="1" max="todayISO">
            <v-spacer></v-spacer>
            <v-btn text color="primary" @click="menu = false">Cancel</v-btn>
            <v-btn text color="primary" @click="$refs.menu.save(dates)">OK</v-btn>
          </v-date-picker>
        </v-menu>
      </v-col>
      <v-spacer></v-spacer>
      <v-col cols="12" xs="12" sm="4" md="3" lg="3">
        <v-select
          :items="modes"
          v-model="mode"
          label="Type"
        ></v-select>
      </v-col>
      <v-spacer></v-spacer>
    </v-row>
    <v-row no-gutters>
      <v-col cols="12" xs="12" sm="12" md="12" lg="10">
        <PowerGraph v-bind:mode="mode" groupby="1d" v-bind:from="dates[0]" v-bind:to="dates[1]"/>
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
    todayISO() {
      return this.today.toISOString();
    }
  },
  data() {
    return {
      dates: ['2019-12-01', '2019-12-06'],
      modes: ['power', 'index'],
      mode: 'index',
      menu: false,
      today: new Date()
    }
  }
}
</script>