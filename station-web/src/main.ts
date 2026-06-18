import { createApp } from 'vue';
import { createPinia } from 'pinia';
// Element Plus 按需引入：组件与命令式 API 均从各自子路径显式 import（见各视图 / api/http.ts），
// 不再 app.use(ElementPlus) 与导入整库 element-plus/dist/index.css，仅按需引入用到组件的样式。
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-message-box.css';
import 'element-plus/theme-chalk/el-overlay.css';
import 'element-plus/theme-chalk/el-empty.css';
import './styles/theme.css';
import './styles/kit.css';
import './styles/element-override.css';
import './styles/app.css';
import App from './App.vue';
import { installPermDirective } from './directives/v-perm';
import { router } from './router';
import { applyStoredTheme } from './stores/app';

applyStoredTheme();

const app = createApp(App);
app.use(createPinia()).use(router);
installPermDirective(app);
app.mount('#app');
