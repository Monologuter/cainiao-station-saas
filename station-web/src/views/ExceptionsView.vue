<script setup lang="ts">
import { AlertTriangle, RotateCcw } from 'lucide-vue-next';
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">代收业务 / 异常件</div>
      <h1>异常件</h1>
    </div>
    <button class="btn" type="button">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="table-card">
    <div class="empty">
      <AlertTriangle />
      <p>异常件工作台已接入路由，列表与处理流程将在下一步启用。</p>
    </div>
  </section>
</template>
