import { defineStore } from 'pinia';

export const stationThemes = ['blue', 'dark', 'mint'] as const;
export type StationTheme = (typeof stationThemes)[number];

const THEME_STORAGE_KEY = 'cn-theme';
const DEFAULT_THEME: StationTheme = 'blue';

export function isStationTheme(value: unknown): value is StationTheme {
  return typeof value === 'string' && stationThemes.includes(value as StationTheme);
}

export function applyTheme(theme: StationTheme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function applyStoredTheme(): StationTheme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = isStationTheme(stored) ? stored : DEFAULT_THEME;
  applyTheme(theme);
  return theme;
}

export const useAppStore = defineStore('app', {
  state: () => ({
    theme: applyStoredTheme(),
    sidebarCollapsed: false,
    currentStationId: '',
  }),
  actions: {
    setTheme(theme: StationTheme) {
      this.theme = theme;
      applyTheme(theme);
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },
  },
});
