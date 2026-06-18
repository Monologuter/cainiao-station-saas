import { http } from "./http";
import { toAdminAnalyticsQueryParams } from "./analytics";

export interface Dictionary {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  sort: number;
}

export interface DictItem {
  id: string;
  dictionaryId: string;
  code: string;
  label: string;
  value?: unknown;
  enabled: boolean;
  sort: number;
}

export interface SystemConfig {
  id: string;
  configKey: string;
  group: string;
  name: string;
  value: unknown;
  defaultValue: unknown;
  effectiveValue: unknown;
  valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
  editable: boolean;
  secret: boolean;
  description?: string | null;
}

export interface ChannelConfig {
  id: string;
  channel: string;
  provider: string;
  enabled: boolean;
  fallbackProvider?: string | null;
  registeredProviders: string[];
  description?: string | null;
}

export interface NotifyTemplate {
  id: string;
  code: string;
  channel: "IN_APP" | "SMS";
  content: string;
  enabled: boolean;
}

export function systemConfigsApi() {
  return http.get<never, SystemConfig[]>("/admin/config/system");
}

export function updateSystemConfigApi(key: string, value: unknown) {
  return http.patch<never, SystemConfig>(`/admin/config/system/${key}`, {
    value,
  });
}

export function dictionariesApi() {
  return http.get<never, Dictionary[]>("/admin/config/dictionaries");
}

export function dictItemsApi(type: string) {
  return http.get<never, DictItem[]>(
    `/admin/config/dictionaries/${type}/items`,
  );
}

export function createDictItemApi(type: string, input: Partial<DictItem>) {
  return http.post<never, DictItem>(
    `/admin/config/dictionaries/${type}/items`,
    input,
  );
}

export function updateDictItemApi(id: string, input: Partial<DictItem>) {
  return http.patch<never, DictItem>(`/admin/config/dict-items/${id}`, input);
}

export function channelConfigsApi() {
  return http.get<never, ChannelConfig[]>("/admin/config/channels");
}

export function updateChannelConfigApi(
  channel: string,
  input: Partial<ChannelConfig>,
) {
  return http.patch<never, ChannelConfig>(
    `/admin/config/channels/${channel}`,
    input,
  );
}

export function notifyTemplatesApi(query: Record<string, unknown> = {}) {
  return http.get<never, NotifyTemplate[]>("/admin/config/notify-templates", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function createNotifyTemplateApi(input: Partial<NotifyTemplate>) {
  return http.post<never, NotifyTemplate>(
    "/admin/config/notify-templates",
    input,
  );
}

export function updateNotifyTemplateApi(
  id: string,
  input: Partial<NotifyTemplate>,
) {
  return http.patch<never, NotifyTemplate>(
    `/admin/config/notify-templates/${id}`,
    input,
  );
}
