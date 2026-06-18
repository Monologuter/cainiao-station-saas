import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { canUsePerm, vPerm } from './v-perm';
import { useAuthStore } from '@/stores/auth';

const noopBinding = (value: unknown, modifiers: Record<string, boolean> = {}) => ({
  value,
  modifiers,
  instance: null,
  dir: vPerm,
  oldValue: undefined,
}) as never;

describe('v-perm directive', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('matches a single permission or any permission from a list', () => {
    expect(canUsePerm(['parcel:read'], 'parcel:read')).toBe(true);
    expect(canUsePerm(['parcel:read'], ['station:manage', 'parcel:read'])).toBe(true);
    expect(canUsePerm(['parcel:read'], 'station:manage')).toBe(false);
  });

  it('replaces element with a placeholder when permission is missing', () => {
    const auth = useAuthStore();
    auth.perms = ['parcel:read'];
    const parent = document.createElement('div');
    const button = document.createElement('button');
    parent.appendChild(button);

    vPerm.mounted?.(button, noopBinding('parcel:pickup'));

    // The element is detached but the slot is preserved by a comment node.
    expect(parent.contains(button)).toBe(false);
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild?.nodeType).toBe(Node.COMMENT_NODE);
  });

  it('restores a hidden element once permissions arrive asynchronously', () => {
    const auth = useAuthStore();
    // perms not loaded yet
    auth.perms = [];
    const parent = document.createElement('div');
    const button = document.createElement('button');
    parent.appendChild(button);

    // Mounted before perms load -> hidden via placeholder.
    vPerm.mounted?.(button, noopBinding('parcel:pickup'));
    expect(parent.contains(button)).toBe(false);

    // Perms arrive and a re-render fires the updated hook.
    auth.perms = ['parcel:pickup'];
    vPerm.updated?.(button, noopBinding('parcel:pickup'));

    expect(parent.contains(button)).toBe(true);
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toBe(button);
  });

  it('hides again when permission is later revoked', () => {
    const auth = useAuthStore();
    auth.perms = ['parcel:pickup'];
    const parent = document.createElement('div');
    const button = document.createElement('button');
    parent.appendChild(button);

    vPerm.mounted?.(button, noopBinding('parcel:pickup'));
    expect(parent.contains(button)).toBe(true);

    auth.perms = [];
    vPerm.updated?.(button, noopBinding('parcel:pickup'));
    expect(parent.contains(button)).toBe(false);
  });

  it('toggles disabled state instead of removing with the .disable modifier', () => {
    const auth = useAuthStore();
    auth.perms = [];
    const parent = document.createElement('div');
    const button = document.createElement('button');
    parent.appendChild(button);

    vPerm.mounted?.(button, noopBinding('parcel:pickup', { disable: true }));
    expect(parent.contains(button)).toBe(true);
    expect(button.getAttribute('disabled')).toBe('true');
    expect(button.classList.contains('is-perm-disabled')).toBe(true);

    // Permission arrives -> the disabled state is cleared.
    auth.perms = ['parcel:pickup'];
    vPerm.updated?.(button, noopBinding('parcel:pickup', { disable: true }));
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.classList.contains('is-perm-disabled')).toBe(false);
  });
});
