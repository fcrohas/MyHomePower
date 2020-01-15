<style scoped>
.indicator {
	color: white;
}
</style>
<template>
	<v-container>
		<v-card class="mx-auto" max-width="100%" outlined>
			<v-list-item three-line>
				<v-list-item-content>
					<div class="overline mb-4">Enedis</div>
					<v-list-item-title class="headline mb-1">Information(s)</v-list-item-title>
					<v-list-item-subtitle>Configuration du compteur</v-list-item-subtitle>
					<v-card-text>
						<v-text-field label="Adresse" outlined dense readonly v-model="info.addr" />
						<v-text-field label="Option tarifaire" outlined dense readonly v-model="info.tarifSouscrit" />
						<v-text-field label="Tarif en cours" outlined dense readonly v-model="info.tarifEnCours" />
						<v-text-field label="Offre souscrite (KvA)" outlined dense readonly v-model="info.offreSouscrite" />
						<v-text-field label="Intensité max. (A)" outlined dense readonly v-model="info.intensiteMax" />
						<v-text-field label="Index heure creuse" outlined dense readonly v-model="info.indexHeureCreuse" />
						<v-text-field label="Index heure pleine" outlined dense readonly v-model="info.indexHeurePleine" />
						<v-text-field label="status compteur" outlined dense readonly v-model="info.status" />
					</v-card-text>
				</v-list-item-content>
			</v-list-item>
		</v-card>
	</v-container>
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