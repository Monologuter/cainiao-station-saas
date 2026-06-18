import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { getAccessToken } from "@/api/http";
import { useAuthStore } from "@/stores/auth";
import DefaultLayout from "@/layouts/DefaultLayout.vue";

const DATE = "2026年6月18日 周四";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/Login.vue"),
    meta: { public: true },
  },
  {
    path: "/",
    component: DefaultLayout,
    redirect: { name: "overview" },
    children: [
      {
        path: "overview",
        name: "overview",
        component: () => import("@/views/OverviewView.vue"),
        meta: { title: "平台总览", sub: `${DATE} · 营业中` },
      },
      {
        path: "tenants",
        name: "tenants",
        component: () => import("@/views/TenantsView.vue"),
        meta: { title: "租户管理", sub: `${DATE} · 管理租户生命周期与状态` },
      },
      {
        path: "applications",
        name: "applications",
        component: () => import("@/views/ApplicationsView.vue"),
        meta: {
          title: "入驻审核",
          sub: `${DATE} · 审核商户入驻申请并自动开通租户`,
        },
      },
      {
        path: "stores",
        name: "stores",
        component: () => import("@/views/StoresMonitorView.vue"),
        meta: { title: "门店监控", sub: `${DATE} · 巡检跨租户门店健康与异常` },
      },
      {
        path: "billing",
        name: "billing",
        component: () => import("@/views/BillingView.vue"),
        meta: {
          title: "订阅与账单",
          sub: `${DATE} · 管理租户订阅、账单回款与计费周期`,
        },
      },
      {
        path: "plans",
        name: "plans",
        component: () => import("@/views/PlansView.vue"),
        meta: {
          title: "套餐配置",
          sub: `${DATE} · 管理平台订阅套餐与用量加费规则`,
        },
      },
      {
        path: "platform-users",
        name: "platform-users",
        component: () => import("@/views/PlatformUsersView.vue"),
        meta: { title: "平台用户", sub: `${DATE} · 管理平台员工账号与角色` },
      },
      {
        path: "audit",
        name: "audit",
        component: () => import("@/views/AuditView.vue"),
        meta: { title: "操作审计", sub: `${DATE} · 追踪平台与租户关键写操作` },
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("@/views/SystemConfigView.vue"),
        meta: {
          title: "系统配置",
          sub: `${DATE} · 管理参数、字典、渠道与通知模板`,
        },
      },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: { name: "overview" } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const isPublic = to.meta.public === true;
  const hasToken = Boolean(getAccessToken());

  // 已登录访问登录页 → 回到总览。
  if (to.name === "login" && hasToken) {
    return { name: "overview" };
  }

  // 公开页直接放行。
  if (isPublic) return true;

  // 受保护页：无 token 跳登录（带 redirect）。
  if (!hasToken) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  // 有 token 但资料未加载：先拉 /me（失败时 http 拦截器会清 token）。
  const auth = useAuthStore();
  if (!auth.initialized) {
    await auth.loadProfile();
    if (!getAccessToken()) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
  }

  return true;
});

export default router;
