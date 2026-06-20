import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DefaultLayout from './DefaultLayout.vue';
import { useAuthStore } from '@/stores/auth';

const route = reactive({ path: '/workbench', fullPath: '/workbench' });
const push = vi.fn();
const replace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}));

function mountLayout() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.menus = [{ group: '代收业务', items: [] }];
  auth.perms = [];
  auth.user = {
    id: 'u1',
    username: 'station-boss',
    tenantId: 'tenant-1',
    roles: ['TENANT_BOSS'],
    perms: [],
    stations: [{ id: 'station-1', name: '城南综合驿站', code: 'CN-0731' }],
    isPlatform: false,
  };

  return mount(DefaultLayout, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        RouterView: { template: '<main data-testid="route-outlet" />' },
      },
    },
  });
}

describe('station default layout notifications', () => {
  beforeEach(() => {
    route.path = '/workbench';
    route.fullPath = '/workbench';
    push.mockReset();
    replace.mockReset();
    localStorage.clear();
  });

  it('opens station notices and marks them read', async () => {
    const wrapper = mountLayout();

    expect(wrapper.find('[data-testid="notice-panel"]').exists()).toBe(false);
    expect(wrapper.find('.ibtn .dot').exists()).toBe(true);

    await wrapper.get('button[aria-label="通知"]').trigger('click');

    expect(wrapper.get('[data-testid="notice-panel"]').text()).toContain('站内消息');
    expect(wrapper.get('[data-testid="notice-panel"]').text()).toContain('滞留件待处理');

    await wrapper.get('.notice-hd .op').trigger('click');

    expect(wrapper.find('.ibtn .dot').exists()).toBe(false);
  });

  it('submits the global parcel search keyword', async () => {
    const wrapper = mountLayout();

    await wrapper.get('[data-testid="global-search-input"]').setValue('6522');
    await wrapper.get('[data-testid="global-search-input"]').trigger('keydown.enter');

    expect(push).toHaveBeenCalledWith({ path: '/parcels', query: { keyword: '6522' } });
  });

  it('opens the account menu from the top identity chip', async () => {
    const wrapper = mountLayout();

    expect(wrapper.find('[data-testid="account-panel"]').exists()).toBe(false);

    await wrapper.get('button[aria-label="账号菜单"]').trigger('click');

    expect(wrapper.get('[data-testid="account-panel"]').text()).toContain('员工权限');
    expect(wrapper.get('[data-testid="account-panel"]').text()).toContain('门店设置');
    expect(wrapper.get('[data-testid="account-panel"]').text()).toContain('退出登录');

    await wrapper.get('[data-testid="account-panel"] .account-item').trigger('click');

    expect(push).toHaveBeenCalledWith('/staff-roles');
  });

  it('opens station settings from the station summary', async () => {
    const wrapper = mountLayout();

    expect(wrapper.get('.identity-chip').text()).toContain('店长');
    expect(wrapper.get('.station-summary').text()).toContain('设置');

    await wrapper.get('.station-summary').trigger('click');

    expect(push).toHaveBeenCalledWith('/settings');
    expect(replace).not.toHaveBeenCalled();
  });

  it('logs out from the account menu', async () => {
    const wrapper = mountLayout();

    await wrapper.get('button[aria-label="账号菜单"]').trigger('click');
    await wrapper.get('.account-item.danger').trigger('click');

    expect(replace).toHaveBeenCalledWith('/login');
  });
});
