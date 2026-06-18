<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Bell,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-vue-next";
import { ElMessage } from "element-plus";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const navGroups = [
  {
    group: "运营",
    items: [
      { name: "overview", label: "平台总览", icon: LayoutDashboard },
      { name: "tenants", label: "租户管理", icon: Building2 },
      { name: "applications", label: "入驻审核", icon: ClipboardCheck },
      { name: "stores", label: "门店监控", icon: Store },
    ],
  },
  {
    group: "商业化",
    items: [
      { name: "billing", label: "订阅与账单", icon: CreditCard },
      { name: "plans", label: "套餐配置", icon: ShieldCheck },
    ],
  },
  {
    group: "系统",
    items: [
      { name: "platform-users", label: "平台用户", icon: UsersRound },
      { name: "audit", label: "操作审计", icon: ScrollText },
      { name: "settings", label: "系统配置", icon: Settings },
    ],
  },
];

const title = computed(() => (route.meta.title as string) ?? "平台运营后台");
const sub = computed(
  () =>
    (route.meta.sub as string) ?? "2026年6月18日 周四 · 营业中",
);
const username = computed(() => auth.username);
const userInitial = computed(() => username.value.slice(0, 1) || "运");

function go(name: string) {
  if (route.name !== name) {
    router.push({ name });
  }
}

async function onLogout() {
  await auth.logout();
  ElMessage.success("已退出登录");
  router.replace({ name: "login" });
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
            :key="item.name"
            :class="{ on: item.name === route.name }"
            @click="go(item.name)"
          >
            <component :is="item.icon" />
            {{ item.label }}
          </a>
        </template>
      </nav>
      <div class="side-foot" @click="onLogout">
        <span class="dot"></span>
        <div>
          <b>平台运营</b>
          <span>点击退出登录</span>
        </div>
        <LogOut class="side-foot-ic" />
      </div>
    </aside>

    <main class="main">
      <header class="top">
        <div>
          <h1>{{ title }}</h1>
          <div class="sub">{{ sub }}</div>
        </div>
        <div class="top-r">
          <div class="search">租户 / 门店 / 负责人</div>
          <button class="ibtn" type="button">
            <Bell />
            <span class="dot"></span>
          </button>
          <div class="avatar" title="点击退出登录" @click="onLogout">
            <i>{{ userInitial }}</i>
            <b>{{ username }}</b>
          </div>
        </div>
      </header>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.side-foot {
  cursor: pointer;
}

.side-foot-ic {
  width: 16px;
  height: 16px;
  margin-left: auto;
  color: var(--muted);
}

.avatar {
  cursor: pointer;
}
</style>
