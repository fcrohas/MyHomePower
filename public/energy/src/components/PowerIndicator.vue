<style scoped>
</style>
<template>
	<div>
		<span>
			<h3>Heure creuse: {{ heureCreuse / 1000 }} Kwh</h3>
			<h3>Heure pleine: {{ heurePleine / 1000 }} Kwh</h3>
		</span>
		<span>
			<h3>Euros creuse: {{ getTotalHeureCreuse() }} €</h3>
			<h3>Euros pleine: {{ getTotalHeurePleine() }} €</h3>
		</span>
	</div>
</template>

<script>

import http from 'axios';

export default {
	name: 'PowerIndicator',
	methods: {
		getIndexAtDate(from, to) {
			http.get('/store/index/bydate/'+from)
				.then( (response) => {
					this.heureCreuse = response.data[0].indexHeureCreuse;
					this.heurePleine = response.data[0].indexHeurePleine;
					return http.get('/store/index/bydate/'+to);
				}).then( (response) => {
					this.heureCreuse = response.data[0].indexHeureCreuse - this.heureCreuse;
					this.heurePleine = response.data[0].indexHeurePleine - this.heurePleine;
				});
		},
		getTotalHeureCreuse: function() {
			return this.heureCreuse * 0.12 / 1000;
		},
		getTotalHeurePleine: function() {
			return this.heurePleine * 0.15 / 1000;
		}
	},
	mounted() {
		this.getIndexAtDate('2019-11-27', '2019-12-01');
	},
	data() {
		return {
			heureCreuse: 0,
			heurePleine: 0,
		}
	}
}
</script>