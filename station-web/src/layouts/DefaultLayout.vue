<script setup lang="ts">
import {
  BadgeCheck,
  Bell,
  Building2,
  ChartNoAxesColumn,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
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
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Component } from 'vue';
import { useAppStore, stationThemes, type StationTheme } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

const app = useAppStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const noticesOpen = ref(false);
const accountOpen = ref(false);
const globalSearch = ref('');
const notices = ref([
  {
    id: 'overdue',
    title: '滞留件待处理',
    body: '当前门店有滞留件需要跟进催取。',
    time: '刚刚',
    unread: true,
    path: '/exceptions',
  },
  {
    id: 'inbound',
    title: '入库通知已发送',
    body: '今日入库通知已通过 mock 短信通道发送。',
    time: '10 分钟前',
    unread: true,
    path: '/parcels',
  },
]);

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
const unreadNoticeCount = computed(() => notices.value.filter((item) => item.unread).length);

function toggleNotices() {
  noticesOpen.value = !noticesOpen.value;
  accountOpen.value = false;
}

function markNoticesRead() {
  notices.value = notices.value.map((item) => ({ ...item, unread: false }));
}

function openNotice(path: string) {
  markNoticesRead();
  noticesOpen.value = false;
  if (route.path !== path) {
    router.push(path);
  }
}

function toggleAccountMenu() {
  accountOpen.value = !accountOpen.value;
  noticesOpen.value = false;
}

function openAccountPath(path: string) {
  accountOpen.value = false;
  if (route.path !== path) {
    router.push(path);
  }
}

function submitGlobalSearch() {
  const keyword = globalSearch.value.trim();
  if (!keyword) {
    return;
  }
  router.push({ path: '/parcels', query: { keyword } });
}

function openStationSettings() {
  if (route.path !== '/settings') {
    router.push('/settings');
  }
}

function logout() {
  accountOpen.value = false;
  auth.logout();
  router.replace('/login');
}
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

      <button
        class="side-foot station-summary"
        type="button"
        aria-label="打开门店设置"
        @click="openStationSettings"
      >
        <span class="dot"></span>
        <div>
          <b>城南综合驿站</b>
          <br />
          <span>门店编号 CN-0731</span>
        </div>
        <em>设置</em>
        <ChevronRight :size="15" />
      </button>
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
          <form class="search top-search" data-testid="global-search-form" @submit.prevent="submitGlobalSearch">
            <Search :size="16" />
            <input
              v-model="globalSearch"
              data-testid="global-search-input"
              aria-label="全局搜索"
              placeholder="取件码 / 手机号 / 运单号"
              @keydown.enter.prevent="submitGlobalSearch"
            />
          </form>
          <div class="notice-wrap">
            <button
              class="ibtn"
              type="button"
              aria-label="通知"
              :aria-expanded="noticesOpen"
              @click="toggleNotices"
            >
              <span v-if="unreadNoticeCount" class="dot"></span>
              <Bell :size="18" />
            </button>
            <section v-if="noticesOpen" class="notice-panel" data-testid="notice-panel">
              <div class="notice-hd">
                <b>站内消息</b>
                <button class="op" type="button" @click="markNoticesRead">全部已读</button>
              </div>
              <button
                v-for="notice in notices"
                :key="notice.id"
                class="notice-item"
                type="button"
                @click="openNotice(notice.path)"
              >
                <span class="notice-dot" :class="{ 'is-read': !notice.unread }"></span>
                <span>
                  <b>{{ notice.title }}</b>
                  <small>{{ notice.body }}</small>
                  <em>{{ notice.time }}</em>
                </span>
              </button>
            </section>
          </div>
          <div class="account-wrap">
            <button
              class="avatar identity-chip"
              type="button"
              aria-label="账号菜单"
              :aria-expanded="accountOpen"
              @click="toggleAccountMenu"
            >
              <i>店</i>
              <b>店长</b>
            </button>
            <section v-if="accountOpen" class="account-panel" data-testid="account-panel">
              <div class="account-card">
                <i>店</i>
                <div>
                  <b>店长</b>
                  <span>城南综合驿站</span>
                </div>
              </div>
              <button class="account-item" type="button" @click="openAccountPath('/staff-roles')">
                <UsersRound :size="16" />
                员工权限
              </button>
              <button class="account-item" type="button" @click="openAccountPath('/settings')">
                <Settings :size="16" />
                门店设置
              </button>
              <button class="account-item danger" type="button" @click="logout">
                <LogOut :size="16" />
                退出登录
              </button>
            </section>
          </div>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>
