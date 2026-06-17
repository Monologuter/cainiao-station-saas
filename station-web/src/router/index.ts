import { createRouter, createWebHistory } from 'vue-router';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import { getStoredToken } from '@/api/http';
import LoginView from '@/views/LoginView.vue';
import WorkbenchView from '@/views/WorkbenchView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: LoginView,
    },
    {
      path: '/',
      component: DefaultLayout,
      redirect: '/workbench',
      children: [
        {
          path: 'workbench',
          name: 'Workbench',
          component: WorkbenchView,
          meta: { title: '工作台' },
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const token = getStoredToken();
  if (to.path === '/login') {
    return token ? '/workbench' : true;
  }
  if (!token) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    };
  }
  return true;
});
