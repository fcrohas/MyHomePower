import Vue from 'vue'
import App from './App.vue'
import './registerServiceWorker'
import router from './router'
import vuetify from './plugins/vuetify';
import VueSocketIO from 'vue-socket.io';

Vue.use(new VueSocketIO({
    debug: true,
    connection: 'http://192.168.2.190:3000',
    options: {} //Optional options
}));

Vue.config.productionTip = false

new Vue({
  router,
  vuetify,
  render: h => h(App)
}).$mount('#app')
