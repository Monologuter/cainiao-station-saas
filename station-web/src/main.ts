import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/theme.css';
import './styles/kit.css';
import './styles/element-override.css';
import './styles/app.css';
import App from './App.vue';
import { router } from './router';
import { applyStoredTheme } from './stores/app';

applyStoredTheme();

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app');
