<script setup lang="ts">
import {
  BadgeCheck,
  Bell,
  ChartNoAxesColumn,
  ChevronRight,
  LayoutDashboard,
  PackageSearch,
  ScanLine,
  Search,
  Settings,
  Store,
  Truck,
  UsersRound,
  Warehouse,
} from 'lucide-vue-next';
import { useAppStore, stationThemes, type StationTheme } from '@/stores/app';

const app = useAppStore();

const businessMenus = [
  { title: '工作台', path: '/workbench', icon: LayoutDashboard, active: true },
  { title: '扫码入库', path: '/inbound', icon: ScanLine },
  { title: '在库包裹', path: '/parcels', icon: PackageSearch },
  { title: '取件核销', path: '/pickup', icon: BadgeCheck },
];

const stationMenus = [
  { title: '货架库位', path: '/shelves', icon: Warehouse },
  { title: '寄件管理', path: '/shipping', icon: Truck, badge: 'P2' },
  { title: '经营统计', path: '/statistics', icon: ChartNoAxesColumn, badge: 'P2' },
  { title: '员工权限', path: '/staff-roles', icon: UsersRound },
  { title: '门店设置', path: '/settings', icon: Settings },
];

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
        <RouterLink
          v-for="item in businessMenus"
          :key="item.path"
          :to="item.path"
          :class="{ on: item.active }"
        >
          <component :is="item.icon" />
          {{ item.title }}
        </RouterLink>

        <div class="grp">网点管理</div>
        <RouterLink v-for="item in stationMenus" :key="item.path" :to="item.path">
          <component :is="item.icon" />
          {{ item.title }}
          <span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </RouterLink>
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
