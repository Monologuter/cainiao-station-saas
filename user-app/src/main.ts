import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { applyStoredTheme } from './stores/app';
import './styles/theme.css';

export function createApp() {
  // 在挂载前应用持久化主题，避免首屏闪烁
  applyStoredTheme();
  const app = createSSRApp(App);
  app.use(createPinia());
  return { app };
}
