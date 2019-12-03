<style scoped>
.indicator {
	color: white;
}
br {
	text-decoration: underline;
	width:80%;
}
</style>
<template>
	<v-card class="mx-auto" max-width="100%" outlined>
		<v-list-item three-line>
			<v-list-item-content>
				<div class="overline mb-4">Enedis</div>
				<v-list-item-title class="headline mb-1">Information(s)</v-list-item-title>
				<v-list-item-subtitle>Configuration du compteur</v-list-item-subtitle>
				<v-card-text>
					<p>Adresse: {{info.addr}}</p>
					<p>Option tarifaire: {{info.tarifSouscrit}}</p>
					<p>Tarif en cours: {{info.tarifEnCours}}</p>
					<p>Intensité souscrite: {{Math.round(info.intensiteSouscrit * 230 / 1000)}} KvA</p>
				</v-card-text>
			</v-list-item-content>
		</v-list-item>
	</v-card>
</template>

<script>

import http from 'axios';

export default {
	name: 'LinkyInfo',
	methods: {
		getInfo() {
			http.get('/read/linky')
				.then( (response) => {
					this.info = response.data;
				});
		}
	},
	mounted() {
		this.getInfo();
	},
	data() {
		return {
			info: null,
		}
	}
}
</script>