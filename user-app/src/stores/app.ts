import { defineStore } from 'pinia';

export const appThemes = ['light', 'dark'] as const;
export type AppTheme = (typeof appThemes)[number];

const THEME_STORAGE_KEY = 'cn-theme';
const DEFAULT_THEME: AppTheme = 'light';

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && appThemes.includes(value as AppTheme);
}

/** uni.setStorageSync 在 H5/小程序均可用；测试环境无 uni 时回退到 localStorage。 */
function readStoredTheme(): string | null {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      return (uni.getStorageSync(THEME_STORAGE_KEY) as string) || null;
    }
  } catch {
    /* ignore storage read failures */
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(THEME_STORAGE_KEY);
  }
  return null;
}

function writeStoredTheme(theme: AppTheme): void {
  try {
    if (typeof uni !== 'undefined' && typeof uni.setStorageSync === 'function') {
      uni.setStorageSync(THEME_STORAGE_KEY, theme);
      return;
    }
  } catch {
    /* ignore storage write failures */
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

/** 把主题写到 H5 根节点的 data-theme（与 design/mockups/theme-switch-demo.html 口径一致）。 */
function applyDataTheme(theme: AppTheme): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = theme;
  }
}

export function applyTheme(theme: AppTheme): void {
  applyDataTheme(theme);
  writeStoredTheme(theme);
}

/** 读取持久化主题并应用，无/非法值时回退到默认浅色。 */
export function applyStoredTheme(): AppTheme {
  const stored = readStoredTheme();
  const theme = isAppTheme(stored) ? stored : DEFAULT_THEME;
  applyTheme(theme);
  return theme;
}

export const useAppStore = defineStore('app', {
  state: () => ({
    theme: applyStoredTheme(),
  }),
  getters: {
    isDark: (state): boolean => state.theme === 'dark',
  },
  actions: {
    setTheme(theme: AppTheme) {
      this.theme = theme;
      applyTheme(theme);
    },
    toggleTheme() {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
    },
  },
});
