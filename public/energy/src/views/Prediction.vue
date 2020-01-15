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
          :return-value.sync="date"
          transition="scale-transition"
          offset-y
          min-width="290px"
        >
          <template v-slot:activator="{ on }">
            <v-text-field
              v-model="date"
              label="Date à analyser"
              prepend-icon="mdi-filter"
              readonly
              v-on="on"
            ></v-text-field>
          </template>
          <v-date-picker v-model="date" first-day-of-week="1" max="todayISO">
            <v-spacer></v-spacer>
            <v-btn text color="primary" @click="menu = false">Cancel</v-btn>
            <v-btn text color="primary" @click="$refs.menu.save(date)">OK</v-btn>
          </v-date-picker>
        </v-menu>
      </v-col>
      <v-col cols="12" xs="12" sm="2" md="2" lg="2">
          <v-btn text color="primary" :disabled="hasPrevious" @click="previous()">Précédent</v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-text-field label="Période de" v-bind:value="startTime" type="time"></v-text-field> 
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-text-field label="à" v-bind:value="endTime" type="time"></v-text-field>
      </v-col>
      <v-col cols="12" xs="12" sm="2" md="2" lg="2">
          <v-btn text color="primary" :disabled="hasNext" @click="next()">Suivant</v-btn>
      </v-col>
      <v-spacer></v-spacer>
    </v-row>
    <v-row no-gutters>
      <v-col cols="12" xs="12" sm="12" md="12" lg="10">
        <GraphTagger group-by="1m" v-bind:date="date" v-bind:start-time="startTime" v-bind:end-time="endTime" :click-point="pointClicked" :select-points="rangeClicked"/>
        <v-btn text color="primary" @click="loadPoints()">Load</v-btn>
        <v-btn text color="primary" @click="savePoints()">Save</v-btn>
        <v-simple-table dense>
          <template v-slot:default>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Power</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                <tr v-bind:key="index" v-for="(point, index) in points">
                   <td>
                    <v-btn v-on:click="deletePoints(point)" v-bind:depressed="true"><v-icon color="red" center>mdi-trash-can-outline</v-icon></v-btn>
                   </td>
                   <td v-if="point!=undefined">
                    <v-chip class="mr-2">
                      <v-icon left>mdi-alarm-check</v-icon>{{point.start}}
                    </v-chip>
                   </td>
                   <td v-if="point!=undefined">
                    <v-chip class="mr-2">
                      <v-icon left>mdi-alarm-check</v-icon>{{point.end}}
                    </v-chip>
                   </td>
                   <td v-if="point!=undefined">{{point.power}} vA</td>
                   <td><v-text-field dense v-model="point.tags"></v-text-field></td>
                </tr>
              </tbody>
            </table>
          </template>
        </v-simple-table>
      </v-col>
    </v-row>
  </v-container>
</template>
<script>
import GraphTagger from '../components/GraphTagger';
import http from 'axios';


export default {
  name: 'prediction',
  components: {
    GraphTagger
  },
  computed: {
    todayISO() {
      return this.today.toISOString();
    },
    hasPrevious() {
      return this.startTime === '00:00:00';
    },
    hasNext() {
      return this.startTime === '22:00:00';
    }
  },
  methods: {
    savePoints() {
      http.post('/learn/data/power/' + this.date, this.points)
          .then( (response) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.warn('save data', response);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on save', err);
          });
    },
    loadPoints() {
      http.get('/learn/data/power/' + this.date)
          .then( (response) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            this.points = response.data;
            console.warn('load data', response);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on load', err);
          });
    },
    deletePoints(point) {
      this.points.splice(this.points.indexOf(point), 1);
    },
    next() {
      let hour = new Number(this.endTime.substr(0, this.endTime.indexOf(':')));
      this.startTime = this.endTime;
      this.endTime = ((hour+2) < 10 ? '0'+(hour+2) : (hour+2)) +':00:00';
      if (this.endTime === '24:00:00') {
        this.endTime = '23:59:59';
      }
    },
    previous() {
      let hour = new Number(this.startTime.substr(0, this.startTime.indexOf(':')));
      this.endTime = this.startTime;
      this.startTime = ((hour-2) < 10 ? '0'+(hour-2) : (hour-2)) +':00:00';
    },
    pointClicked(point) {
      /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
      console.warn('POint data', point);
      if (!this.currentTags.start) {
        this.currentTags.start = point.time;
      } else if (!this.currentTags.end) {
        this.currentTags.end = point.time;
      }
      if (this.currentTags.start && this.currentTags.end) {
        this.points.push({start: this.currentTags.start, end: this.currentTags.end, power: 0, tags: ""});
        this.currentTags = {};
      }
    },
    rangeClicked() {

    }
  },
  data() {
    return {
      date: '2019-12-01',
      menu: false,
      today: new Date(),
      startTime: '00:00:00',
      endTime: '02:00:00',
      currentTags: {},
      points: []
    }
  }
}
</script>
