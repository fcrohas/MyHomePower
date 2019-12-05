<style scoped>
.indicator {
	color: white;
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
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Adresse</b></div><div class="pa-2">{{info.addr}}</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Option tarifaire</b></div><div class="pa-2">{{info.tarifSouscrit}}</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Tarif en cours</b></div><div class="pa-2">{{info.tarifEnCours}}</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Offre souscrite</b></div><div class="pa-2">{{info.offreSouscrite}} KvA</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Intensité max.</b></div><div class="pa-2">{{info.intensiteMax}} A</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Index HC</b></div><div class="pa-2">{{info.indexHeureCreuse}}</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Index HP</b></div><div class="pa-2">{{info.indexHeurePleine}}</div></div>
					<div class='d-flex justify-space-between mb-4'><div class="pa-2"><b>Status compteur</b></div><div class="pa-2">{{info.status}}</div></div>
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
					this.info.addr = response.data.addr;
					this.info.tarifSouscrit = response.data.tarifSouscrit == 'HC..' ? 'Heure creuse' : 'Heure pleine';
					this.info.tarifEnCours = response.data.tarifEnCours == 'HC..' ? 'Heure creuse' : 'Heure pleine';
					this.info.offreSouscrite = Math.floor(response.data.intensiteSouscrit * 220 / 1000);
					this.info.status = response.data.etatCompteur;
					this.info.indexHeureCreuse = response.data.indexHeureCreuse;
					this.info.indexHeurePleine = response.data.indexHeurePleine;
					this.info.intensiteMax = response.data.intensiteMax;

				});
		}
	},
	mounted() {
		this.getInfo();
	},
	data() {
		return {
			info: {
				addr: 'XXXXXXXXXXXXXX',
				tarifSouscrit: 'Néant',
				tarifEnCours: 'Néant',
				offreSouscrite: 0,
				status: 'Inconnu',
				indexHeureCreuse: 0,
				indexHeurePleine: 0,
				intensiteMax: 0
			},
		}
	}
}
</script>