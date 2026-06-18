<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  Eye,
  EyeOff,
  LogIn,
  Lock,
  Network,
  LineChart,
  Package,
  ShieldCheck,
  User,
} from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({
  username: "admin",
  password: "admin123456",
});
const showPassword = ref(false);
const remember = ref(true);
const submitting = ref(false);

async function onSubmit() {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning("请输入账号和密码");
    return;
  }
  submitting.value = true;
  try {
    await auth.login({
      username: form.username.trim(),
      password: form.password,
    });
    ElMessage.success("登录成功");
    const redirect = (route.query.redirect as string) || "/overview";
    await router.replace(redirect);
  } catch {
    // http 拦截器已弹出后端错误信息
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login">
    <!-- 左栏：品牌区 -->
    <aside class="brand-pane">
      <div class="brand-glow g1"></div>
      <div class="brand-glow g2"></div>

      <div class="bp-top">
        <div class="bp-logo"><Package /></div>
        <div class="t">
          <b>菜鸟驿站 · 平台运营后台</b>
          <span>Cainiao Station · Operation Console</span>
        </div>
      </div>

      <div class="bp-mid">
        <h2>连接每一个<em>社区驿站</em></h2>
        <p class="slogan">
          一站式管理租户、门店、订阅与运营审计，让每一个驿站高效协同。
        </p>
        <div class="bp-feats">
          <div class="bp-feat">
            <i><Network /></i>
            <span>统一纳管全国社区驿站网络</span>
          </div>
          <div class="bp-feat">
            <i><LineChart /></i>
            <span>实时运营数据与经营监控大盘</span>
          </div>
          <div class="bp-feat">
            <i><ShieldCheck /></i>
            <span>全链路操作审计与权限治理</span>
          </div>
        </div>
      </div>

      <div class="bp-foot">
        <span>SaaS 运营管理平台</span>
        <span class="dot"><b></b>系统状态正常 · v2.6</span>
      </div>
    </aside>

    <!-- 右栏：登录卡 -->
    <main class="form-pane">
      <div class="login-card">
        <div class="lc-hd">
          <h1>平台登录</h1>
          <p>仅限平台运营人员访问</p>
        </div>

        <form class="login-form" @submit.prevent="onSubmit">
          <div class="field">
            <label>账号<span class="req">*</span></label>
            <div class="input-wrap">
              <User class="lead" />
              <input
                v-model="form.username"
                class="input"
                type="text"
                autocomplete="username"
                placeholder="请输入运营账号 / 邮箱"
              />
            </div>
          </div>

          <div class="field">
            <label>密码<span class="req">*</span></label>
            <div class="input-wrap has-tail">
              <Lock class="lead" />
              <input
                v-model="form.password"
                class="input"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入登录密码"
              />
              <button
                type="button"
                class="tail"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" />
                <Eye v-else />
              </button>
            </div>
          </div>

          <div class="row-between">
            <label class="remember" @click="remember = !remember">
              <span class="cbox" :class="{ off: !remember }">
                <svg v-if="remember" viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              记住我（7天免登录）
            </label>
            <span class="link">登录遇到问题？</span>
          </div>

          <button
            type="submit"
            class="btn btn-lg btn-primary login-submit"
            :disabled="submitting"
          >
            <LogIn />
            {{ submitting ? "登录中…" : "登录" }}
          </button>

          <div class="audit-note">
            <ShieldCheck />
            本系统已开启操作审计，登录与操作记录将被留存
          </div>
        </form>

        <div class="lc-copy">
          © 2026 菜鸟驿站 · 平台运营管理后台 · 京ICP备 12345678 号
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  min-height: 100vh;
  width: 100%;
}

/* 左栏：品牌区 */
.brand-pane {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  padding: 54px 60px;
  background: linear-gradient(
    150deg,
    var(--primary) 0%,
    var(--primary-700) 46%,
    #16307e 100%
  );
  color: #fff;
}

.brand-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  pointer-events: none;
}

.brand-glow.g1 {
  top: -130px;
  right: -120px;
  width: 420px;
  height: 420px;
  background: rgb(125 164 255 / 35%);
}

.brand-glow.g2 {
  bottom: -140px;
  left: -90px;
  width: 360px;
  height: 360px;
  background: rgb(16 185 129 / 18%);
}

.bp-top {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
}

.bp-logo {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 28%);
  border-radius: 16px;
  background: rgb(255 255 255 / 16%);
  color: #fff;
}

.bp-logo :deep(svg) {
  width: 30px;
  height: 30px;
}

.bp-top .t b {
  display: block;
  font-size: 18px;
  font-weight: 700;
}

.bp-top .t span {
  font-size: 12px;
  color: rgb(255 255 255 / 72%);
}

.bp-mid {
  position: relative;
  z-index: 2;
  margin-top: auto;
  margin-bottom: auto;
  padding: 36px 0;
}

.bp-mid h2 {
  max-width: 13em;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.18;
}

.bp-mid h2 em {
  font-style: normal;
  color: #bfd3ff;
}

.bp-mid .slogan {
  margin-top: 20px;
  color: rgb(255 255 255 / 82%);
  font-size: 17px;
  font-weight: 500;
}

.bp-feats {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 34px;
}

.bp-feat {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgb(255 255 255 / 90%);
  font-size: 14px;
}

.bp-feat i {
  display: grid;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 10px;
  background: rgb(255 255 255 / 14%);
}

.bp-foot {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 22px;
  border-top: 1px solid rgb(255 255 255 / 14%);
  color: rgb(255 255 255 / 62%);
  font-size: 12px;
}

.bp-foot .dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bp-foot .dot b {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

/* 右栏：登录卡 */
.form-pane {
  display: grid;
  place-items: center;
  padding: 40px;
  background: var(--bg);
}

.login-card {
  width: 100%;
  max-width: 404px;
}

.lc-hd {
  margin-bottom: 28px;
}

.lc-hd h1 {
  font-size: 26px;
  font-weight: 700;
}

.lc-hd p {
  margin-top: 7px;
  color: var(--muted);
  font-size: 13.5px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 17px;
}

.field label .req {
  margin-left: 2px;
  color: var(--danger);
}

.input-wrap {
  position: relative;
}

.input-wrap .lead {
  position: absolute;
  top: 50%;
  left: 12px;
  width: 17px;
  height: 17px;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
}

.input-wrap .input {
  width: 100%;
  padding-left: 38px;
}

.input-wrap.has-tail .input {
  padding-right: 42px;
}

.input-wrap .tail {
  position: absolute;
  top: 50%;
  right: 6px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  transform: translateY(-50%);
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.input-wrap .tail:hover {
  background: var(--surface-2);
  color: var(--text);
}

.input-wrap .tail :deep(svg) {
  width: 17px;
  height: 17px;
}

.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.remember {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.cbox {
  display: grid;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 5px;
  background: var(--primary);
  color: #fff;
}

.cbox.off {
  border: 1px solid var(--border);
  background: var(--surface);
}

.cbox svg {
  width: 12px;
  height: 12px;
  stroke-width: 3;
}

.login-submit {
  justify-content: center;
  width: 100%;
  margin-top: 4px;
}

.login-submit:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.audit-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
}

.audit-note :deep(svg) {
  width: 14px;
  height: 14px;
  color: var(--accent);
}

.lc-copy {
  margin-top: 26px;
  color: #94a3b8;
  font-size: 11.5px;
  text-align: center;
}

@media (max-width: 880px) {
  .login {
    grid-template-columns: 1fr;
  }

  .brand-pane {
    display: none;
  }
}
</style>
