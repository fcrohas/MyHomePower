<style scoped>
.overlay {
	position:absolute;
	pointer-events:none;
}
</style>
<template>
	<v-card class="mx-auto" max-width="100%" outlined>
		<v-list-item three-line>
			<v-list-item-content>
				<div class="overline mb-4">{{ getTitle }}</div>
				<canvas id="overlay" class="overlay"></canvas>
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
	name: 'GraphTagger',
	props: {
		groupBy: String,
		date: String,
		startTime: {
			type: String,
			default: '00:00:00'
		},
		endTime: {
			type: String,
			default: '23:59:59'
		},
		clickPoint: Function,
		selectPoints: Function
	},
	watch: {
		date() {
			this.refreshData();
		},
		endTime() {
			this.refreshData();
		},
		groupBy() {
			this.refreshData();
		}
	},
	computed: {
		getTitle() {
			return 'Taggeur d\'èvenements';
		}
	},
	methods: {
		formatTime(startTime, endTime) {
			// Format string
			const startDateTime = new Date(this.date);
			let times = startTime.split(':');
			startDateTime.setHours(times[0]);
			startDateTime.setMinutes(times[1]);
			startDateTime.setSeconds(times[2]);
			startDateTime.setMilliseconds(0);
			const endDateTime = new Date(this.date);
			times = endTime.split(':');
			endDateTime.setHours(times[0]);
			endDateTime.setMinutes(times[1]);
			endDateTime.setSeconds(times[2]);
			endDateTime.setMilliseconds(0);
			return {start: startDateTime.toISOString(), end: endDateTime.toISOString()};
		},
		refreshData() {
			if (this.startTime && this.endTime) {
				const dateRange = this.formatTime(this.startTime, this.endTime);
				this.getPowerAtDate(`${dateRange.start}`,`${dateRange.end}`);
			}
		},
		getPowerAtDate(from, to) {
			this.powerOptions.data.timeRef = [];
			this.powerOptions.data.labels = [];
			this.powerOptions.data.datasets[0].label = 'Puissance KvA';
			this.powerOptions.data.datasets[0].data = [];
			this.powerOptions.data.datasets[1].label = '';
			this.powerOptions.data.datasets[1].data = [];
			return http.get(`/store/power/byrange/${from}/${to}/?groupby=${this.groupBy}`)
				.then( (response) => {
					response.data.forEach( data => {
						if (data.powerkva) {
							const time = new Date(data.time);
							this.powerOptions.data.timeRef.push(time);
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
			switch(this.groupBy.replace(/[0-9]/g,'')) {
				case 'm' : formated = time.getHours() + ' h ' + time.getMinutes() + ' m';
						break;
				case 'h' : formated = time.getHours() + ' h';
						break;
				case 'd' : formated = time.getDate() + '/' + (time.getMonth() + 1);
						break;
			}
			return formated;
		},
		addOverlay(canvas, chart) {
			this.overlay = document.getElementById('overlay');
			let startIndex = 0;
			this.overlay.width = canvas.width;
			this.overlay.height = canvas.height;
			const selectionContext = this.overlay.getContext('2d');
			const selectionRect = {
				startX: 0,
				w: 0,
				startY: 0
			};
			canvas.addEventListener('pointerdown', evt => {
				const points = chart.getElementsAtEventForMode(evt, 'index', {
					intersect: false
				});
				startIndex = points[0]._index;
				const rect = canvas.getBoundingClientRect();
				selectionRect.startX = evt.clientX - rect.left;
				selectionRect.startY = chart.chartArea.top;
				this.drag = true;
				selectionContext.fillStyle = '#00AA00';
			});
			canvas.addEventListener('pointermove', evt => {
				const rect = canvas.getBoundingClientRect();
				if (this.drag) {
					const rect = canvas.getBoundingClientRect();
					selectionRect.w = (evt.clientX - rect.left) - selectionRect.startX;
					selectionContext.globalAlpha = 0.4;
					selectionContext.clearRect(0, 0, canvas.width, canvas.height);
					selectionContext.fillRect(selectionRect.startX,
						selectionRect.startY + 16,
						selectionRect.w,
						chart.chartArea.bottom - chart.chartArea.top);
				} else {
					selectionContext.clearRect(0, 0, canvas.width, canvas.height);
					let x = evt.clientX - rect.left;
					if (x > chart.chartArea.left) {
						selectionContext.fillRect(x, chart.chartArea.top + 16, 1, chart.chartArea.bottom - chart.chartArea.top);
					}
				}
			});
			canvas.addEventListener('pointerup', evt => {
				const points = chart.getElementsAtEventForMode(evt, 'index', {
					intersect: false
				});
				this.drag = false;
				selectionContext.fillStyle = '#000000';
				const index = points.pop()._index;
				if (startIndex !== index) {
					this.selectPoints({
							time: this.powerOptions.data.timeRef[startIndex], 
							power: Math.round(this.powerOptions.data.datasets[0].data[startIndex])
						}, {
							time: this.powerOptions.data.timeRef[index],
							power: Math.round(this.powerOptions.data.datasets[0].data[index])
						});  
				} else {
					this.clickPoint({
						time: this.powerOptions.data.timeRef[index],
						power: Math.round(this.powerOptions.data.datasets[0].data[index])
					});
				}
			});
		},
		showRange(start, stop) {
			let startMeta = {};
			let stopMeta = {};
			let x1 = 0;
			let x2 = 0;
			// find indexes
			for (let i = 0; i < this.powerOptions.data.labels.length; i++) {
				if (this.powerOptions.data.timeRef[i] == start) {
					startMeta = this.myChart.getDatasetMeta(0);
					x1 = startMeta.data[i]._model.x;
				}
				if (this.powerOptions.data.timeRef[i] == stop) {
					stopMeta = this.myChart.getDatasetMeta(0);
					x2 = stopMeta.data[i]._model.x;
				}
			}
			// draw selection range
			const selectionContext = this.overlay.getContext('2d');
			selectionContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
			selectionContext.fillStyle = '#00AA00';
			selectionContext.globalAlpha = 0.4;
			selectionContext.fillRect(x1,
				this.myChart.chartArea.top + 16,
				x2 - x1,
				this.myChart.chartArea.bottom - this.myChart.chartArea.top);
		},
		handleResize() {
			this.overlay.width = this.canvas.width;
			this.overlay.height = this.canvas.height;
		},
		createChart(chartId, chartOptions) {
			this.canvas = document.getElementById(chartId);
			this.myChart = new Chart(this.canvas, {
				type: chartOptions.type,
				data: chartOptions.data,
				options: chartOptions.options,
			});
			this.addOverlay(this.canvas, this.myChart);
		}
	},
	// bind event handlers to the `handleResize` method (defined below)
	ready: function () {
		window.addEventListener('resize', this.handleResize)
	},
	beforeDestroy: function () {
		window.removeEventListener('resize', this.handleResize)
	},
	mounted() {
		this.powerOptions.type = 'line';
		this.powerOptions.options.legend = { display: false };
		const dateRange = this.formatTime(this.startTime, this.endTime);
		this.getPowerAtDate(`${dateRange.start}`,`${dateRange.end}`).then( () => {
			this.createChart('power-chart', this.powerOptions);
		});
	},
	data() {
		return {
			powerOptions: ChartOptions,
			powerData: [],
			rangeSelection: {},
			currentDayOfMonth: '',
			drag: false
		}
	}
}
</script>
