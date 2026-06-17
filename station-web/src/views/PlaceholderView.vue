<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => String(route.meta.title ?? '页面'));
</script>

<template>
  <section class="card placeholder-page">
    <div class="hd">
      <h2>{{ title }}</h2>
      <span class="tag gray">待接入</span>
    </div>
    <div class="bd empty">
      <p>{{ title }} 页面将在本期后续任务接入真实流程。</p>
    </div>
  </section>
</template>
