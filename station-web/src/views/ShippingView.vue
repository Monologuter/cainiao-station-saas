<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  Search,
  Truck,
  X,
} from 'lucide-vue-next';
import {
  collectShipOrderApi,
  createShipOrderApi,
  listShipOrdersApi,
  payShipOrderApi,
  quoteShippingApi,
  shipOrderDetailApi,
  shippingStatusMeta,
  shipOrderTracksApi,
  type LogisticsTrack,
  type ShipOrder,
  type ShipOrderStatus,
  type ShippingAddress,
  type ShippingQuote,
} from '@/api/shipping';

type AddressKey = 'sender' | 'receiver';

interface ShippingForm {
  stationId: string;
  sender: ShippingAddress;
  receiver: ShippingAddress;
  itemType: string;
  weightGram: number;
  declaredValue?: number;
  preference: 'balanced' | 'priceFirst' | 'speedFirst';
}

const emptyAddress = (): ShippingAddress => ({
  name: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  address: '',
});

const form = reactive<ShippingForm>({
  stationId: localStorage.getItem('cn_station_id') ?? '',
  sender: {
    name: '门店寄件人',
    phone: '',
    province: '湖南省',
    city: '长沙市',
    district: '岳麓区',
    address: '',
  },
  receiver: emptyAddress(),
  itemType: '日用品',
  weightGram: 1000,
  declaredValue: undefined,
  preference: 'balanced',
});

const filters = reactive<{ status: ShipOrderStatus | ''; stationId: string }>({
  status: '',
  stationId: localStorage.getItem('cn_station_id') ?? '',
});
const quoteLoading = ref(false);
const createLoading = ref(false);
const listLoading = ref(false);
const actionLoading = ref('');
const quotes = ref<ShippingQuote[]>([]);
const selectedQuote = ref<ShippingQuote | null>(null);
const rows = ref<ShipOrder[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const detail = ref<ShipOrder | null>(null);
const tracks = ref<LogisticsTrack[]>([]);
const detailLoading = ref(false);

const tabs: Array<{ label: string; status: ShipOrderStatus | '' }> = [
  { label: '全部', status: '' },
  { label: '待支付', status: 'CREATED' },
  { label: '待揽收', status: 'PAID' },
  { label: '已揽收', status: 'COLLECTED' },
  { label: '运输中', status: 'IN_TRANSIT' },
  { label: '已签收', status: 'DELIVERED' },
];

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
const paidCount = computed(() => rows.value.filter((item) => item.status === 'PAID').length);
const transitCount = computed(
  () => rows.value.filter((item) => ['COLLECTED', 'IN_TRANSIT'].includes(item.status)).length,
);
const revenue = computed(() =>
  rows.value
    .filter((item) => item.status !== 'CANCELLED')
    .reduce((sum, item) => sum + Number(item.quoteAmount), 0),
);

onMounted(() => {
  load();
});

async function load() {
  listLoading.value = true;
  try {
    const result = await listShipOrdersApi({
      status: filters.status,
      stationId: filters.stationId,
      page: page.value,
      size: size.value,
    });
    rows.value = result.list;
    total.value = result.total;
    page.value = result.page;
    size.value = result.size;
  } finally {
    listLoading.value = false;
  }
}

function resetAddress(key: AddressKey) {
  Object.assign(form[key], emptyAddress());
}

function validateAddress(address: ShippingAddress, label: string) {
  if (!address.name || !/^1\d{10}$/.test(address.phone)) {
    ElMessage.error(`请填写${label}姓名和 11 位手机号`);
    return false;
  }
  if (!address.province || !address.city || !address.district || !address.address) {
    ElMessage.error(`请补全${label}地址`);
    return false;
  }
  return true;
}

function validateForm() {
  if (!form.stationId) {
    ElMessage.error('请填写当前门店 ID');
    return false;
  }
  if (!validateAddress(form.sender, '寄件人') || !validateAddress(form.receiver, '收件人')) {
    return false;
  }
  if (!Number.isInteger(form.weightGram) || form.weightGram <= 0) {
    ElMessage.error('重量必须大于 0 克');
    return false;
  }
  return true;
}

async function quote() {
  if (!validateForm()) {
    return;
  }
  quoteLoading.value = true;
  try {
    localStorage.setItem('cn_station_id', form.stationId);
    filters.stationId = form.stationId;
    const result = await quoteShippingApi({
      stationId: form.stationId,
      sender: form.sender,
      receiver: form.receiver,
      weightGram: Number(form.weightGram),
      preference: form.preference,
    });
    quotes.value = result;
    selectedQuote.value = result[0] ?? null;
    ElMessage.success('报价已刷新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '报价失败');
  } finally {
    quoteLoading.value = false;
  }
}

async function createOrder() {
  if (!validateForm()) {
    return;
  }
  if (!selectedQuote.value) {
    ElMessage.error('请先比价并选择快递');
    return;
  }
  createLoading.value = true;
  try {
    const order = await createShipOrderApi({
      channel: 'STATION',
      stationId: form.stationId,
      courierCode: selectedQuote.value.courierCode,
      sender: form.sender,
      receiver: form.receiver,
      item: {
        type: form.itemType,
        weightGram: Number(form.weightGram),
        declaredValue: form.declaredValue ? Number(form.declaredValue) : undefined,
      },
    });
    ElMessage.success('寄件单已创建');
    selectedQuote.value = null;
    quotes.value = [];
    await load();
    await openDetail(order);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建寄件单失败');
  } finally {
    createLoading.value = false;
  }
}

async function pay(order: ShipOrder) {
  actionLoading.value = `pay:${order.id}`;
  try {
    const result = await payShipOrderApi(order.id);
    ElMessage.success('模拟收款成功');
    await load();
    await openDetail(result);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '收款失败');
  } finally {
    actionLoading.value = '';
  }
}

async function collect(order: ShipOrder) {
  actionLoading.value = `collect:${order.id}`;
  try {
    const result = await collectShipOrderApi(order.id);
    ElMessage.success('揽收成功，运单已生成');
    await load();
    await openDetail(result);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '揽收失败');
  } finally {
    actionLoading.value = '';
  }
}

async function openDetail(order: ShipOrder) {
  detailLoading.value = true;
  detail.value = order;
  tracks.value = [];
  try {
    const [fresh, trackRows] = await Promise.all([
      shipOrderDetailApi(order.id),
      shipOrderTracksApi(order.id),
    ]);
    detail.value = fresh;
    tracks.value = trackRows;
  } catch {
    ElMessage.error('寄件详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

function switchStatus(status: ShipOrderStatus | '') {
  filters.status = status;
  page.value = 1;
  load();
}

function submitFilters() {
  page.value = 1;
  load();
}

function changePage(next: number) {
  if (next < 1 || next > pageCount.value || next === page.value) {
    return;
  }
  page.value = next;
  load();
}

function formatMoney(value: number | string) {
  return `¥${Number(value).toFixed(2)}`;
}

function formatWeight(value: number) {
  return `${(Number(value) / 1000).toFixed(value >= 1000 ? 1 : 2)} kg`;
}

function formatTime(value?: string | null) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">网点管理 / 寄件管理</div>
      <h1>寄件管理</h1>
    </div>
    <button class="btn" type="button" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="shipping-kpis">
    <div class="kpi">
      <div class="lab">
        <i><Truck /></i>
        本页寄件
      </div>
      <div class="num tnum">{{ total }} <span>单</span></div>
      <div class="delta">按当前筛选统计</div>
    </div>
    <div class="kpi warn">
      <div class="lab">
        <i><PackagePlus /></i>
        待揽收
      </div>
      <div class="num tnum">{{ paidCount }}</div>
      <div class="delta">已支付订单待交接</div>
    </div>
    <div class="kpi">
      <div class="lab">
        <i class="purple"><Truck /></i>
        在途
      </div>
      <div class="num tnum">{{ transitCount }}</div>
      <div class="delta">已揽收或运输中</div>
    </div>
    <div class="kpi">
      <div class="lab">
        <i class="green"><CircleDollarSign /></i>
        本页金额
      </div>
      <div class="num tnum">{{ formatMoney(revenue) }}</div>
      <div class="delta">模拟支付口径</div>
    </div>
  </section>

  <section class="shipping-grid">
    <article class="card shipping-form-card">
      <div class="hd">
        <h2>新建寄件</h2>
        <span class="tag blue"><span class="d"></span>Mock 支付 / 物流</span>
      </div>
      <div class="bd">
        <form class="shipping-form" @submit.prevent="quote">
          <label class="field full">
            <span>当前门店 ID <i class="req">*</i></span>
            <input v-model.trim="form.stationId" class="input" placeholder="开店后返回的 stationId" />
          </label>

          <div class="address-card">
            <div class="address-hd">
              <b>寄件人</b>
              <button class="op op-btn" type="button" @click="resetAddress('sender')">清空</button>
            </div>
            <div class="form-grid">
              <label class="field">
                <span>姓名</span>
                <input v-model.trim="form.sender.name" class="input" />
              </label>
              <label class="field">
                <span>手机号</span>
                <input v-model.trim="form.sender.phone" class="input" maxlength="11" />
              </label>
              <label class="field">
                <span>省份</span>
                <input v-model.trim="form.sender.province" class="input" />
              </label>
              <label class="field">
                <span>城市</span>
                <input v-model.trim="form.sender.city" class="input" />
              </label>
              <label class="field">
                <span>区县</span>
                <input v-model.trim="form.sender.district" class="input" />
              </label>
              <label class="field">
                <span>详细地址</span>
                <input v-model.trim="form.sender.address" class="input" />
              </label>
            </div>
          </div>

          <div class="address-card">
            <div class="address-hd">
              <b>收件人</b>
              <button class="op op-btn" type="button" @click="resetAddress('receiver')">清空</button>
            </div>
            <div class="form-grid">
              <label class="field">
                <span>姓名</span>
                <input v-model.trim="form.receiver.name" class="input" />
              </label>
              <label class="field">
                <span>手机号</span>
                <input v-model.trim="form.receiver.phone" class="input" maxlength="11" />
              </label>
              <label class="field">
                <span>省份</span>
                <input v-model.trim="form.receiver.province" class="input" />
              </label>
              <label class="field">
                <span>城市</span>
                <input v-model.trim="form.receiver.city" class="input" />
              </label>
              <label class="field">
                <span>区县</span>
                <input v-model.trim="form.receiver.district" class="input" />
              </label>
              <label class="field">
                <span>详细地址</span>
                <input v-model.trim="form.receiver.address" class="input" />
              </label>
            </div>
          </div>

          <div class="form-grid shipping-item-grid">
            <label class="field">
              <span>物品类型</span>
              <input v-model.trim="form.itemType" class="input" />
            </label>
            <label class="field">
              <span>重量（克）</span>
              <input v-model.number="form.weightGram" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span>声明价值</span>
              <input v-model.number="form.declaredValue" class="input" type="number" min="0" />
            </label>
            <label class="field">
              <span>报价策略</span>
              <select v-model="form.preference" class="select">
                <option value="balanced">综合推荐</option>
                <option value="priceFirst">价格优先</option>
                <option value="speedFirst">时效优先</option>
              </select>
            </label>
          </div>

          <div class="form-actions shipping-actions">
            <button v-perm="'shipping:quote'" class="btn btn-primary" type="submit" :disabled="quoteLoading">
              <Search />
              {{ quoteLoading ? '比价中' : '比价' }}
            </button>
            <button
              v-perm="'shipping:create'"
              class="btn btn-accent"
              type="button"
              :disabled="createLoading || !selectedQuote"
              @click="createOrder"
            >
              <ReceiptText />
              {{ createLoading ? '下单中' : '确认下单' }}
            </button>
          </div>
        </form>
      </div>
    </article>

    <aside class="card shipping-quote-card">
      <div class="hd">
        <h2>报价候选</h2>
        <span v-if="selectedQuote" class="tag green"><span class="d"></span>已选择</span>
      </div>
      <div class="bd quote-list">
        <button
          v-for="item in quotes"
          :key="item.courierCode"
          class="quote-card"
          :class="{ on: selectedQuote?.courierCode === item.courierCode }"
          type="button"
          @click="selectedQuote = item"
        >
          <span class="quote-main">
            <b>{{ item.courierName }}</b>
            <small>{{ item.zone }} · 约 {{ item.estHours }} 小时</small>
          </span>
          <span class="quote-price">{{ formatMoney(item.amount) }}</span>
          <span v-if="item.recommended" class="tag blue"><span class="d"></span>推荐</span>
        </button>
        <div v-if="quotes.length === 0" class="empty compact-empty">
          <p>填写寄收信息后获取快递报价。</p>
        </div>
      </div>
    </aside>
  </section>

  <form class="toolbar" @submit.prevent="submitFilters">
    <label class="search-box">
      <Search />
      <input v-model.trim="filters.stationId" placeholder="门店 ID" />
    </label>
    <button class="btn btn-primary" type="submit">
      <Search />
      查询
    </button>
    <button
      class="btn btn-ghost"
      type="button"
      @click="
        filters.stationId = '';
        filters.status = '';
        page = 1;
        load();
      "
    >
      重置
    </button>
  </form>

  <div class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab.label"
      class="tab"
      :class="{ on: filters.status === tab.status }"
      type="button"
      @click="switchStatus(tab.status)"
    >
      {{ tab.label }}
    </button>
  </div>

  <section class="table-card">
    <table>
      <thead>
        <tr>
          <th>寄件单号</th>
          <th>寄件人</th>
          <th>收件人</th>
          <th>快递</th>
          <th>重量</th>
          <th>费用</th>
          <th>状态</th>
          <th>下单时间</th>
          <th class="right">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in rows" :key="order.id">
          <td><span class="code">{{ order.orderNo }}</span></td>
          <td>{{ order.senderJson.name }}</td>
          <td>
            <div class="recv">
              <b>{{ order.receiverJson.name }}</b>
              <span>{{ order.receiverJson.province }} {{ order.receiverJson.city }}</span>
            </div>
          </td>
          <td>{{ order.courierName }}</td>
          <td>{{ formatWeight(order.weightGram) }}</td>
          <td class="fee">{{ formatMoney(order.quoteAmount) }}</td>
          <td>
            <span class="tag" :class="shippingStatusMeta(order.status).tag">
              <span class="d"></span>
              {{ shippingStatusMeta(order.status).label }}
            </span>
          </td>
          <td class="muted">{{ formatTime(order.createdAt) }}</td>
          <td class="right">
            <button
              v-if="order.status === 'CREATED'"
              v-perm="'shipping:pay'"
              class="op op-btn"
              type="button"
              :disabled="actionLoading === `pay:${order.id}`"
              @click="pay(order)"
            >
              收款
            </button>
            <button
              v-if="order.status === 'PAID'"
              v-perm="'shipping:collect'"
              class="op op-btn"
              type="button"
              :disabled="actionLoading === `collect:${order.id}`"
              @click="collect(order)"
            >
              揽收
            </button>
            <button class="op op-btn" type="button" @click="openDetail(order)">
              <Eye />
              详情
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!listLoading && rows.length === 0" class="empty compact-empty">
      <p>暂无寄件单。</p>
    </div>
    <div class="pager">
      <span class="total">共 {{ total }} 条 · 第 {{ page }} / {{ pageCount }} 页</span>
      <button class="pg nav-pg" type="button" @click="changePage(page - 1)">
        <ChevronLeft />
      </button>
      <button class="pg on" type="button">{{ page }}</button>
      <button class="pg nav-pg" type="button" @click="changePage(page + 1)">
        <ChevronRight />
      </button>
    </div>
  </section>

  <div v-if="detail" class="drawer parcel-drawer shipping-drawer">
    <div class="drawer-hd">
      <div>
        <span class="muted">寄件详情</span>
        <h2>{{ detail.orderNo }}</h2>
      </div>
      <button class="ibtn" type="button" aria-label="关闭" @click="detail = null">
        <X />
      </button>
    </div>
    <div class="drawer-bd">
      <div class="pickup-hero-lite">
        <span class="tag" :class="shippingStatusMeta(detail.status).tag">
          <span class="d"></span>
          {{ shippingStatusMeta(detail.status).label }}
        </span>
        <div class="pickup-code tnum">{{ formatMoney(detail.quoteAmount) }}</div>
        <p>{{ detail.courierName }} · {{ detail.waybillNo ?? '待生成运单' }}</p>
      </div>

      <div class="parcel-info-grid">
        <div class="cell">
          <div class="k">寄件人</div>
          <div class="v">{{ detail.senderJson.name }} · {{ detail.senderJson.phone }}</div>
        </div>
        <div class="cell">
          <div class="k">收件人</div>
          <div class="v">{{ detail.receiverJson.name }} · {{ detail.receiverJson.phone }}</div>
        </div>
        <div class="cell">
          <div class="k">寄件地址</div>
          <div class="v">
            {{ detail.senderJson.province }}{{ detail.senderJson.city }}{{ detail.senderJson.district
            }}{{ detail.senderJson.address }}
          </div>
        </div>
        <div class="cell">
          <div class="k">收件地址</div>
          <div class="v">
            {{ detail.receiverJson.province }}{{ detail.receiverJson.city }}{{ detail.receiverJson.district
            }}{{ detail.receiverJson.address }}
          </div>
        </div>
        <div class="cell">
          <div class="k">重量</div>
          <div class="v">{{ formatWeight(detail.weightGram) }}</div>
        </div>
        <div class="cell">
          <div class="k">下单时间</div>
          <div class="v">{{ formatTime(detail.createdAt) }}</div>
        </div>
      </div>

      <div class="drawer-actions">
        <button
          v-if="detail.status === 'CREATED'"
          v-perm="'shipping:pay'"
          class="btn btn-primary"
          type="button"
          :disabled="detailLoading || actionLoading === `pay:${detail.id}`"
          @click="pay(detail)"
        >
          <CircleDollarSign />
          收款
        </button>
        <button
          v-if="detail.status === 'PAID'"
          v-perm="'shipping:collect'"
          class="btn btn-accent"
          type="button"
          :disabled="detailLoading || actionLoading === `collect:${detail.id}`"
          @click="collect(detail)"
        >
          <Truck />
          揽收
        </button>
      </div>

      <section class="timeline-lite">
        <h3>物流轨迹</h3>
        <div v-if="detailLoading" class="empty compact-empty">
          <p>加载中...</p>
        </div>
        <div v-else-if="tracks.length === 0" class="empty compact-empty">
          <p>揽收后显示物流节点。</p>
        </div>
        <div v-else>
          <div v-for="track in tracks" :key="track.id" class="timeline-row">
            <span class="timeline-dot"></span>
            <div>
              <b>{{ track.description }}</b>
              <p>{{ track.location }} · {{ formatTime(track.happenedAt) }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
