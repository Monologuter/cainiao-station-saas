<script setup lang="ts">
import {
  BadgeCheck,
  Box,
  ClockAlert,
  PackageCheck,
  ScanLine,
} from 'lucide-vue-next';

const kpis = [
  { label: '今日入库', value: '128', delta: '↑ 12% 较昨日', icon: ScanLine },
  { label: '今日出库', value: '96', delta: '↑ 8% 较昨日', icon: PackageCheck },
  { label: '在库待取', value: '342', delta: '货位占用 71%', icon: Box },
  { label: '取件率', value: '89%', delta: '↑ 4% 较昨日', icon: BadgeCheck },
  { label: '滞留预警', value: '7', delta: '超3天待催取', icon: ClockAlert, warn: true },
];

const rows = [
  ['8-2-1043', '王**', '6688', '中通', 'A-12-3', '在库待取'],
  ['8-2-1042', '李**', '3421', '圆通', 'A-12-2', '在库待取'],
  ['8-1-0975', '张**', '1209', '京东', 'B-04-7', '已取件'],
  ['7-9-0820', '陈**', '5567', '申通', 'C-01-1', '滞留3天'],
  ['8-2-1041', '赵**', '8890', '韵达', 'A-11-9', '在库待取'],
];
</script>

<template>
  <section class="kpi-row">
    <article v-for="item in kpis" :key="item.label" class="kpi" :class="{ warn: item.warn }">
      <div class="lab">
        <i><component :is="item.icon" /></i>
        {{ item.label }}
      </div>
      <div class="num tnum">{{ item.value }}</div>
      <div class="delta">{{ item.delta }}</div>
    </article>
  </section>

  <section class="shell-grid">
    <div class="table-card">
      <div class="card-hd">
        <h2>最近入库</h2>
        <span class="link">查看全部</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>取件码</th>
            <th>收件人</th>
            <th>手机尾号</th>
            <th>快递</th>
            <th>货位</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row[0]">
            <td class="code">{{ row[0] }}</td>
            <td>{{ row[1] }}</td>
            <td>{{ row[2] }}</td>
            <td>{{ row[3] }}</td>
            <td>{{ row[4] }}</td>
            <td>
              <span class="tag" :class="row[5] === '已取件' ? 'green' : row[5].startsWith('滞留') ? 'red' : 'blue'">
                <span class="d"></span>
                {{ row[5] }}
              </span>
            </td>
            <td><span class="op">详情</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <aside class="quick-panel">
      <button class="qbtn qbtn-primary" type="button">
        <ScanLine />
        <span>
          <b>扫码入库</b>
          <small>扫码枪 / 手动录入</small>
        </span>
      </button>
      <button class="qbtn qbtn-accent" type="button">
        <BadgeCheck />
        <span>
          <b>取件核销</b>
          <small>取件码 / 手机尾号</small>
        </span>
      </button>
    </aside>
  </section>
</template>
