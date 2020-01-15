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
		refreshData() {
			if (this.date && this.startTime && this.endTime) {
				this.getPowerAtDate(`${this.date} ${this.startTime}`,`${this.date} ${this.endTime}`);
			}
		},
		getPowerAtDate(from, to) {
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
			let drag = false;
			canvas.addEventListener('pointerdown', evt => {
				const points = chart.getElementsAtEventForMode(evt, 'index', {
					intersect: false
				});
				startIndex = points[0]._index;
				const rect = canvas.getBoundingClientRect();
				selectionRect.startX = evt.clientX - rect.left;
				selectionRect.startY = chart.chartArea.top;
				drag = true;
				// save points[0]._index for filtering
			});
			canvas.addEventListener('pointermove', evt => {
				const rect = canvas.getBoundingClientRect();
				if (drag) {
					const rect = canvas.getBoundingClientRect();
					selectionRect.w = (evt.clientX - rect.left) - selectionRect.startX;
					selectionContext.globalAlpha = 0.5;
					selectionContext.clearRect(0, 0, canvas.width, canvas.height);
					selectionContext.fillRect(selectionRect.startX,
						selectionRect.startY,
						selectionRect.w,
						chart.chartArea.bottom - chart.chartArea.top);
				} else {
					selectionContext.clearRect(0, 0, canvas.width, canvas.height);
					let x = evt.clientX - rect.left;
					if (x > chart.chartArea.left) {
						selectionContext.fillRect(x, chart.chartArea.top, 1, chart.chartArea.bottom - chart.chartArea.top);
					}
				}
			});
			canvas.addEventListener('pointerup', evt => {
				const points = chart.getElementsAtEventForMode(evt, 'index', {
					intersect: false
				});
				drag = false;
				/*eslint no-console: ["error", { allow: ["warn", "error"] }] */
				console.warn('implement filter between ' + this.powerOptions.data.labels[startIndex] + ' and ' + this.powerOptions.data.labels[points[0]._index]);
				this.selectPoints(this.powerOptions.data.labels[startIndex], this.powerOptions.data.labels[points[0]._index]);  
			});
		},
		handleResize() {
			this.overlay.width = this.canvas.width;
			this.overlay.height = this.canvas.height;
		},
		timeClick(event) {
			const chartElem = this.myChart.getElementsAtEventForMode(event, 'index', {
				intersect: false
			});
			const index = chartElem.pop()._index;
			/*eslint no-console: ["error", { allow: ["warn", "error"] }] */
			// console.log('timeClick', )
			this.clickPoint({
				time: this.powerOptions.data.labels[index],
				power: Math.round(this.powerOptions.data.datasets[0].data[index])
			});
		},
		createChart(chartId, chartOptions) {
			this.canvas = document.getElementById(chartId);
			chartOptions.options.onClick = this.timeClick;
			this.myChart = new Chart(this.canvas, {
				type: chartOptions.type,
				data: chartOptions.data,
				options: chartOptions.options,
			});
			// this.addOverlay(this.canvas, this.myChart);
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
		const today = new Date();
		const currentDay = today.getDate() < 10 ? '0' + today.getDate() : today.getDate();
		this.currentDayOfMonth = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + currentDay;
		this.powerOptions.type = 'line';
		this.powerOptions.options.legend = { display: false };
		this.getPowerAtDate(`${this.date} ${this.startTime}`,`${this.date} ${this.endTime}`).then( () => {
			this.createChart('power-chart', this.powerOptions);
		});
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
