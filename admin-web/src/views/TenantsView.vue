<script setup lang="ts">
import { Building2, Plus } from "lucide-vue-next";
</script>

<template>
  <section>
    <div class="toolbar">
      <div class="search-input">
        <input type="text" placeholder="搜索租户名称 / 负责人 / 手机号" />
      </div>
      <span class="spacer" style="flex: 1"></span>
      <button class="btn btn-primary" type="button" disabled>
        <Plus />
        新建租户
      </button>
    </div>

    <div class="table-card">
      <div class="empty">
        <Building2 />
        <div>
          <b>租户管理后端接口待接入</b>
        </div>
        <span class="muted"
          >该模块（/admin/tenants 列表/详情/启停）尚未在后端开放，视图骨架已就位，接口上线后即可填充数据。</span
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 28px;
  text-align: center;
}

.empty :deep(svg) {
  width: 40px;
  height: 40px;
  color: var(--muted);
  opacity: 0.6;
}

.empty b {
  font-size: 15px;
}

.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
