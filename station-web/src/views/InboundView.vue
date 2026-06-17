<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { PackageCheck, ScanLine } from 'lucide-vue-next';
import { inboundApi, type InboundResult } from '@/api/inbound';
import { useScanGun } from '@/composables/use-scan-gun';

const form = reactive({
  stationId: localStorage.getItem('cn_station_id') ?? '',
  waybillNo: '',
  carrier: 'YTO',
  receiverPhone: '',
});
const loading = ref(false);
const recent = ref<InboundResult[]>([]);
const lastResult = ref<InboundResult | null>(null);

useScanGun({
  onScan(code) {
    form.waybillNo = code;
  },
});

async function submit() {
  if (!form.stationId || !form.waybillNo || !/^1\d{10}$/.test(form.receiverPhone)) {
    ElMessage.error('请填写门店、运单号和正确手机号');
    return;
  }

  loading.value = true;
  try {
    localStorage.setItem('cn_station_id', form.stationId);
    const result = await inboundApi({
      stationId: form.stationId,
      waybillNo: form.waybillNo,
      carrier: form.carrier,
      receiverPhone: form.receiverPhone,
    });
    lastResult.value = result;
    recent.value = [result, ...recent.value].slice(0, 8);
    form.waybillNo = '';
    form.receiverPhone = '';
    ElMessage.success('入库成功');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="inbound-grid">
    <article class="card inbound-form-card">
      <div class="hd">
        <h2>扫码入库</h2>
        <span class="tag blue"><span class="d"></span>扫码枪已启用</span>
      </div>
      <div class="bd">
        <div class="scan-panel">
          <ScanLine />
          <div>
            <b>扫描运单条码</b>
            <p>扫码枪回车后自动写入运单号，也可手动录入。</p>
          </div>
        </div>

        <form class="form-grid inbound-form" @submit.prevent="submit">
          <label class="field">
            <span>当前门店 ID <i class="req">*</i></span>
            <input v-model.trim="form.stationId" class="input" placeholder="开店后返回的 stationId" />
          </label>
          <label class="field">
            <span>运单号 <i class="req">*</i></span>
            <input v-model.trim="form.waybillNo" class="input" placeholder="扫描或输入运单号" autofocus />
          </label>
          <label class="field">
            <span>快递公司</span>
            <select v-model="form.carrier" class="select">
              <option value="YTO">圆通</option>
              <option value="ZTO">中通</option>
              <option value="STO">申通</option>
              <option value="YD">韵达</option>
              <option value="JD">京东</option>
            </select>
          </label>
          <label class="field">
            <span>收件手机号 <i class="req">*</i></span>
            <input v-model.trim="form.receiverPhone" class="input" placeholder="请输入 11 位手机号" />
          </label>
          <div class="form-actions">
            <button v-perm="'parcel:inbound'" class="btn btn-primary" type="submit" :disabled="loading">
              <PackageCheck />
              {{ loading ? '入库中' : '确认入库' }}
            </button>
          </div>
        </form>
      </div>
    </article>

    <aside class="card">
      <div class="hd">
        <h2>入库结果</h2>
      </div>
      <div class="bd">
        <div v-if="lastResult" class="result-card">
          <span class="tag green"><span class="d"></span>{{ lastResult.status }}</span>
          <div class="pickup-code tnum">{{ lastResult.pickupCode }}</div>
          <p>库位 {{ lastResult.slotCode }}</p>
        </div>
        <div v-else class="empty compact-empty">
          <p>完成入库后显示取件码与库位。</p>
        </div>
      </div>
    </aside>
  </section>

  <section class="table-card recent-inbound">
    <div class="card-hd">
      <h2>本页最近入库</h2>
    </div>
    <table>
      <thead>
        <tr>
          <th>包裹 ID</th>
          <th>取件码</th>
          <th>库位</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in recent" :key="item.parcelId">
          <td class="tnum">{{ item.parcelId.slice(0, 8) }}</td>
          <td class="code">{{ item.pickupCode }}</td>
          <td>{{ item.slotCode }}</td>
          <td><span class="tag blue"><span class="d"></span>在库待取</span></td>
        </tr>
      </tbody>
    </table>
    <div v-if="recent.length === 0" class="empty compact-empty">
      <p>暂无入库记录。</p>
    </div>
  </section>
</template>
