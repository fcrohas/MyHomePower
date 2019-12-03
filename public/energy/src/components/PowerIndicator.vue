<style scoped>
p,span {
	display: inline-block;
	margin: 0px 5px;
}
.indicator {
	color: white;
}
</style>
<template>
	<p>
		<span>
			<v-card class="mx-auto" max-width="344" outlined>
				<v-list-item three-line>
					<v-list-item-content>
						<div class="overline mb-4">Ce mois</div>
						<v-list-item-title class="headline mb-1">Puissance</v-list-item-title>
						<v-list-item-subtitle>Consonmation en HC / HP</v-list-item-subtitle>
					</v-list-item-content>
					<v-list-item-avatar tile size="80" color="blue" class="indicator">
						{{ Math.round(heureCreuse / 1000) }} Kwh
						<br>----------<br>
						{{ Math.round(heurePleine / 1000) }} Kwh
					</v-list-item-avatar>
				</v-list-item>
			</v-card>
		</span>
		<span>
			<v-card class="mx-auto" max-width="344" outlined>
				<v-list-item three-line>
					<v-list-item-content>
						<div class="overline mb-4">Ce mois</div>
						<v-list-item-title class="headline mb-1">Coût</v-list-item-title>
						<v-list-item-subtitle>Prix HC / HP</v-list-item-subtitle>
					</v-list-item-content>
					<v-list-item-avatar tile size="80" color="blue" class="indicator">
						{{ getTotalHeureCreuse }} €
						<br>----------<br>
						{{ getTotalHeurePleine }} €
					</v-list-item-avatar>
				</v-list-item>
			</v-card>
		</span>
	</p>
</template>

<script>

import http from 'axios';

export default {
	name: 'PowerIndicator',
	methods: {
		getIndexAtDate(from, to) {
			let minHeureCreuse = 0;
			let minHeurePleine = 0;
			http.get('/store/index/bydate/'+from)
				.then( (response) => {
					minHeureCreuse = response.data[0].indexHeureCreuse;
					minHeurePleine = response.data[0].indexHeurePleine;
					return http.get('/store/index/bydate/'+to);
				}).then( (response) => {
					this.heureCreuse = response.data[0].indexHeureCreuse - minHeureCreuse;
					this.heurePleine = response.data[0].indexHeurePleine - minHeurePleine;
				});
		}
	},
	computed: {
		getTotalHeureCreuse: function() {
			return Math.round(this.heureCreuse * 0.1228 / 10) / 100;
		},
		getTotalHeurePleine: function() {
			return Math.round(this.heurePleine * 0.1579 / 10) / 100;
		}
	},
	mounted() {
		const today = new Date();
		const firstDayOfMonth = today.getFullYear() + '-' + (today.getMonth() + 1) + '-01';
		const currentDay = today.getDay() + 1 < 10 ? '0' + (today.getDay() + 1) : (today.getDay() + 1);
		const currentDayOfMonth = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + currentDay;
		this.getIndexAtDate(firstDayOfMonth, currentDayOfMonth);
	},
	data() {
		return {
			heureCreuse: 0,
			heurePleine: 0,
		}
	}
}
</script>