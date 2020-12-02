import Vue from 'vue'
import VueRouter from 'vue-router'
import Prediction from '../views/Prediction.vue'
import Learning from '../views/Learning.vue'
import Dashboard from '../views/Dashboard.vue'
import History from '../views/History.vue'
import Home from '../views/Home.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: Dashboard
  },
  {
    path: '/history',
    name: 'history',
    component: History
  },
  {
    path: '/prediction',
    name: 'prediction',
    component: Prediction
  },
  {
    path: '/learning',
    name: 'learning',
    component: Learning
  },
  {
    path: '/home',
    name: 'home',
    component: Home
  },
  {
    path: '/about',
    name: 'about',
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "about" */ '../views/About.vue')
  }
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

export default router
