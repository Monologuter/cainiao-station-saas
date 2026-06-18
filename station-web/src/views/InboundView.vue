<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ImageUp,
  PackageCheck,
  RotateCcw,
  ScanLine,
} from 'lucide-vue-next';
import {
  confirmInboundOcrApi,
  inboundApi,
  recognizeInboundOcrApi,
  type InboundOcrRecognition,
  type InboundResult,
} from '@/api/inbound';
import { useScanGun } from '@/composables/use-scan-gun';

const form = reactive({
  stationId: localStorage.getItem('cn_station_id') ?? '',
  waybillNo: '',
  carrier: 'YTO',
  receiverPhone: '',
});
const loading = ref(false);
const ocrLoading = ref(false);
const ocrResult = ref<InboundOcrRecognition | null>(null);
const selectedFileName = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const recent = ref<InboundResult[]>([]);
const lastResult = ref<InboundResult | null>(null);

const knownCarriers = new Set(['YTO', 'ZTO', 'STO', 'YD', 'JD', 'SF', 'EMS']);

const ocrStatusMeta = computed(() => {
  if (!ocrResult.value) {
    return { label: '待识别', tag: 'blue', icon: FileText };
  }
  if (ocrResult.value.status === 'FAILED') {
    return { label: '识别失败', tag: 'red', icon: AlertTriangle };
  }
  if (ocrResult.value.needReview) {
    return { label: '待复核', tag: 'amber', icon: AlertTriangle };
  }
  return { label: '可确认', tag: 'green', icon: CheckCircle2 };
});

useScanGun({
  onScan(code) {
    form.waybillNo = code;
  },
});

function confidencePct(confidence?: number) {
  if (typeof confidence !== 'number') {
    return '--';
  }
  return `${Math.round(confidence * 100)}%`;
}

function resetOcr() {
  ocrResult.value = null;
  selectedFileName.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function chooseOcrImage() {
  if (!form.stationId) {
    ElMessage.error('请先填写当前门店 ID');
    return;
  }
  fileInput.value?.click();
}

async function recognizeOcr(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请上传面单图片');
    input.value = '';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.error('面单图片不能超过 8MB');
    input.value = '';
    return;
  }

  ocrLoading.value = true;
  selectedFileName.value = file.name;
  try {
    localStorage.setItem('cn_station_id', form.stationId);
    const result = await recognizeInboundOcrApi(file, form.stationId);
    ocrResult.value = result;
    const { fields } = result;
    if (fields.waybillNo?.value) {
      form.waybillNo = fields.waybillNo.value;
    }
    if (fields.courierCode?.value && knownCarriers.has(fields.courierCode.value)) {
      form.carrier = fields.courierCode.value;
    }
    if (result.status === 'FAILED') {
      ElMessage.warning('识别失败，请手动录入后入库');
    } else if (result.needReview) {
      ElMessage.warning('已识别，请复核低置信字段');
    } else {
      ElMessage.success('面单识别完成');
    }
  } finally {
    ocrLoading.value = false;
    input.value = '';
  }
}

async function submit() {
  if (!form.stationId || !form.waybillNo || !/^1\d{10}$/.test(form.receiverPhone)) {
    ElMessage.error('请填写门店、运单号和正确手机号');
    return;
  }

  loading.value = true;
  try {
    localStorage.setItem('cn_station_id', form.stationId);
    const isOcrInbound = Boolean(ocrResult.value);
    const result = ocrResult.value
      ? await confirmInboundOcrApi({
          recognitionId: ocrResult.value.recognitionId,
          waybillNo: form.waybillNo,
          courierCode: form.carrier,
          phone: form.receiverPhone,
        })
      : await inboundApi({
          stationId: form.stationId,
          waybillNo: form.waybillNo,
          carrier: form.carrier,
          receiverPhone: form.receiverPhone,
        });
    lastResult.value = result;
    recent.value = [result, ...recent.value].slice(0, 8);
    form.waybillNo = '';
    form.receiverPhone = '';
    resetOcr();
    ElMessage.success(isOcrInbound ? 'OCR 入库成功' : '入库成功');
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
          <button
            v-perm="'parcel:inbound'"
            class="btn btn-sm ocr-upload-btn"
            type="button"
            :disabled="ocrLoading"
            @click="chooseOcrImage"
          >
            <ImageUp />
            {{ ocrLoading ? '识别中' : '上传面单' }}
          </button>
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept="image/*"
            @change="recognizeOcr"
          />
        </div>

        <div v-if="ocrResult || selectedFileName" class="ocr-review-panel">
          <div class="ocr-review-head">
            <div>
              <component :is="ocrStatusMeta.icon" />
              <div>
                <b>{{ selectedFileName || '面单识别结果' }}</b>
                <span>整体置信度 {{ confidencePct(ocrResult?.confidence) }}</span>
              </div>
            </div>
            <div class="ocr-review-actions">
              <span :class="['tag', ocrStatusMeta.tag]"><span class="d"></span>{{ ocrStatusMeta.label }}</span>
              <button class="icon-btn" type="button" title="清除识别结果" @click="resetOcr">
                <RotateCcw />
              </button>
            </div>
          </div>
          <div v-if="ocrResult" class="ocr-fields">
            <div>
              <span>运单号</span>
              <b class="tnum">{{ ocrResult.fields.waybillNo?.value || '--' }}</b>
              <small>{{ confidencePct(ocrResult.fields.waybillNo?.confidence) }}</small>
            </div>
            <div>
              <span>快递公司</span>
              <b>{{ ocrResult.fields.courierCode?.value || '--' }}</b>
              <small>{{ confidencePct(ocrResult.fields.courierCode?.confidence) }}</small>
            </div>
            <div>
              <span>手机号尾号</span>
              <b class="tnum">{{ ocrResult.fields.phoneTail?.value || '--' }}</b>
              <small>{{ confidencePct(ocrResult.fields.phoneTail?.confidence) }}</small>
            </div>
          </div>
          <div v-if="ocrResult?.warnings.length" class="ocr-warnings">
            <AlertTriangle />
            <span>{{ ocrResult.warnings.join(' / ') }}</span>
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
            <input
              v-model.trim="form.receiverPhone"
              class="input"
              :placeholder="
                ocrResult?.fields.phoneTail?.value
                  ? `请输入完整手机号，尾号 ${ocrResult.fields.phoneTail.value}`
                  : '请输入 11 位手机号'
              "
            />
          </label>
          <div class="form-actions">
            <button v-perm="'parcel:inbound'" class="btn btn-primary" type="submit" :disabled="loading">
              <PackageCheck />
              {{ loading ? '入库中' : ocrResult ? '确认 OCR 入库' : '确认入库' }}
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
