import { createRouter, createWebHistory } from 'vue-router';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import WorkbenchView from '@/views/WorkbenchView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
