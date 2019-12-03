<style scoped>
</style>
<template>
	<v-card class="mx-auto" max-width="100%" outlined>
		<v-list-item three-line>
			<v-list-item-content>
				<div class="overline mb-4">Aujourd'hui</div>
				<v-list-item-subtitle>Coût journalier de {{totalJour}} €</v-list-item-subtitle>
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
	methods: {
		getIndexAtDate(from, to) {
			return http.get(`/store/power/byrange/${from}/${to}`)
				.then( (response) => {
					response.data.forEach( data => {
						const time = new Date(data.time);
						this.powerOptions.data.labels.push(time.getHours() + ' h');
						this.powerOptions.data.datasets[0].data.push(Math.round(data.HeureCreuse * 100) / 100);
						this.powerOptions.data.datasets[1].data.push(Math.round(data.HeurePleine * 100) / 100);
						this.totalJour += Math.round(data.HeureCreuse * 100) / 100 + Math.round(data.HeurePleine * 100) / 100;
					});
					this.totalJour = Math.round(this.totalJour * 100) / 100;
				});
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
		const currentDay = today.getDay() + 1 < 10 ? '0' + (today.getDay() + 1) : (today.getDay() + 1);
		const currentDayOfMonth = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + currentDay;
		this.getIndexAtDate(`${currentDayOfMonth} 00:00:00`,`${currentDayOfMonth} 23:59:59`).then( () => {
			this.createChart('power-chart', this.powerOptions);
		});
	},
	data() {
		return {
			powerOptions: ChartOptions,
			powerData: [],
			totalJour: 0.0
		}
	}
}
</script>