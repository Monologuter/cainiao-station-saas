<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Bell,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-vue-next";
import BillingView from "@/views/BillingView.vue";
import ApplicationsView from "@/views/ApplicationsView.vue";
import AuditView from "@/views/AuditView.vue";
import OverviewView from "@/views/OverviewView.vue";
import PlansView from "@/views/PlansView.vue";
import SystemConfigView from "@/views/SystemConfigView.vue";
import StoresMonitorView from "@/views/StoresMonitorView.vue";

type ViewKey =
  | "overview"
  | "applications"
  | "billing"
  | "plans"
  | "audit"
  | "settings"
  | "stores";

const currentView = ref<ViewKey>("overview");

const navGroups = [
  {
    group: "运营",
    items: [
      { key: "overview", label: "平台总览", icon: LayoutDashboard },
      { key: "tenants", label: "租户管理", icon: Building2 },
      { key: "applications", label: "入驻审核", icon: ClipboardCheck },
      { key: "stores", label: "门店监控", icon: Store },
    ],
  },
  {
    group: "商业化",
    items: [
      { key: "billing", label: "订阅与账单", icon: CreditCard },
      { key: "plans", label: "套餐配置", icon: ShieldCheck },
    ],
  },
  {
    group: "系统",
    items: [
      { key: "platform-users", label: "平台用户", icon: UsersRound },
      { key: "roles", label: "角色权限", icon: ShieldCheck },
      { key: "audit", label: "操作审计", icon: ScrollText },
      { key: "settings", label: "系统配置", icon: Settings },
    ],
  },
];

const viewMeta = computed(() => {
  const meta: Record<ViewKey, { title: string; sub: string; component: any }> = {
    overview: {
      title: "平台总览",
      sub: "2026年6月18日 周四 · 营业中",
      component: OverviewView,
    },
    billing: {
      title: "订阅与账单",
      sub: "2026年6月18日 周四 · 管理租户订阅、账单回款与计费周期",
      component: BillingView,
    },
    applications: {
      title: "入驻审核",
      sub: "2026年6月18日 周四 · 审核商户入驻申请并自动开通租户",
      component: ApplicationsView,
    },
    plans: {
      title: "套餐配置",
      sub: "2026年6月18日 周四 · 管理平台订阅套餐与用量加费规则",
      component: PlansView,
    },
    audit: {
      title: "操作审计",
      sub: "2026年6月18日 周四 · 追踪平台与租户关键写操作",
      component: AuditView,
    },
    stores: {
      title: "门店监控",
      sub: "2026年6月18日 周四 · 巡检跨租户门店健康与异常",
      component: StoresMonitorView,
    },
    settings: {
      title: "系统配置",
      sub: "2026年6月18日 周四 · 管理参数、字典、渠道与通知模板",
      component: SystemConfigView,
    },
  };
  return meta[currentView.value];
});

function selectView(key: string) {
  if (
    key === "overview" ||
    key === "applications" ||
    key === "billing" ||
    key === "plans" ||
    key === "audit" ||
    key === "settings" ||
    key === "stores"
  ) {
    currentView.value = key;
  }
}
</script>

<template>
  <div class="app">
    <aside class="side">
      <div class="brand">
        <div class="logo">驿</div>
        <div>
          <b>菜鸟驿站</b>
          <span>平台运营后台</span>
        </div>
      </div>
      <nav class="nav">
        <template v-for="group in navGroups" :key="group.group">
          <div class="grp">{{ group.group }}</div>
          <a
            v-for="item in group.items"
            :key="item.label"
            :class="{ on: item.key === currentView }"
            @click="selectView(item.key)"
          >
            <component :is="item.icon" />
            {{ item.label }}
          </a>
        </template>
      </nav>
      <div class="side-foot">
        <span class="dot"></span>
        <div>
          <b>平台运营</b>
          <span>多租户 SaaS</span>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="top">
        <div>
          <h1>{{ viewMeta.title }}</h1>
          <div class="sub">{{ viewMeta.sub }}</div>
        </div>
        <div class="top-r">
          <div class="search">租户 / 门店 / 负责人</div>
          <button class="ibtn" type="button">
            <Bell />
            <span class="dot"></span>
          </button>
          <div class="avatar">
            <i>平台</i>
            <b>运营管理员</b>
          </div>
        </div>
      </header>
      <component :is="viewMeta.component" />
    </main>
  </div>
</template>
