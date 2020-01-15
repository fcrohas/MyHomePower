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
	<v-container>
		<v-card class="mx-auto" max-width="100%" outlined v-if="mode==='power'">
			<v-list-item three-line>
				<v-list-item-content>
					<div class="overline mb-4">Ce mois</div>
					<v-list-item-title class="headline mb-1">Puissance</v-list-item-title>
					<v-list-item-subtitle>Conso. en Kwh pour HC / HP</v-list-item-subtitle>
				</v-list-item-content>
				<v-list-item-avatar tile size="80" color="blue" class="indicator">
					{{ Math.round(heureCreuse / 1000) }} Kwh
					<br>----------<br>
					{{ Math.round(heurePleine / 1000) }} Kwh
				</v-list-item-avatar>
			</v-list-item>
		</v-card>
		<v-card class="mx-auto" max-width="100%" outlined v-if="mode==='index'">
			<v-list-item three-line>
				<v-list-item-content>
					<div class="overline mb-4">Ce mois</div>
					<v-list-item-title class="headline mb-1">Coût</v-list-item-title>
					<v-list-item-subtitle>Prix pour HC / HP</v-list-item-subtitle>
				</v-list-item-content>
				<v-list-item-avatar tile size="80" color="blue" class="indicator">
					{{ getTotalHeureCreuse }} €
					<br>----------<br>
					{{ getTotalHeurePleine }} €
				</v-list-item-avatar>
			</v-list-item>
		</v-card>
	</v-container>
</template>

<script>

import http from 'axios';

export default {
	name: 'PowerIndicator',
	props: ['mode'],
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
			return Math.round(this.heureCreuse * 0.1320 / 10) / 100;
		},
		getTotalHeurePleine: function() {
			return Math.round(this.heurePleine * 0.1710 / 10) / 100;
		}
	},
	mounted() {
		const today = new Date();
		today.setHours(0);
		today.setMinutes(0);
		today.setSeconds(0);
		today.setMilliseconds(0);
		const currentDayOfMonth = today.toISOString();
		today.setDate(1);
		const firstDayOfMonth = today.toISOString();
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
