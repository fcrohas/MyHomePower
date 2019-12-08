<style scoped>
</style>
<template>
	<v-card class="mx-auto" max-width="100%" outlined>
		<v-list-item three-line>
			<v-list-item-content>
				<div class="overline mb-4">{{ getTitle }}</div>
				<canvas id="power-chart"></canvas>
			</v-list-item-content>
		</v-list-item>
	</v-card>
</template>

<script>

import Chart from 'chart.js';
import ChartOptions from './chart-data.js';
import http from 'axios';

export default {
	name: 'PowerGraph',
	props: ['mode','groupby','from','to'],
	watch: {
		from() {
			this.refreshData();
		},
		to() {
			this.refreshData();
		},
		mode() {
			this.refreshData();
		}
	},
	computed: {
		getTitle() {
			if (this.from) {
				return 'Moyenne journaliére';
			} else {
				return 'Aujourd\'hui';
			}
		}
	},
	methods: {
		refreshData() {
			if (this.from && this.to) {
				if (this.mode === 'index') {
					this.getIndexAtDate(this.from, this.to);
				} else {
					this.getPowerAtDate(this.from, this.to);
				}
			}
		},
		getIndexAtDate(from, to) {
			this.powerOptions.data.labels = [];
			this.powerOptions.data.datasets[0].label = 'Heure creuse';
			this.powerOptions.data.datasets[0].data = [];
			this.powerOptions.data.datasets[1].label = 'Heure pleine';
			this.powerOptions.data.datasets[1].data = [];
			return http.get(`/store/index/byrange/${from}/${to}/?groupby=${this.groupby}`)
				.then( (response) => {
					response.data.forEach( data => {
						const time = new Date(data.time);
						this.powerOptions.data.labels.push(this.timeToLabel(time));
						this.powerOptions.data.datasets[0].data.push(Math.round(data.HeureCreuse * 0.1320 / 10) / 100);
						this.powerOptions.data.datasets[1].data.push(Math.round(data.HeurePleine * 0.1720 / 10) / 100);
					});
					if (this.myChart) {
						this.myChart.update();
					}
				});
		},
		getPowerAtDate(from, to) {
			this.powerOptions.data.labels = [];
			this.powerOptions.data.datasets[0].label = 'Puissance KvA';
			this.powerOptions.data.datasets[0].data = [];
			this.powerOptions.data.datasets[1].label = '';
			this.powerOptions.data.datasets[1].data = [];
			return http.get(`/store/power/byrange/${from}/${to}/?groupby=${this.groupby}`)
				.then( (response) => {
					response.data.forEach( data => {
						if (data.powerkva) {
							const time = new Date(data.time);
							this.powerOptions.data.labels.push(this.timeToLabel(time));
							this.powerOptions.data.datasets[0].data.push(data.powerkva);
						}
					});
					if (this.myChart) {
						this.myChart.update();
					}
				});
		},
		timeToLabel(time) {
			let formated = '';
			switch(this.groupby.replace(/[0-9]/g,'')) {
				case 'm' : formated = time.getHours() + ' h ' + time.getMinutes() + ' m';
						break;
				case 'h' : formated = time.getHours() + ' h';
						break;
				case 'd' : formated = time.getDate() + '/' + (time.getMonth() + 1);
						break;
			}
			return formated;
		},
		createChart(chartId, chartOptions) {
			const ctx = document.getElementById(chartId);
			this.myChart = new Chart(ctx, {
				type: chartOptions.type,
				data: chartOptions.data,
				options: chartOptions.options,
			});
		}
	},
	mounted() {
		const today = new Date();
		const currentDay = today.getDate() < 10 ? '0' + today.getDate() : today.getDate();
		this.currentDayOfMonth = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + currentDay;
		if (this.mode === 'index') {
			this.getIndexAtDate(`${this.currentDayOfMonth} 00:00:00`,`${this.currentDayOfMonth} 23:59:59`).then( () => {
				this.createChart('power-chart', this.powerOptions);
			});
		} else {
			this.getPowerAtDate(`${this.from} 00:00:00`,`${this.to} 23:59:59`).then( () => {
				this.createChart('power-chart', this.powerOptions);
			});
		}
	},
	data() {
		return {
			powerOptions: ChartOptions,
			powerData: [],
			currentDayOfMonth: ''
		}
	}
}
</script>