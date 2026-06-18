import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "./styles/app.css";
import App from "./App.vue";
import router from "./router";
import { bindAuthToHttp } from "./stores/auth";

const app = createApp(App);

app.use(createPinia());
// pinia 安装后，把 auth store 的刷新/过期回调注册进 http 401 拦截器。
bindAuthToHttp();
app.use(router);
app.use(ElementPlus);

app.mount("#app");
