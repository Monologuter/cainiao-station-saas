<script setup lang="ts">
import {
  BadgeCheck,
  Bell,
  Building2,
  ChartNoAxesColumn,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  PackageSearch,
  ScanLine,
  Search,
  Settings,
  Store,
  TriangleAlert,
  Truck,
  UsersRound,
  Warehouse,
} from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { Component } from 'vue';
import { useAppStore, stationThemes, type StationTheme } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

const app = useAppStore();
const auth = useAuthStore();
const route = useRoute();

const iconMap: Record<string, Component> = {
  LayoutDashboard,
  ScanLine,
  PackageSearch,
  BadgeCheck,
  TriangleAlert,
  Warehouse,
  Truck,
  ChartNoAxesColumn,
  CreditCard,
  UsersRound,
  Settings,
  Store,
  Building2,
};

const menuGroups = computed(() => {
  const groups = auth.menus.map((group) => ({
    ...group,
    items: [...group.items],
  }));
  if (auth.hasPerm('subscription:read') && auth.hasPerm('invoice:read')) {
    const target =
      groups.find((group) => group.group === '网点管理') ?? groups[groups.length - 1];
    if (target && !target.items.some((item) => item.code === 'billing-settings')) {
      target.items.push({
        code: 'billing-settings',
        title: '订阅账单',
        path: '/billing',
        icon: 'CreditCard',
        perm: 'invoice:read',
      });
    }
  }
  return groups;
});

const themeLabels: Record<StationTheme, string> = {
  blue: '清爽蓝',
  dark: '科技暗',
  mint: '柔和薄荷',
};
</script>

<template>
  <div class="app">
    <aside class="side">
      <div class="brand">
        <div class="logo">
          <Store :size="20" />
        </div>
        <div>
          <b>驿小站</b>
          <br />
          <span>城南综合驿站</span>
        </div>
      </div>

      <nav class="nav">
        <template v-for="group in menuGroups" :key="group.group">
          <div class="grp">{{ group.group }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.code"
            :to="item.disabled ? route.fullPath : item.path"
            :class="{ on: route.path === item.path, disabled: item.disabled }"
          >
            <component :is="iconMap[item.icon] ?? LayoutDashboard" />
            {{ item.title }}
            <span v-if="item.badge" class="badge">{{ item.badge }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="side-foot">
        <span class="dot"></span>
        <div>
          <b>城南综合驿站</b>
          <br />
          <span>门店编号 CN-0731</span>
        </div>
        <ChevronRight :size="16" />
      </div>
    </aside>

    <main class="main">
      <header class="top">
        <div>
          <h1>工作台</h1>
          <div class="sub">2026年6月18日 周四 · 营业中</div>
        </div>
        <div class="top-r">
          <div class="seg" aria-label="主题切换">
            <button
              v-for="theme in stationThemes"
              :key="theme"
              type="button"
              :class="{ on: app.theme === theme }"
              @click="app.setTheme(theme)"
            >
              {{ themeLabels[theme] }}
            </button>
          </div>
          <div class="search">
            <Search :size="16" />
            取件码 / 手机号 / 运单号
          </div>
          <button class="ibtn" type="button" aria-label="通知">
            <span class="dot"></span>
            <Bell :size="18" />
          </button>
          <div class="avatar">
            <i>店</i>
            <b>店长</b>
          </div>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>
