<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Grid3X3, Plus, RotateCcw, Warehouse } from 'lucide-vue-next';
import {
  batchCreateSlotsApi,
  createShelfApi,
  listShelvesApi,
  listSlotsApi,
  shelfUsagePercent,
  type ShelfItem,
  type SlotItem,
} from '@/api/station';

const stationId = ref(localStorage.getItem('cn_station_id') ?? '');
const shelves = ref<ShelfItem[]>([]);
const slots = ref<SlotItem[]>([]);
const activeShelfId = ref('');
const loading = ref(false);
const slotLoading = ref(false);
const shelfForm = reactive({ code: '', name: '', zone: '' });
const batchForm = reactive({ rows: 1, levels: 1, cols: 8 });

const activeShelf = computed(() => shelves.value.find((item) => item.id === activeShelfId.value));
const totalSlots = computed(() => shelves.value.reduce((sum, shelf) => sum + shelf.totalSlots, 0));
const occupiedSlots = computed(() => shelves.value.reduce((sum, shelf) => sum + shelf.occupiedSlots, 0));
const freeSlots = computed(() => totalSlots.value - occupiedSlots.value);
const usage = computed(() => (totalSlots.value ? Math.round((occupiedSlots.value / totalSlots.value) * 100) : 0));

onMounted(() => {
  if (stationId.value) {
    loadShelves();
  }
});

async function loadShelves() {
  if (!stationId.value) {
    ElMessage.error('请先填写当前门店 ID');
    return;
  }
  localStorage.setItem('cn_station_id', stationId.value);
  loading.value = true;
  try {
    shelves.value = await listShelvesApi(stationId.value);
    if (!activeShelfId.value && shelves.value[0]) {
      activeShelfId.value = shelves.value[0].id;
      await loadSlots(activeShelfId.value);
    }
  } finally {
    loading.value = false;
  }
}

async function loadSlots(shelfId: string) {
  activeShelfId.value = shelfId;
  slotLoading.value = true;
  try {
    slots.value = await listSlotsApi(shelfId);
  } finally {
    slotLoading.value = false;
  }
}

async function createShelf() {
  if (!stationId.value || !shelfForm.code || !shelfForm.name) {
    ElMessage.error('请填写门店、货架编码和名称');
    return;
  }
  await createShelfApi(stationId.value, {
    code: shelfForm.code,
    name: shelfForm.name,
    zone: shelfForm.zone || undefined,
  });
  shelfForm.code = '';
  shelfForm.name = '';
  shelfForm.zone = '';
  await loadShelves();
  ElMessage.success('货架已创建');
}

async function createSlots() {
  if (!activeShelf.value) {
    ElMessage.error('请先选择货架');
    return;
  }
  const result = await batchCreateSlotsApi(activeShelf.value.id, {
    rows: Number(batchForm.rows),
    levels: Number(batchForm.levels),
    cols: Number(batchForm.cols),
  });
  await loadShelves();
  await loadSlots(activeShelf.value.id);
  ElMessage.success(`已创建 ${result.created} 个库位`);
}

function slotClass(slot: SlotItem) {
  return {
    free: slot.status === 'FREE',
    occupied: slot.status === 'OCCUPIED',
    locked: slot.status === 'DISABLED',
  };
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">网点管理 / 货架库位</div>
      <h1>货架库位</h1>
    </div>
    <button class="btn" type="button" @click="loadShelves">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="shelf-kpis">
    <article class="kpi">
      <div class="lab"><i><Warehouse /></i>货架数</div>
      <div class="num tnum">{{ shelves.length }}</div>
      <div class="delta">当前门店</div>
    </article>
    <article class="kpi">
      <div class="lab"><i><Grid3X3 /></i>总库位</div>
      <div class="num tnum">{{ totalSlots }}</div>
      <div class="delta">空闲 {{ freeSlots }}</div>
    </article>
    <article class="kpi">
      <div class="lab"><i><Grid3X3 /></i>占用率</div>
      <div class="num tnum">{{ usage }}%</div>
      <div class="delta">已占用 {{ occupiedSlots }}</div>
    </article>
  </section>

  <section class="shelves-layout">
    <aside class="card shelf-side">
      <div class="hd">
        <h2>货架配置</h2>
      </div>
      <div class="bd shelf-forms">
        <label class="field">
          <span>当前门店 ID</span>
          <input v-model.trim="stationId" class="input" placeholder="stationId" @change="loadShelves" />
        </label>
        <div class="form-grid one-col">
          <label class="field">
            <span>货架编码</span>
            <input v-model.trim="shelfForm.code" class="input" placeholder="A" />
          </label>
          <label class="field">
            <span>货架名称</span>
            <input v-model.trim="shelfForm.name" class="input" placeholder="A 区货架" />
          </label>
          <label class="field">
            <span>库位前缀</span>
            <input v-model.trim="shelfForm.zone" class="input" placeholder="默认用货架编码" />
          </label>
        </div>
        <button v-perm="'station:manage'" class="btn btn-primary" type="button" @click="createShelf">
          <Plus />
          新建货架
        </button>

        <div class="batch-box">
          <h3>批量建位</h3>
          <div class="slot-batch-grid">
            <label class="field">
              <span>排</span>
              <input v-model.number="batchForm.rows" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span>层</span>
              <input v-model.number="batchForm.levels" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span>列</span>
              <input v-model.number="batchForm.cols" class="input" type="number" min="1" />
            </label>
          </div>
          <button v-perm="'station:manage'" class="btn" type="button" @click="createSlots">生成库位</button>
        </div>
      </div>
    </aside>

    <section class="shelf-main">
      <div class="shelf-list">
        <button
          v-for="shelf in shelves"
          :key="shelf.id"
          class="shelf-chip"
          :class="{ on: shelf.id === activeShelfId }"
          type="button"
          @click="loadSlots(shelf.id)"
        >
          <b>{{ shelf.code }}</b>
          <span>{{ shelf.name }}</span>
          <em>{{ shelfUsagePercent(shelf) }}%</em>
        </button>
      </div>

      <article class="card">
        <div class="hd">
          <h2>{{ activeShelf?.name ?? '请选择货架' }}</h2>
          <span class="tag blue">
            <span class="d"></span>
            {{ activeShelf ? `${activeShelf.occupiedSlots}/${activeShelf.totalSlots}` : '0/0' }}
          </span>
        </div>
        <div class="bd">
          <div v-if="activeShelf" class="progress shelf-progress">
            <span :style="{ width: `${shelfUsagePercent(activeShelf)}%` }"></span>
          </div>
          <div v-if="slotLoading" class="empty compact-empty">
            <p>库位加载中...</p>
          </div>
          <div v-else-if="slots.length" class="slot-grid">
            <div v-for="slot in slots" :key="slot.id" class="slot-cell" :class="slotClass(slot)">
              <b>{{ slot.code }}</b>
              <small>{{ slot.status }}</small>
            </div>
          </div>
          <div v-else class="empty compact-empty">
            <p>当前货架暂无库位。</p>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>
