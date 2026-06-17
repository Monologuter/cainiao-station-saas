<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { ShippingAddress, ShippingQuote } from '@/api/shipping';
import { useShippingStore } from '@/store/shipping';

const shipping = useShippingStore();
const loading = ref(false);
const paying = ref(false);
const selected = ref<ShippingQuote | null>(null);

const emptyAddress = (): ShippingAddress => ({
  name: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  address: '',
});

const form = reactive({
  stationId: uni.getStorageSync('cn_ship_station_id') || '',
  sender: {
    name: '',
    phone: '',
    province: '湖南省',
    city: '长沙市',
    district: '',
    address: '',
  } as ShippingAddress,
  receiver: emptyAddress(),
  itemType: '日用品',
  weightGram: 1000,
  declaredValue: undefined as number | undefined,
});

const amount = computed(() => selected.value?.amount ?? shipping.current?.quoteAmount ?? 0);

function validAddress(address: ShippingAddress, title: string) {
  if (!address.name || !/^1\d{10}$/.test(address.phone)) {
    uni.showToast({ title: `请填写${title}姓名和手机号`, icon: 'none' });
    return false;
  }
  if (!address.province || !address.city || !address.district || !address.address) {
    uni.showToast({ title: `请补全${title}地址`, icon: 'none' });
    return false;
  }
  return true;
}

function validate() {
  if (!form.stationId) {
    uni.showToast({ title: '请填写寄件门店 ID', icon: 'none' });
    return false;
  }
  if (!validAddress(form.sender, '寄件人') || !validAddress(form.receiver, '收件人')) {
    return false;
  }
  if (!Number.isInteger(form.weightGram) || form.weightGram <= 0) {
    uni.showToast({ title: '重量必须大于 0 克', icon: 'none' });
    return false;
  }
  return true;
}

async function quote() {
  if (!validate()) {
    return;
  }
  loading.value = true;
  try {
    uni.setStorageSync('cn_ship_station_id', form.stationId);
    const quotes = await shipping.quote({
      stationId: form.stationId,
      sender: form.sender,
      receiver: form.receiver,
      weightGram: Number(form.weightGram),
      preference: 'balanced',
    });
    selected.value = quotes[0] ?? null;
    uni.showToast({ title: '报价已更新', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!validate()) {
    return;
  }
  if (!selected.value) {
    await quote();
  }
  if (!selected.value) {
    uni.showToast({ title: '暂无可用报价', icon: 'none' });
    return;
  }
  paying.value = true;
  try {
    const order = await shipping.create({
      stationId: form.stationId,
      courierCode: selected.value.courierCode,
      sender: form.sender,
      receiver: form.receiver,
      item: {
        type: form.itemType,
        weightGram: Number(form.weightGram),
        declaredValue: form.declaredValue ? Number(form.declaredValue) : undefined,
      },
    });
    await shipping.pay(order.id);
    uni.redirectTo({ url: `/pages/tracking/index?id=${order.id}` });
  } finally {
    paying.value = false;
  }
}

function goOrders() {
  uni.navigateTo({ url: '/pages/ship-orders/index' });
}
</script>

<template>
  <view class="mobile-page ship-page">
    <view class="mobile-card hero-card ship-hero">
      <text class="eyebrow">在线寄件</text>
      <text class="title">比价后立即下单</text>
      <text class="desc">Mock 支付会即时成功，揽收后可查看物流轨迹。</text>
    </view>

    <view class="mobile-card form-card">
      <input v-model="form.stationId" class="mobile-input" placeholder="寄件门店 ID" />
      <view class="section-title">寄件人</view>
      <input v-model="form.sender.name" class="mobile-input" placeholder="姓名" />
      <input v-model="form.sender.phone" class="mobile-input" placeholder="手机号" type="number" />
      <view class="triple-row">
        <input v-model="form.sender.province" class="mobile-input" placeholder="省" />
        <input v-model="form.sender.city" class="mobile-input" placeholder="市" />
        <input v-model="form.sender.district" class="mobile-input" placeholder="区" />
      </view>
      <input v-model="form.sender.address" class="mobile-input" placeholder="详细地址" />

      <view class="section-title">收件人</view>
      <input v-model="form.receiver.name" class="mobile-input" placeholder="姓名" />
      <input v-model="form.receiver.phone" class="mobile-input" placeholder="手机号" type="number" />
      <view class="triple-row">
        <input v-model="form.receiver.province" class="mobile-input" placeholder="省" />
        <input v-model="form.receiver.city" class="mobile-input" placeholder="市" />
        <input v-model="form.receiver.district" class="mobile-input" placeholder="区" />
      </view>
      <input v-model="form.receiver.address" class="mobile-input" placeholder="详细地址" />

      <view class="section-title">物品信息</view>
      <view class="dual-row">
        <input v-model="form.itemType" class="mobile-input" placeholder="物品类型" />
        <input v-model.number="form.weightGram" class="mobile-input" placeholder="重量克数" type="number" />
      </view>
      <input v-model.number="form.declaredValue" class="mobile-input" placeholder="声明价值，可选" type="number" />

      <button class="primary-btn" type="button" :disabled="loading" @click="quote">
        {{ loading ? '比价中' : '获取报价' }}
      </button>
    </view>

    <view v-if="shipping.quotes.length > 0" class="quote-stack">
      <button
        v-for="item in shipping.quotes"
        :key="item.courierCode"
        class="mobile-card quote-mobile"
        :class="{ on: selected?.courierCode === item.courierCode }"
        type="button"
        @click="selected = item"
      >
        <text class="quote-name">{{ item.courierName }}</text>
        <text class="quote-meta">{{ item.zone }} · 约 {{ item.estHours }} 小时</text>
        <text class="quote-amount">¥{{ item.amount.toFixed(2) }}</text>
      </button>
    </view>

    <view class="checkout-mobile">
      <view>
        <text class="checkout-label">预估费用</text>
        <text class="checkout-amount">¥{{ amount.toFixed(2) }}</text>
      </view>
      <button class="primary-btn pay-mobile" type="button" :disabled="paying" @click="submit">
        {{ paying ? '支付中' : '下单并支付' }}
      </button>
    </view>

    <button class="plain-link" type="button" @click="goOrders">查看我的寄件</button>
  </view>
</template>
