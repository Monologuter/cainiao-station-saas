import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkbenchView from './WorkbenchView.vue';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/api/analytics', () => ({
  overviewApi: vi.fn().mockResolvedValue({
    inboundToday: 1,
    pickedToday: 1,
    inStock: 0,
    pickupRate: 1,
    overdueCount: 0,
    notifyToday: 2,
  }),
  overviewToKpis: vi.fn((overview) => [
    { label: '今日入库', value: overview.inboundToday, delta: '通知 2 次' },
    { label: '今日出库', value: overview.pickedToday, delta: '核销完成' },
    { label: '在库待取', value: overview.inStock, delta: '当前租户库存' },
    { label: '取件率', value: '100%', delta: '今日闭环效率' },
    { label: '滞留预警', value: overview.overdueCount, delta: '超3天待催取', warn: true },
  ]),
}));

vi.mock('@/api/parcel', () => ({
  listParcelsApi: vi.fn().mockResolvedValue({ list: [] }),
  parcelStatusMeta: vi.fn(() => ({ label: '在库', tag: 'green' })),
}));

describe('station workbench quick actions', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('navigates from quick inbound and pickup actions', async () => {
    const wrapper = mount(WorkbenchView);

    await wrapper.get('[data-testid="quick-inbound"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/inbound');

    await wrapper.get('[data-testid="quick-pickup"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/pickup');
  });
});
