<style scoped>
</style>
<template>
  <v-container fluid class="lighten-5 fill-height">
    <v-row no-gutters dense>
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
          <v-btn text color="primary" :disabled="hasPrevious" @click="previous()"><v-icon color="black" center>mdi-arrow-left</v-icon></v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-text-field label="Période de" v-bind:value="startTime" type="time"></v-text-field> 
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-text-field label="à" v-bind:value="endTime" type="time"></v-text-field>
      </v-col>
      <v-col cols="12" xs="12" sm="2" md="2" lg="2">
          <v-btn text color="primary" :disabled="hasNext" @click="next()"><v-icon color="black" center>mdi-arrow-right</v-icon></v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-btn text color="primary" @click="loadPoints()">Load</v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-btn text color="primary" @click="savePoints()">Save</v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-btn text color="primary" @click="learn()">Learn</v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-btn text color="primary" @click="validate()">Validate</v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-btn text color="primary" @click="clean()">Clean</v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-btn text color="primary" @click="$refs.tagger.showPointsRange(points, true)">View</v-btn>
      </v-col>
    </v-row>
    <v-row no-gutters dense>
      <v-col cols="12" xs="12" sm="9" md="9" lg="7">
        <GraphTagger ref="tagger" group-by="1m" v-bind:date="date" v-bind:start-time="startTime" v-bind:end-time="endTime" :click-point="pointClicked" :select-points="rangeClicked"/>
      </v-col>
      <v-col cols="12" xs="12" sm="3" md="3" lg="5">
        <v-simple-table dense>
          <template v-slot:default>
            <table>
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th>Tags</th>
                  <th>Power</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-bind:key="index" v-for="(point, index) in paginatedData">
                   <td v-if="point!=undefined">{{formatTime(point.start)}}</td>
                   <td v-if="point!=undefined">{{formatTime(point.end)}}</td>
                   <td><v-text-field dense v-model="point.tags"></v-text-field></td>
                   <td v-if="point!=undefined">{{point.power}} vA</td>
                   <td>
                    <v-icon v-on:click="deletePoints(point)" color="red" center>mdi-trash-can-outline</v-icon>
                   </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <v-btn v-on:click="prevPage" v-bind:depressed="true"><v-icon color="red" center>mdi-arrow-left</v-icon></v-btn>
                  </td>
                  <td>
                    <v-btn v-on:click="nextPage" v-bind:depressed="true"><v-icon color="red" center>mdi-arrow-right</v-icon></v-btn>
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </template>
        </v-simple-table>
      </v-col>
    </v-row>
    <v-snackbar
      v-model="snackbar"
      :bottom="true"
      :color="color"
      :left="false"
      :multi-line="false"
      :right="true"
      :timeout="5000"
      :top="false"
      :vertical="false"
    >
      {{ learningStatus }}
      <v-btn
        dark
        text
        @click="snackbar = false"
      >
        Close
      </v-btn>
    </v-snackbar>
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
  sockets: {
    connect: function () {
     //this.learningStatus = "data";
     //this.snackbar = true;
    },
    customEmit: function (data) {
      if (data != undefined) {
         this.learningStatus = data;
         this.snackbar = true;
      }
    }
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
    },
    pageCount() {
      let l = this.points.length;
      let s = this.size;
      return Math.ceil(l/s);
    },
    paginatedData() {
      const start = this.pageNumber * this.size;
      const end = start + this.size;
      return this.points.slice(start, end);
    }
  },
  methods: {
    nextPage(){
        this.pageNumber++;
    },
    prevPage(){
        this.pageNumber--;
    },
    formatTime(time) {
      const dateTime = new Date(time);
      return dateTime.getHours() + ':' + dateTime.getMinutes();
    },
    getTimeRange() {
      // Format string
      const startDateTime = new Date(this.date);
      let times = this.startTime.split(':');
      startDateTime.setHours(times[0]);
      startDateTime.setMinutes(times[1]);
      startDateTime.setSeconds(times[2]);
      startDateTime.setMilliseconds(0);
      const endDateTime = new Date(this.date);
      times = this.endTime.split(':');
      endDateTime.setHours(times[0]);
      endDateTime.setMinutes(times[1]);
      endDateTime.setSeconds(times[2]);
      endDateTime.setMilliseconds(0);
      return {start: startDateTime.toISOString(), end: endDateTime.toISOString()};
    },
    validate() {
      http.post('/learn/data/valid/power/' + this.date, this.points)
          .then( (response) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.warn('save data', response);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on save', err);
          });
    },
    learn() {
      http.post('/learn/data/learn/power/' + this.date, this.points)
          .then( (response) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.warn('save data', response);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on save', err);
          });
    },
    clean() {
      http.get('/learn/data/power/clean/' + this.date)
          .then( (response) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.warn('clean duplicate data', response);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on clean data', err);
          });
    },
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
      const range = this.getTimeRange();
      const start = new Date(range.start);
      const end = new Date(range.end);
      this.points = [];
      this.pageNumber = 0;
      return new Promise( (resolve, reject) => {
        http.get('/learn/data/power/' + this.date)
          .then( (response) => {
            //this.points = response.data;
            response.data.forEach( d => {
              let exist = false;
              this.points.forEach( f => {
                if (f.start == d.start && f.end == d.end && f.tags == d.tags) {
                  exist = true;
                }
              });
              if (!exist) {
                if (new Date(d.start) >= start && new Date(d.end) <= end) {
                  this.points.push(d);
                }
              }
            });
            resolve(this.points);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on load', err);
            reject(err);
          });
      });
    },
    deletePoints(point) {
      this.points.splice(this.points.indexOf(point), 1);
      http.delete('/learn/data/power/' + this.date, { data: point})
          .then( (response) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.warn('deleted data', response.data);
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on save', err);
          });
    },
    next() {
      let hour = new Number(this.endTime.substr(0, this.endTime.indexOf(':')));
      this.startTime = this.endTime;
      this.endTime = ((hour+2) < 10 ? '0'+(hour+2) : (hour+2)) +':00:00';
      if (this.endTime === '24:00:00') {
        this.endTime = '23:59:59';
      }
      this.loadPoints().then( (points) => {
        this.$refs.tagger.showPointsRange(points, true);
        /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
        console.warn('Loaded and show', points);
      });
    },
    previous() {
      let hour = new Number(this.startTime.substr(0, this.startTime.indexOf(':')));
      this.endTime = this.startTime;
      this.startTime = ((hour-2) < 10 ? '0'+(hour-2) : (hour-2)) +':00:00';
      this.loadPoints().then( (points) => {
        this.$refs.tagger.showPointsRange(points, true);
      });
    },
    pointClicked(point) {
      this.points.push({start: point.time, end: point.time, power: point.power, index: point.index, tags: ""});
    },
    rangeClicked(start, stop) {
      this.points.push({start: start.time, end: stop.time, power: (start.power + stop.power) / 2, startIndex: start.index, stopIndex: stop.index, tags: ""});
    }
  },
  data() {
    return {
      pageNumber: 0,
      size: 5,
      date: '2024-07-01',
      menu: false,
      today: new Date(),
      startTime: '00:00:00',
      endTime: '02:00:00',
      currentTags: {},
      points: [],
      learningStatus: '',
      snackbar: false
    }
  }
}
</script>
