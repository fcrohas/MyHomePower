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
        <v-list-item v-for="item in items" :key="item.title" link :to="item.link">
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
      <router-view></router-view>
    </v-content>
  </v-app>
</template>

<script>
export default {
  name: 'App',

  components: {
  },
  data () {
    return {
      drawer: true,
      items: [
        { title: 'Dashboard', icon: 'mdi-home-city', link: '/' },
        { title: 'History', icon: 'mdi-account', link: '/history' },
        { title: 'Prediction', icon: 'mdi-eye', link: '/prediction' },
        { title: 'Learning', icon: 'mdi-brain', link: '/learning' },
        { title: 'House', icon: 'mdi-home', link: '/home' },
      ],
      mini: true,
    }
  },
};
</script>
