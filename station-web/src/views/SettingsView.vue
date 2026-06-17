<script setup lang="ts">
import { Store } from 'lucide-vue-next';
import { stationThemes, useAppStore, type StationTheme } from '@/stores/app';

const app = useAppStore();
const stationIdLabel = localStorage.getItem('cn_station_id') ?? '未设置';
const labels: Record<StationTheme, string> = {
  blue: '清爽蓝',
  dark: '科技暗',
  mint: '柔和薄荷',
};
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">网点管理 / 门店设置</div>
      <h1>门店设置</h1>
    </div>
  </section>

  <section class="settings-grid">
    <article class="card">
      <div class="hd">
        <h2>基础信息</h2>
        <Store :size="18" />
      </div>
      <div class="bd form-grid">
        <label class="field">
          <span>门店名称</span>
          <input class="input" value="城南综合驿站" disabled />
        </label>
        <label class="field">
          <span>门店编号</span>
          <input class="input" value="CN-0731" disabled />
        </label>
        <label class="field">
          <span>当前 stationId</span>
          <input class="input" :value="stationIdLabel" disabled />
        </label>
      </div>
    </article>

    <article class="card">
      <div class="hd">
        <h2>主题偏好</h2>
        <span class="tag blue">本地即时生效</span>
      </div>
      <div class="bd theme-choice">
        <button
          v-for="theme in stationThemes"
          :key="theme"
          class="theme-card"
          :class="{ on: app.theme === theme }"
          type="button"
          @click="app.setTheme(theme)"
        >
          <span class="theme-swatch" :data-theme-swatch="theme"></span>
          <b>{{ labels[theme] }}</b>
        </button>
      </div>
    </article>
  </section>
</template>
