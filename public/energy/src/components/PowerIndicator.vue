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
	<v-row no-gutters>
		<v-col cols="12" xs="12" sm="12" md="6">
			<v-card class="mx-auto" max-width="100%" outlined>
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
		</v-col>
		<v-col cols="12" xs="12" sm="12" md="6">
			<v-card class="mx-auto" max-width="100%" outlined>
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
		</v-col>
	</v-row>
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
			return Math.round(this.heureCreuse * 0.1320 / 10) / 100;
		},
		getTotalHeurePleine: function() {
			return Math.round(this.heurePleine * 0.1710 / 10) / 100;
		}
	},
	mounted() {
		const today = new Date();
		const firstDayOfMonth = today.getFullYear() + '-' + (today.getMonth() + 1) + '-01';
		const currentDay = today.getDate() + 1 < 10 ? '0' + today.getDate() : today.getDate();
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