export function reportStatusMeta(status?: string | null) {
  const metas: Record<string, { label: string; tag: string }> = {
    PENDING: { label: '待生成', tag: 'amber' },
    RUNNING: { label: '生成中', tag: 'blue' },
    READY: { label: '就绪', tag: 'green' },
    DONE: { label: '已完成', tag: 'green' },
    FAILED: { label: '失败', tag: 'red' },
  };
  return metas[status ?? 'READY'] ?? { label: '未知状态', tag: 'gray' };
}

export function forecastMethodLabel(method?: string | null) {
  const labels: Record<string, string> = {
    MA: '移动平均',
    HOLT_WINTERS: '三指数平滑',
    FALLBACK_MEAN: '基础均值',
  };
  return labels[method ?? ''] ?? '未知算法';
}

export function slotStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    FREE: '空闲',
    OCCUPIED: '已占用',
    DISABLED: '已停用',
    RESERVED: '已预留',
  };
  return labels[status ?? ''] ?? '未知状态';
}
