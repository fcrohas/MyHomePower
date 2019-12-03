<template>
  <v-app>
    <v-navigation-drawer app v-model="drawer" :mini-variant.sync="mini" permanent>
      <v-list-item>
        <v-list-item-avatar>
          Home
        </v-list-item-avatar>

        <v-list-item-title>My Home Energy</v-list-item-title>

        <v-btn icon @click.stop="mini = !mini">
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
      </v-list-item>

      <v-divider></v-divider>

      <v-list dense>
        <v-list-item v-for="item in items" :key="item.title" link>
          <v-list-item-icon>
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-content>
      <v-container class="grey lighten-5 fill-height">
        <v-row no-gutters style="flex-wrap: nowrap;">
          <v-col cols="12" class="flex-grow-0 flex-shrink-0">
            <PowerIndicator/>
          </v-col>
        </v-row>
        <v-row no-gutters style="flex-wrap: nowrap;">
          <v-col cols="7" class="flex-grow-0 flex-shrink-0">
            <PowerGraph/>
          </v-col>
          <v-spacer></v-spacer>
          <v-col cols="4" style="flex-wrap: nowrap;" class="flex-grow-0 flex-shrink-0">
            <LinkyInfo/>
          </v-col>
        </v-row>
      </v-container>
    </v-content>
  </v-app>
</template>

<script>
import LinkyInfo from './components/LinkyInfo';
import PowerIndicator from './components/PowerIndicator';
import PowerGraph from './components/PowerGraph';

export default {
  name: 'App',

  components: {
    PowerIndicator,
    PowerGraph,
    LinkyInfo,
  },
  data () {
    return {
      drawer: true,
      items: [
        { title: 'Home', icon: 'mdi-home-city' },
        { title: 'Dashboard', icon: 'mdi-account' },
        { title: 'History', icon: 'mdi-account-group-outline' },
      ],
      mini: true,
    }
  },
};
</script>
