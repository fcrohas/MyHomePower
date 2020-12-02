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
      <v-col cols="12" xs="1" sm="1" md="2" lg="2">
          <v-btn text color="primary" :disabled="hasPrevious" @click="previous()"><v-icon color="black" center>mdi-arrow-left</v-icon></v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-text-field label="Période de" v-bind:value="startTime" type="time"></v-text-field> 
      </v-col>
      <v-col cols="12" xs="12" sm="1" md="2" lg="1">
        <v-text-field label="à" v-bind:value="endTime" type="time"></v-text-field>
      </v-col>
      <v-col cols="12" xs="1" sm="1" md="2" lg="2">
          <v-btn text color="primary" :disabled="hasNext" @click="next()"><v-icon color="black" center>mdi-arrow-right</v-icon></v-btn>
      </v-col>
      <v-col cols="12" xs="12" sm="2" md="2" lg="2">
          <v-btn text color="primary" @click="analyzeTimeRange()">Predict</v-btn>
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
                  <th></th>
                  <th>Prediction</th>
                  <th>Percent</th>
                </tr>
              </thead>
              <tbody>
                <tr v-bind:key="index" v-for="(point, index) in predictions">
                   <td @click="toggle(point)"><v-icon :disabled="!point.show" v-bind:style="{color:point.color}" center>mdi-circle</v-icon></td>
                   <td>{{point.tags}}</td>
                   <td>{{point.percent}} %</td>
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
    toggle(point) {
      this.points.forEach( p => {
        if (p.tags == point.tags)  {
          p.show = !p.show; 
        }
      });
      this.$refs.tagger.showPointsRange(this.points, true);

    },
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
      return {start: startDateTime.toISOString(), end: endDateTime.toISOString(), startTime : startDateTime, endTime: endDateTime};
    },
    analyzeTimeRange() {
      const timeRange = this.getTimeRange();
      this.predict(timeRange.startTime, timeRange.endTime);
    },
    predict(from, to) {
      http.get('/learn/data/predict/power-devices/' + from.toISOString() + '/' + to.toISOString())
          .then( (response) => {
            const points = [];
            const start = from.valueOf();
            const tagsTable = [];
            let index = 0;
            response.data.forEach( pred => {
              let startIdx = -1;
              pred.mask.forEach( (t,idx) => {
                const value = Number.parseFloat(t).toFixed(2);
                if ((Math.round(value * 100) > 50) && (startIdx==-1)) {
                  startIdx = idx;
                  index = tagsTable.indexOf(pred.name);
                  if (index === -1) {
                    tagsTable.push(pred.name);
                    index = tagsTable.indexOf(pred.name);
                  }
                }
                if ((Math.round(value * 100) < 50) && (startIdx!=-1) && (startIdx!=idx)) {
                  const startDate = new Date(start + startIdx * 60000 + (pred.index * 60000 * pred.mask.length));
                  const endDate = new Date(start + idx * 60000 + (pred.index * 60000 * (pred.mask.length)));
                  points.push({ start: startDate, end: endDate, tags: pred.name, color: this.colorTable[index], percent: pred.percent, show: true});
                  startIdx = -1;
                }
              });
              if ((startIdx != -1)) {
                  const startDate = new Date(start + startIdx * 60000 + (pred.index * 60000 * (pred.mask.length)));
                  const endDate = new Date(start + (pred.mask.length)* 60000 + (pred.index * 60000 * (pred.mask.length)));
                  /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
                  console.warn('startDate', startDate,'end date', endDate);
                  points.push({ start: startDate, end: endDate, tags: pred.name, color: this.colorTable[index], percent: pred.percent, show: true});
                }
            });
            this.predictions = [];
            points.forEach( p =>{
              let found = false;
              this.predictions.forEach(pr => {
                if (pr.tags == p.tags) {
                    pr.percent = Math.round((pr.percent + p.percent) / 2);
                    found = true;
                }
              });
              if (!found) {
                this.predictions.push(p);
              }
              this.predictions;
            });
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.warn('Range predicted', points.length, 'last', points[points.length-1]);
            this.$refs.tagger.showPointsRange(points, true);
            this.points = points;
          }).catch((err) => {
            /*eslint no-console: ["error", { allow: ["warn", "error"] }] */
            console.error('Error on predict', err);
          });
    },
    next() {
      let hour = new Number(this.endTime.substr(0, this.endTime.indexOf(':')));
      this.startTime = this.endTime;
      this.endTime = ((hour+2) < 10 ? '0'+(hour+2) : (hour+2)) +':00:00';
      if (this.endTime === '24:00:00') {
        this.endTime = '23:59:59';
      }
      this.predictions = [];
      this.$refs.tagger.clearPoints();
    },
    previous() {
      let hour = new Number(this.startTime.substr(0, this.startTime.indexOf(':')));
      this.endTime = this.startTime;
      this.startTime = ((hour-2) < 10 ? '0'+(hour-2) : (hour-2)) +':00:00';
      this.predictions = [];
      this.$refs.tagger.clearPoints();
    },
    pointClicked() {
    },
    rangeClicked(start, stop) {
      this.predict(start.time, stop.time);
    }
  },
  data() {
    return {
      pageNumber: 0,
      size: 5,
      date: '2019-12-01',
      menu: false,
      today: new Date(),
      startTime: '00:00:00',
      endTime: '02:00:00',
      points: [],
      predictions: [],
      colorTable: ['indianred','greenyellow','darksalmon','lime','mediumpurple','burlywood','lightblue','lawngreen']
    }
  }
}
</script>
