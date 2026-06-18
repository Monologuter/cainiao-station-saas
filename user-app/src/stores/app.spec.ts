import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { applyStoredTheme, isAppTheme, useAppStore } from './app';

describe('user-app theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    setActivePinia(createPinia());
  });

  it('uses light as the default theme and applies it before mount', () => {
    const theme = applyStoredTheme();

    expect(theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('persists the selected theme and reflects it on the root element', () => {
    const store = useAppStore();

    store.setTheme('dark');

    expect(store.theme).toBe('dark');
    expect(store.isDark).toBe(true);
    expect(localStorage.getItem('cn-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('toggles between light and dark', () => {
    const store = useAppStore();

    store.toggleTheme();
    expect(store.theme).toBe('dark');

    store.toggleTheme();
    expect(store.theme).toBe('light');
    expect(localStorage.getItem('cn-theme')).toBe('light');
  });

  it('ignores invalid persisted values and falls back to light', () => {
    localStorage.setItem('cn-theme', 'mint');

    expect(applyStoredTheme()).toBe('light');
    expect(localStorage.getItem('cn-theme')).toBe('light');
  });

  it('recognises only the supported themes', () => {
    expect(isAppTheme('light')).toBe(true);
    expect(isAppTheme('dark')).toBe(true);
    expect(isAppTheme('blue')).toBe(false);
    expect(isAppTheme(null)).toBe(false);
  });
});
