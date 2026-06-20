export function tenantStatusMeta(status?: string | null) {
  const metas: Record<string, { label: string; tag: string }> = {
    ACTIVE: { label: '正常', tag: 'green' },
    SUSPENDED: { label: '停用', tag: 'amber' },
    CLOSED: { label: '关闭', tag: 'gray' },
  };
  return metas[status ?? ''] ?? { label: '未知状态', tag: 'gray' };
}

export function planStatusMeta(status?: string | null) {
  const metas: Record<string, { label: string; tag: string }> = {
    ACTIVE: { label: '在售', tag: 'green' },
    ARCHIVED: { label: '已归档', tag: 'gray' },
    DRAFT: { label: '草稿', tag: 'amber' },
  };
  return metas[status ?? ''] ?? { label: '未知状态', tag: 'gray' };
}

export function billingStatusMeta(status?: string | null) {
  const metas: Record<string, { label: string; tag: string }> = {
    ACTIVE: { label: '生效中', tag: 'green' },
    TRIALING: { label: '试用中', tag: 'green' },
    PAST_DUE: { label: '逾期未付', tag: 'amber' },
    SUSPENDED: { label: '已暂停', tag: 'red' },
    CANCELED: { label: '已取消', tag: 'gray' },
    OPEN: { label: '待支付', tag: 'blue' },
    OVERDUE: { label: '已逾期', tag: 'red' },
    PAID: { label: '已支付', tag: 'green' },
    VOID: { label: '已作废', tag: 'gray' },
  };
  return metas[status ?? ''] ?? { label: '未知状态', tag: 'gray' };
}

export function platformUserStatusMeta(status?: string | null) {
  const metas: Record<string, { label: string; tag: string }> = {
    active: { label: '启用', tag: 'green' },
    inactive: { label: '停用', tag: 'amber' },
    disabled: { label: '停用', tag: 'amber' },
    ACTIVE: { label: '启用', tag: 'green' },
    INACTIVE: { label: '停用', tag: 'amber' },
    DISABLED: { label: '停用', tag: 'amber' },
  };
  return metas[status ?? ''] ?? { label: '未知状态', tag: 'gray' };
}
