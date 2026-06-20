import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import StaffRolesView from './StaffRolesView.vue';
import { useAuthStore } from '@/stores/auth';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = {
    id: 'u1',
    username: '13622505569',
    tenantId: 'tenant-1',
    roles: ['店长'],
    perms: [],
    stations: [{ id: 'station-1', name: '城南综合驿站', code: 'CN-0731' }],
    isPlatform: false,
  };
  auth.perms = ['parcel:read', 'parcel:inbound', 'parcel:pickup'];

  return mount(StaffRolesView, {
    global: {
      plugins: [pinia],
    },
  });
}

describe('station staff roles page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens the create staff dialog from the primary action', async () => {
    const wrapper = mountView();

    await wrapper.get('[data-testid="create-staff"]').trigger('click');

    expect(wrapper.get('[data-testid="staff-modal"]').text()).toContain('新增员工');
    expect(wrapper.get('input[placeholder="员工登录账号"]').exists()).toBe(true);
  });
});
