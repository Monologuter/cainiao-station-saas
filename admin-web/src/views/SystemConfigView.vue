<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { RotateCcw, Save, Settings2 } from "lucide-vue-next";
import {
  channelConfigsApi,
  dictionariesApi,
  dictItemsApi,
  notifyTemplatesApi,
  systemConfigsApi,
  updateChannelConfigApi,
  updateDictItemApi,
  updateNotifyTemplateApi,
  updateSystemConfigApi,
  type ChannelConfig,
  type DictItem,
  type Dictionary,
  type NotifyTemplate,
  type SystemConfig,
} from "@/api/config";

const loading = ref(false);
const tab = ref<"system" | "dict" | "channels" | "templates">("system");
const systemConfigs = ref<SystemConfig[]>([]);
const channels = ref<ChannelConfig[]>([]);
const dictionaries = ref<Dictionary[]>([]);
const selectedDictType = ref("exception_type");
const dictItems = ref<DictItem[]>([]);
const templates = ref<NotifyTemplate[]>([]);

const groupedSystemConfigs = computed(() => {
  const groups = new Map<string, SystemConfig[]>();
  for (const item of systemConfigs.value) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [systemRows, channelRows, dictionaryRows, templateRows] =
      await Promise.all([
        systemConfigsApi(),
        channelConfigsApi(),
        dictionariesApi(),
        notifyTemplatesApi(),
      ]);
    systemConfigs.value = systemRows;
    channels.value = channelRows;
    dictionaries.value = dictionaryRows;
    selectedDictType.value = dictionaryRows[0]?.type || selectedDictType.value;
    templates.value = templateRows;
    await loadDictItems();
  } finally {
    loading.value = false;
  }
}

async function loadDictItems(type = selectedDictType.value) {
  selectedDictType.value = type;
  dictItems.value = type ? await dictItemsApi(type) : [];
}

async function saveSystemConfig(item: SystemConfig) {
  const updated = await updateSystemConfigApi(item.configKey, item.value);
  Object.assign(item, updated);
  ElMessage.success("系统参数已保存");
}

async function saveChannel(item: ChannelConfig) {
  const updated = await updateChannelConfigApi(item.channel, {
    provider: item.provider,
    enabled: item.enabled,
    fallbackProvider: item.fallbackProvider,
  });
  Object.assign(item, updated);
  ElMessage.success("渠道配置已生效");
}

async function toggleDictItem(item: DictItem) {
  const updated = await updateDictItemApi(item.id, {
    label: item.label,
    enabled: item.enabled,
    sort: item.sort,
  });
  Object.assign(item, updated);
  ElMessage.success("字典项已更新");
}

async function saveTemplate(item: NotifyTemplate) {
  const updated = await updateNotifyTemplateApi(item.id, {
    content: item.content,
    enabled: item.enabled,
  });
  Object.assign(item, updated);
  ElMessage.success("通知模板已保存");
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">系统 / 系统配置</div>
      <h1>系统配置</h1>
    </div>
    <div class="toolbar">
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
    </div>
  </section>

  <section class="table-card config-panel">
    <div class="tabs">
      <button class="tab" :class="{ on: tab === 'system' }" @click="tab = 'system'">系统参数</button>
      <button class="tab" :class="{ on: tab === 'dict' }" @click="tab = 'dict'">数据字典</button>
      <button class="tab" :class="{ on: tab === 'channels' }" @click="tab = 'channels'">渠道开关</button>
      <button class="tab" :class="{ on: tab === 'templates' }" @click="tab = 'templates'">通知模板</button>
    </div>

    <div v-if="tab === 'system'" class="config-section">
      <section v-for="group in groupedSystemConfigs" :key="group.group" class="config-group">
        <h3><Settings2 /> {{ group.group }}</h3>
        <div class="table-card">
          <table>
            <thead>
              <tr>
                <th>参数</th>
                <th>当前值</th>
                <th>生效值</th>
                <th>类型</th>
                <th>说明</th>
                <th style="text-align: right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in group.items" :key="item.id">
                <td>
                  <b>{{ item.name }}</b>
                  <span class="muted config-key">{{ item.configKey }}</span>
                </td>
                <td>
                  <input
                    v-model="item.value"
                    class="input config-value"
                    :disabled="!item.editable"
                    :type="item.valueType === 'NUMBER' ? 'number' : 'text'"
                  />
                </td>
                <td class="tnum">{{ displayValue(item.effectiveValue) }}</td>
                <td><span class="tag blue">{{ item.valueType }}</span></td>
                <td class="muted">{{ item.description || "-" }}</td>
                <td style="text-align: right">
                  <button class="btn btn-sm" type="button" :disabled="!item.editable" @click="saveSystemConfig(item)">
                    <Save /> 保存
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div v-else-if="tab === 'dict'" class="config-dict">
      <aside class="dict-list">
        <button
          v-for="dictionary in dictionaries"
          :key="dictionary.type"
          type="button"
          :class="{ on: dictionary.type === selectedDictType }"
          @click="loadDictItems(dictionary.type)"
        >
          <b>{{ dictionary.name }}</b>
          <span>{{ dictionary.type }}</span>
        </button>
      </aside>
      <section class="table-card dict-table">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>排序</th>
              <th>启用</th>
              <th style="text-align: right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in dictItems" :key="item.id">
              <td class="code">{{ item.code }}</td>
              <td><input v-model="item.label" class="input config-value" /></td>
              <td><input v-model.number="item.sort" class="input mini-input" type="number" /></td>
              <td><input v-model="item.enabled" type="checkbox" /></td>
              <td style="text-align: right">
                <button class="btn btn-sm" type="button" @click="toggleDictItem(item)">
                  <Save /> 保存
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div v-else-if="tab === 'channels'" class="config-section">
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>渠道</th>
              <th>Provider</th>
              <th>Fallback</th>
              <th>启用</th>
              <th>说明</th>
              <th style="text-align: right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in channels" :key="item.channel">
              <td class="code">{{ item.channel }}</td>
              <td>
                <select v-model="item.provider" class="input config-value">
                  <option v-for="provider in item.registeredProviders" :key="provider" :value="provider">
                    {{ provider }}
                  </option>
                </select>
              </td>
              <td>
                <select v-model="item.fallbackProvider" class="input config-value">
                  <option v-for="provider in item.registeredProviders" :key="provider" :value="provider">
                    {{ provider }}
                  </option>
                </select>
              </td>
              <td><input v-model="item.enabled" type="checkbox" /></td>
              <td class="muted">{{ item.description || "-" }}</td>
              <td style="text-align: right">
                <button class="btn btn-sm" type="button" @click="saveChannel(item)">
                  <Save /> 切换
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="config-section">
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>Scene</th>
              <th>渠道</th>
              <th>内容</th>
              <th>启用</th>
              <th style="text-align: right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in templates" :key="item.id">
              <td class="code">{{ item.code }}</td>
              <td><span class="tag purple">{{ item.channel }}</span></td>
              <td><textarea v-model="item.content" class="input template-input" rows="2" /></td>
              <td><input v-model="item.enabled" type="checkbox" /></td>
              <td style="text-align: right">
                <button class="btn btn-sm" type="button" @click="saveTemplate(item)">
                  <Save /> 保存
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
