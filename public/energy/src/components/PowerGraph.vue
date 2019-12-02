<style scoped>
</style>
<template>
	<canvas id="power-chart"></canvas>
</template>

<script>

import Chart from 'chart.js';
import planetChartData from './chart-data.js';

export default {
	name: 'PowerGraph',
	methods: {
		createChart(chartId, chartData) {
			const ctx = document.getElementById(chartId);
			this.myChart = new Chart(ctx, {
				type: chartData.type,
				data: chartData.data,
				options: chartData.options,
			});
		}
	},
	mounted() {
		this.createChart('power-chart', this.planetChartData);
	},
	data() {
		return {
			planetChartData: planetChartData,
		}
	}
}
</script>