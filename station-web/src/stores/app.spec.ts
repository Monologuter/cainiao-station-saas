import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { applyStoredTheme, useAppStore } from './app';

describe('app theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    setActivePinia(createPinia());
  });

  it('uses blue as the default theme and applies it before mount', () => {
    const theme = applyStoredTheme();

    expect(theme).toBe('blue');
    expect(document.documentElement.dataset.theme).toBe('blue');
  });

  it('persists selected station-web theme', () => {
    const store = useAppStore();

    store.setTheme('dark');

    expect(store.theme).toBe('dark');
    expect(localStorage.getItem('cn-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('cn-theme', 'purple');

    expect(applyStoredTheme()).toBe('blue');
    expect(localStorage.getItem('cn-theme')).toBe('blue');
  });
});
