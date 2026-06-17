import { createRouter, createWebHistory } from 'vue-router';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import { getStoredToken } from '@/api/http';
import { availableRoutes } from '@/constants/routes';
import { useAuthStore } from '@/stores/auth';
import LoginView from '@/views/LoginView.vue';
import OnboardingApplyView from '@/views/OnboardingApplyView.vue';
import WorkbenchView from '@/views/WorkbenchView.vue';

const dynamicRouteNames = new Set<string>();
const publicRoutePaths = new Set(['/login', '/onboarding/apply']);

export function isPublicRoutePath(path: string) {
  return publicRoutePaths.has(path);
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: LoginView,
    },
    {
      path: '/onboarding/apply',
      name: 'OnboardingApply',
      component: OnboardingApplyView,
      meta: { public: true },
    },
    {
      path: '/',
      name: 'Root',
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

export function addDynamicRoutes(perms: string[]) {
  for (const route of availableRoutes(perms)) {
    if (router.hasRoute(route.name)) {
      continue;
    }
    router.addRoute('Root', {
      path: route.path,
      name: route.name,
      component: route.component,
      meta: { title: route.title, perm: route.perm },
    });
    dynamicRouteNames.add(route.name);
  }
}

export function resetDynamicRoutes() {
  for (const name of dynamicRouteNames) {
    if (router.hasRoute(name)) {
      router.removeRoute(name);
    }
  }
  dynamicRouteNames.clear();
}

router.beforeEach(async (to) => {
  const token = getStoredToken();
  if (to.path === '/login') {
    return token ? '/workbench' : true;
  }
  if (isPublicRoutePath(to.path)) {
    return true;
  }
  if (!token) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    };
  }

  const auth = useAuthStore();
  if (!auth.routesReady) {
    try {
      await auth.loadProfile();
      addDynamicRoutes(auth.perms);
      auth.routesReady = true;
      return { ...to, replace: true };
    } catch {
      auth.logout();
      resetDynamicRoutes();
      return {
        path: '/login',
        query: { redirect: to.fullPath },
      };
    }
  }

  if (
    typeof to.meta.perm === 'string' &&
    !auth.hasPerm(to.meta.perm)
  ) {
    return '/workbench';
  }

  if (
    Array.isArray(to.meta.perm) &&
    !to.meta.perm.every((perm) => auth.hasPerm(String(perm)))
  ) {
    return '/workbench';
  }

  return true;
});
