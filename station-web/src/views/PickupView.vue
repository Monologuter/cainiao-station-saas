<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { BadgeCheck, RotateCcw, ScanLine } from 'lucide-vue-next';
import { listParcelsApi, parcelStatusMeta, type ParcelItem } from '@/api/parcel';
import { canSubmitPickup, pickupApi, pickupResultText, type PickupResult } from '@/api/pickup';
import { useScanGun } from '@/composables/use-scan-gun';

const form = reactive({
  stationId: localStorage.getItem('cn_station_id') ?? '',
  pickupCode: '',
  phoneTail: '',
});
const loading = ref(false);
const listLoading = ref(false);
const pending = ref<ParcelItem[]>([]);
const lastResult = ref<PickupResult | null>(null);

useScanGun({
  onScan(code) {
    form.pickupCode = code;
  },
});

onMounted(() => {
  loadPending();
});

async function loadPending() {
  listLoading.value = true;
  try {
    const result = await listParcelsApi({ status: 'STORED', page: 1, size: 8 });
    pending.value = result.list;
  } finally {
    listLoading.value = false;
  }
}

async function submit(parcel?: ParcelItem) {
  const payload = {
    stationId: form.stationId,
    pickupCode: parcel?.pickupCode ?? form.pickupCode,
    phoneTail: parcel ? undefined : form.phoneTail,
    parcelId: parcel?.id,
  };

  if (!canSubmitPickup(payload)) {
    ElMessage.error('请输入门店 ID，并填写取件码或手机尾号');
    return;
  }

  loading.value = true;
  try {
    localStorage.setItem('cn_station_id', form.stationId);
    const result = await pickupApi(payload);
    lastResult.value = result;
    ElMessage.success(pickupResultText(result));
    form.pickupCode = '';
    form.phoneTail = '';
    await loadPending();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '核销失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="pickup-grid">
    <article class="card pickup-card">
      <div class="hd">
        <h2>取件核销</h2>
        <span class="tag green"><span class="d"></span>库位自动释放</span>
      </div>
      <div class="bd">
        <div class="scan-panel pickup-scan">
          <ScanLine />
          <div>
            <b>扫描取件码</b>
            <p>扫码枪回车后自动填入取件码，也可按手机尾号核销。</p>
          </div>
        </div>

        <form class="form-grid pickup-form" @submit.prevent="submit()">
          <label class="field">
            <span>当前门店 ID <i class="req">*</i></span>
            <input v-model.trim="form.stationId" class="input" placeholder="开店后返回的 stationId" />
          </label>
          <label class="field">
            <span>取件码</span>
            <input v-model.trim="form.pickupCode" class="input" placeholder="扫描或输入取件码" autofocus />
          </label>
          <label class="field">
            <span>手机尾号</span>
            <input v-model.trim="form.phoneTail" class="input" maxlength="4" placeholder="可选，4 位尾号" />
          </label>
          <div class="form-actions">
            <button v-perm="'parcel:pickup'" class="btn btn-accent" type="submit" :disabled="loading">
              <BadgeCheck />
              {{ loading ? '核销中' : '确认核销' }}
            </button>
          </div>
        </form>
      </div>
    </article>

    <aside class="card">
      <div class="hd">
        <h2>最近结果</h2>
      </div>
      <div class="bd">
        <div v-if="lastResult" class="result-card">
          <span class="tag green"><span class="d"></span>{{ lastResult.status }}</span>
          <div class="pickup-result-title">{{ pickupResultText(lastResult) }}</div>
          <p class="tnum">包裹 {{ lastResult.parcelId.slice(0, 8) }}</p>
        </div>
        <div v-else class="empty compact-empty">
          <p>核销成功后显示释放状态。</p>
        </div>
      </div>
    </aside>
  </section>

  <section class="table-card">
    <div class="card-hd">
      <h2>待核销包裹</h2>
      <button class="btn btn-ghost btn-sm" type="button" @click="loadPending">
        <RotateCcw />
        刷新
      </button>
    </div>
    <table>
      <thead>
        <tr>
          <th>取件码</th>
          <th>运单号</th>
          <th>手机尾号</th>
          <th>库位</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="parcel in pending" :key="parcel.id">
          <td class="code">{{ parcel.pickupCode }}</td>
          <td class="tnum">{{ parcel.waybillNo }}</td>
          <td>{{ parcel.receiverPhoneTail }}</td>
          <td>{{ parcel.slot?.code ?? '-' }}</td>
          <td>
            <span class="tag" :class="parcelStatusMeta(parcel.status).tag">
              <span class="d"></span>
              {{ parcelStatusMeta(parcel.status).label }}
            </span>
          </td>
          <td>
            <button class="op op-btn" type="button" :disabled="loading" @click="submit(parcel)">
              核销
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!listLoading && pending.length === 0" class="empty compact-empty">
      <p>暂无待核销包裹。</p>
    </div>
  </section>
</template>
