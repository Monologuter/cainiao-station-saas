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
  recognizeInboundOcrBatchApi,
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
const ocrBatchItems = ref<Array<{ filename: string; result: InboundOcrRecognition }>>([]);
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

function resetOcr(options: { clearBatch?: boolean } = {}) {
  ocrResult.value = null;
  selectedFileName.value = '';
  if (options.clearBatch !== false) {
    ocrBatchItems.value = [];
  }
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function applyOcrResult(result: InboundOcrRecognition, filename: string) {
  ocrResult.value = result;
  selectedFileName.value = filename;
  const { fields } = result;
  if (fields.waybillNo?.value) {
    form.waybillNo = fields.waybillNo.value;
  }
  if (fields.courierCode?.value && knownCarriers.has(fields.courierCode.value)) {
    form.carrier = fields.courierCode.value;
  }
}

function selectBatchItem(item: { filename: string; result: InboundOcrRecognition }) {
  applyOcrResult(item.result, item.filename);
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
  const files = Array.from(input.files ?? []);
  if (files.length === 0) {
    return;
  }
  if (files.some((file) => !file.type.startsWith('image/'))) {
    ElMessage.error('请上传面单图片');
    input.value = '';
    return;
  }
  if (files.some((file) => file.size > 8 * 1024 * 1024)) {
    ElMessage.error('面单图片不能超过 8MB');
    input.value = '';
    return;
  }

  ocrLoading.value = true;
  selectedFileName.value = files.length === 1 ? (files[0]?.name ?? '面单图片') : `${files.length} 张面单`;
  try {
    localStorage.setItem('cn_station_id', form.stationId);
    const result =
      files.length === 1
        ? await recognizeInboundOcrApi(files[0], form.stationId)
        : await recognizeInboundOcrBatchApi(files, form.stationId);
    const isBatchResult = 'items' in result;
    const firstResult = isBatchResult ? result.items[0] : result;
    ocrBatchItems.value = isBatchResult
      ? result.items.map((item, index) => ({
          filename: files[index]?.name ?? `面单 ${index + 1}`,
          result: item,
        }))
      : [];
    if (!firstResult) {
      ElMessage.warning('未识别到面单，请手动录入');
      resetOcr();
      return;
    }
    const firstFilename =
      files.length === 1
        ? (files[0]?.name ?? '面单图片')
        : (ocrBatchItems.value[0]?.filename ?? selectedFileName.value);
    applyOcrResult(firstResult, firstFilename);
    if (firstResult.status === 'FAILED') {
      ElMessage.warning('识别失败，请手动录入后入库');
    } else if (firstResult.needReview || ocrBatchItems.value.some((item) => item.result.needReview)) {
      ElMessage.warning('已识别，请复核低置信字段');
    } else if (ocrBatchItems.value.length > 0) {
      ElMessage.success(`已识别 ${ocrBatchItems.value.length} 张面单`);
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
    const confirmedRecognitionId = ocrResult.value?.recognitionId;
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
    if (confirmedRecognitionId && ocrBatchItems.value.length > 0) {
      ocrBatchItems.value = ocrBatchItems.value.filter(
        (item) => item.result.recognitionId !== confirmedRecognitionId,
      );
      const next = ocrBatchItems.value[0];
      if (next) {
        applyOcrResult(next.result, next.filename);
      } else {
        resetOcr();
      }
    } else {
      resetOcr();
    }
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
            multiple
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
              <button class="icon-btn" type="button" title="清除识别结果" @click="() => resetOcr()">
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

        <div v-if="ocrBatchItems.length" class="ocr-batch-panel">
          <div class="ocr-batch-head">
            <b>批量复核</b>
            <span>{{ ocrBatchItems.length }} 张待确认</span>
          </div>
          <button
            v-for="item in ocrBatchItems"
            :key="item.result.recognitionId"
            class="ocr-batch-item"
            :class="{ on: item.result.recognitionId === ocrResult?.recognitionId }"
            type="button"
            @click="selectBatchItem(item)"
          >
            <FileText />
            <span>
              <b>{{ item.filename }}</b>
              <small class="tnum">{{ item.result.fields.waybillNo?.value || '待补运单号' }}</small>
            </span>
            <i :class="['tag', item.result.needReview ? 'amber' : 'green']">
              <span class="d"></span>{{ item.result.needReview ? '待复核' : '可确认' }}
            </i>
          </button>
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
          <div v-if="lastResult.slotSource" class="slot-recommend-meta">
            <span :class="['tag', lastResult.slotSource === 'AI' ? 'green' : 'gray']">
              <span class="d"></span>{{ lastResult.slotSource === 'AI' ? '智能推荐' : '规则分配' }}
            </span>
            <small v-if="lastResult.slotReasons?.length">{{ lastResult.slotReasons.join(' / ') }}</small>
          </div>
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

<style scoped>
.slot-recommend-meta {
  display: grid;
  justify-items: center;
  gap: 8px;
  margin-top: 12px;
}

.slot-recommend-meta small {
  max-width: 220px;
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
