import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { canUsePerm, vPerm } from './v-perm';
import { useAuthStore } from '@/stores/auth';

describe('v-perm directive', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('matches a single permission or any permission from a list', () => {
    expect(canUsePerm(['parcel:read'], 'parcel:read')).toBe(true);
    expect(canUsePerm(['parcel:read'], ['station:manage', 'parcel:read'])).toBe(true);
    expect(canUsePerm(['parcel:read'], 'station:manage')).toBe(false);
  });

  it('removes element when permission is missing', () => {
    const auth = useAuthStore();
    auth.perms = ['parcel:read'];
    const parent = document.createElement('div');
    const button = document.createElement('button');
    parent.appendChild(button);

    vPerm.mounted?.(button, { value: 'parcel:pickup', modifiers: {}, instance: null, dir: vPerm });

    expect(parent.contains(button)).toBe(false);
  });
});
