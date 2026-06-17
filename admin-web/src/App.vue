<script setup lang="ts">
import {
  Bell,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-vue-next";
import OverviewView from "@/views/OverviewView.vue";

const navGroups = [
  {
    group: "运营",
    items: [
      { label: "平台总览", icon: LayoutDashboard, on: true },
      { label: "租户管理", icon: Building2 },
      { label: "入驻审核", icon: ClipboardCheck },
      { label: "门店监控", icon: Store },
    ],
  },
  {
    group: "商业化",
    items: [
      { label: "订阅与账单", icon: CreditCard },
      { label: "套餐配置", icon: ShieldCheck },
    ],
  },
  {
    group: "系统",
    items: [
      { label: "平台用户", icon: UsersRound },
      { label: "角色权限", icon: ShieldCheck },
      { label: "系统配置", icon: Settings },
    ],
  },
];
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
            :class="{ on: item.on }"
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
          <h1>平台总览</h1>
          <div class="sub">2026年6月18日 周四 · 营业中</div>
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
      <OverviewView />
    </main>
  </div>
</template>
