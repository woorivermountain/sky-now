import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'weather-about',
      component: () => import('../views/WeatherAboutView.vue'),
    },
    {
      path: '/about',
      redirect: '/',
    },
    {
      path: '/weather',
      name: 'weather-home',
      component: () => import('../views/WeatherHomeView.vue'),
    },
    {
      path: '/weather/:cityId',
      name: 'weather-detail',
      component: () => import('../views/WeatherDetailView.vue'),
      props: true,
    },
    {
      path: '/scene-guide',
      name: 'scene-guide',
      component: () => import('../views/WeatherSceneGuideView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
