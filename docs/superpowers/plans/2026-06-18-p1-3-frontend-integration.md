# P1-3 前端接入 · 详细设计文档（Frontends MVP）

> 版本 v1.0（2026-06-18）｜ 周期 P1 MVP · 第 3 个 plan
> 配套：《设计方案（整合版）v2.0》§8 前端、《UI 设计规范 v1.0》、《实现计划总表》§C P1-3
> 性质：**设计级文档**（约定目录/路由/状态/契约/机制/任务），不含完整实现代码。
> 实现约束：`station-web`/`admin-web` = Vue3 + TS + Vite + Pinia + Vue Router + Axios + Element Plus；`user-app` = uni-app（→ 微信小程序 + H5）；三套主题 token + 全屏平铺。

---

## 1. 目标 · 周期 · 依赖

### 1.1 目标
让三端在 P1-1/P1-2 后端之上跑通 MVP 闭环：

- **station-web**：登录 → 动态菜单/路由（按 RBAC）→ 工作台 → 扫码入库 → 在库包裹 → 取件核销 → 货架库位 → 员工与角色权限；按 `v-perm` 控制按钮级权限。
- **user-app**（H5 优先，小程序通道预留）：登录（微信 / 手机验证码，P1 走验证码降级）→ 跨门店查件 → 取件码出示。
- **基础统计**：工作台首屏当日核心指标卡，对接后端基础统计接口。
- **视觉对齐**：实现以 `design/mockups/hifi/{station-web,user-app}` 已产出高保真为准（默认清爽蓝），全屏平铺，可切三主题。

> 本 plan 不含 `admin-web`（P3 才起完整后台）、不含寄件/异常/统计大屏页（P2）。这些页面在 station-web 侧栏中以「占位/灰禁」呈现，路由预留但不接口。

### 1.2 周期与方法论
- 归属 P1 MVP，建议执行顺序第 3（P1-1 → P1-2 → **P1-3**）。
- 遵循总表方法论：每 Task 独立可跑、收尾有可点通的页面流程、频繁提交（约定式 commit）、bite-sized Task。
- 前端无后端式 TDD 重单测，但每个对接 Task 须有「可点通的页面流程」作为绿灯；关键纯逻辑（响应解包、权限指令、扫码缓冲、码格式化）写 Vitest 单测。

### 1.3 依赖
| 依赖 | 提供物 | 用于 |
|---|---|---|
| **P1-1** | `/auth/login`、`/auth/me`、JWT、RBAC（功能权限码 `module:action`、菜单、门店 scope）、统一响应 `{code,message,data}`、`setGlobalPrefix('api')` | 登录态、动态菜单/路由、`v-perm` |
| **P1-2** | `POST /inbound`、`POST /pickup`、在库/库位查询、门店/货架/库位 CRUD、通知记录、领域事件 | 入库/在库/核销/货架页对接 |
| **P1-3 后端（本 plan 内）** | `analytics` 基础统计 `GET /analytics/overview`、消费者只读查件通道、（验证码登录 + Consumer 映射） | 工作台指标、user-app 查件 |

> 风险点：P1-1 仅交付单一 `accessToken`（无 refresh）；P1-1 未明确「拉权限明细/菜单」端点。本文按**契约约定**给出 `GET /auth/permissions`、`GET /auth/menus`（或合并 `GET /auth/me` 扩展），由本 plan 的后端补充 Task 落地（见 §4、§6 Task 0）。

---

## 2. 涉及应用与模块

### 2.1 应用边界
| 应用 | 技术栈 | 本期范围 | 主题 |
|---|---|---|---|
| `station-web` | Vue3+TS+Vite+Pinia+Router+Axios+Element Plus | 登录/工作台/入库/在库/核销/货架/员工权限（+P2 页占位） | blue/dark/mint 全量 |
| `user-app` | uni-app（H5+小程序） | 登录/查件/取件码 | 浅/暗两档（薄荷不入移动端） |
| `admin-web` | 同 station-web 栈 | **不在本期**（P3） | — |

### 2.2 station-web 目录结构（约定）
```
station-web/
├── index.html                 # 引入 §UI规范 2.5 字体 link；<html data-theme>
├── vite.config.ts             # alias @=src；proxy /api → 后端；按需引入 Element Plus
├── env/.env.development|.production   # VITE_API_BASE=/api
├── src/
│   ├── main.ts                # createApp + Pinia + Router + ElementPlus + 全局指令 + 主题初始化
│   ├── App.vue                # <router-view/>
│   ├── styles/
│   │   ├── kit.css            # 复用 design/_kit/kit.css（token + 组件类，三主题皮肤层）
│   │   ├── theme.css          # :root[data-theme="blue|dark|mint"] token 定义（取自 theme-switch-demo）
│   │   └── element-override.css  # Element Plus 变量映射到 kit token（--el-color-primary=var(--primary) 等）
│   ├── api/
│   │   ├── http.ts            # Axios 实例 + 拦截器（见 §5.1）
│   │   ├── auth.ts            # login/me/permissions/menus
│   │   ├── inbound.ts pickup.ts parcel.ts station.ts staff.ts analytics.ts
│   ├── store/                 # Pinia
│   │   ├── auth.ts            # token/user/roles/perms/menus；login/logout/loadProfile
│   │   ├── app.ts            # theme、sidebar 折叠、当前门店
│   │   └── parcel.ts | staff.ts（可选页级 store）
│   ├── router/
│   │   ├── index.ts           # 静态路由（login/layout 壳）+ 动态注入入口
│   │   ├── routes.static.ts   # 白名单：/login、404、layout 容器
│   │   └── guards.ts          # 全局前置守卫（见 §5.2）
│   ├── directives/v-perm.ts   # 按钮级权限指令（见 §5.3）
│   ├── layouts/DefaultLayout.vue  # .app 全屏平铺（侧栏 248px + 内容 1fr）
│   ├── components/            # KpiCard、TableCard、Toolbar、StatusTag、ThemeSeg、ScanInput…
│   ├── views/                 # 见 §3 页面清单
│   └── constants/perms.ts menus.ts  # 权限码与菜单元数据（图标、分组、对应 route name）
```

### 2.3 user-app 目录结构（约定）
```
user-app/                      # uni-app（HBuilderX 或 Vite uni 模板）
├── manifest.json pages.json   # 路由 + tabbar（首页/寄件/消息/我的，P1 仅首页/我的+查件取件可用）
├── src/
│   ├── App.vue main.ts
│   ├── utils/request.ts       # uni.request 封装（解包/token/401）；条件编译 H5 vs MP
│   ├── store/                 # Pinia（uni 兼容）：user（手机号/查件 token）、theme
│   ├── api/{auth,parcel}.ts
│   ├── pages/
│   │   ├── login/index.vue        # 手机验证码 / 微信一键（#ifdef MP-WEIXIN）
│   │   ├── home/index.vue         # 取件码卡 + 我的包裹列表
│   │   ├── parcels/index.vue      # 跨门店包裹聚合（tabs：待取/已取/全部）
│   │   └── pickup-code/index.vue  # 大号取件码 + 条码/二维码
│   └── styles/theme.css       # token（浅/暗），复用 kit 配色变量
```

### 2.4 路由设计（station-web）
- **静态白名单**：`/login`（`login.html`）、`/404`、`/`（DefaultLayout 壳）。未登录访问受保护路由 → 重定向 `/login?redirect=`。
- **动态路由**：登录后由 `auth.store` 依据后端返回的菜单 + 权限码，从「全量路由清单」过滤生成并 `router.addRoute` 注入 layout 子路由（见 §5.4）。
- 路由 `meta`：`{ title, perm?: string, icon, group, hidden? }`。`perm` 缺省=登录即可见；有则需命中权限码。
- 本期路由清单（name / path / 对应高保真 / 所需权限码示例）：

| name | path | 高保真 | perm（示例） |
|---|---|---|---|
| Workbench | `/workbench` | `workbench.html` | （登录可见） |
| Inbound | `/inbound` | `inbound.html` | `inbound:create` |
| Parcels | `/parcels` | `parcels.html` | `parcel:read` |
| ParcelDetail | `/parcels/:id` | `parcel-detail.html` | `parcel:read` |
| Pickup | `/pickup` | `pickup.html` | `pickup:verify` |
| Shelves | `/shelves` | `shelves.html` | `station:manage` |
| StaffRoles | `/staff-roles` | `staff-roles.html` | `staff:manage` |
| Settings | `/settings` | `settings.html` | `station:manage` |
| （占位 P2） | `/shipping` `/exceptions` `/statistics` | 对应 html | 路由预留、菜单灰禁、不接口 |

### 2.5 Pinia store 设计
| store | state | actions | 持久化 |
|---|---|---|---|
| `auth` | `token`、`user{id,username,tenantId,roles,isPlatform}`、`perms:string[]`、`menus:MenuNode[]`、`routesReady` | `login()`、`loadProfile()`（me+perms+menus）、`hasPerm(code)`、`logout()`、`resetRoutes()` | token 入 localStorage（见 §5.1）；user/perms/menus 不持久化，刷新后由 `loadProfile` 重建 |
| `app` | `theme:'blue'\|'dark'\|'mint'`、`sidebarCollapsed`、`currentStationId` | `setTheme()`、`toggleSidebar()` | theme 入 `cn-theme`（localStorage）+ 登录后同步后端偏好 |
| user-app `user` | `phone`、`pickToken`、`profile` | `sendCode()`、`verifyCode()`、`logout()` | token 入 uni storage |

### 2.6 请求层（见 §5.1 详述）
统一 Axios 实例：解包 `{code,message,data}`、注入 `Authorization: Bearer`、401 跳登录、业务码非 0 走 `ElMessage` 提示。`baseURL = VITE_API_BASE`（默认 `/api`，对齐后端 `setGlobalPrefix('api')`）。

### 2.7 权限指令 `v-perm` 与动态路由
- `v-perm="'inbound:create'"`：元素绑定权限码，未命中则从 DOM 移除（或禁用，按指令参数）。实现见 §5.3。
- 动态路由：登录后 `loadProfile` 拿菜单 + 权限，过滤全量路由清单 → `addRoute`，并据菜单渲染侧栏。机制见 §5.4。

### 2.8 主题切换接入
- `index.html` 引入 §UI规范 2.5 字体 link；`<html>` 上 `data-theme`，由 `app.store.setTheme` 写 `document.documentElement.dataset.theme` + `localStorage['cn-theme']`。
- `theme.css` 定义 `:root[data-theme="blue|dark|mint"]` 三套 token（取自 `design/mockups/theme-switch-demo.html`），`kit.css` 组件类只引 token，不硬编码色值。
- Element Plus 经 `element-override.css` 把 `--el-color-primary` 等映射到 kit token，确保 EP 组件随主题换肤。
- 顶栏 `.seg` 分段控件（清爽蓝/科技暗/柔和薄荷）调 `setTheme`；优先级：后端用户偏好 > localStorage > 默认 `blue`（§UI规范 3.2）。
- 初始化时机：`main.ts` 在挂载前读 `cn-theme` 应用，避免首屏闪烁；登录后 `loadProfile` 若带后端偏好则覆盖。

---

## 3. 页面清单与对接

> 每页：对应高保真文件 · 调用后端 API · 关键交互 · 状态。组件类一律取自 `kit.css`（§UI规范 §5），状态色语义见 §UI规范 §7。

### 3.1 station-web

#### 登录 `views/login`
- 高保真：`station-web/login.html`（居中登录卡，移动端例外不全屏平铺）。
- API：`POST /api/auth/login {username,password}` → `{accessToken,user}`。
- 交互：表单校验（`.field`+`.req`）→ 提交 → 成功存 token + `loadProfile` + 跳 `redirect||/workbench`；错误密码（业务码 UNAUTHORIZED）行内/Toast 提示。
- 状态：`auth.store`；登录中 loading 锁按钮防重复提交。

#### 工作台 `views/workbench`
- 高保真：`station-web/workbench.html`（5×`.kpi` + 最近入库 `.table-card` + 快捷操作 `.qbtn` + 近 7 天柱图）。
- API：`GET /api/analytics/overview`（今日入库/出库/在库/取件率/滞留预警）；最近入库列表复用 `GET /api/parcels?status=STORED&limit=N&sort=desc`。
- 交互：进入即拉指标；点 KPI/快捷入口跳入库/核销；柱图 P1 可用近 7 天 overview 趋势字段或静态占位（无趋势接口则降级隐藏）。
- 状态：页级局部 state；指标卡数字用 `--font-num` + `tabular-nums`；滞留预警卡 `.kpi.warn`。

#### 扫码入库 `views/inbound`
- 高保真：`station-web/inbound.html`（扫码输入区 + 录入表单 + 库位分配 + 待入库列表）。
- API：`POST /api/inbound {waybillNo,phone}` → `{pickupCode,slot,parcelId,status:STORED}`。
- 交互：**扫码枪键盘输入**（见 §5.5）聚焦运单号 → 自动填 → 手机号 → 确认入库 → 即时展示取件码 + 库位号 + 成功 Toast → 清表单聚焦下一单；可手动录入。
- 状态：录入表单本地 state；最近入库列表入库后 prepend；`v-perm="'inbound:create'"` 控制确认按钮。

#### 在库包裹 `views/parcels` + 详情 `views/parcel-detail`
- 高保真：`parcels.html`（`.toolbar` 筛选 + `.tabs` 全部/在库/滞留 + `.table-card` + `.tag` + `.pager`）；`parcel-detail.html`（`.drawer` + 状态机时间线 + `parcel_events` + 操作）。
- API：`GET /api/parcels?phoneTail=&pickupCode=&slot=&status=&page=&size=`；详情 `GET /api/parcels/:id`（含 `parcel_events`）。
- 交互：按手机尾号/取件码/库位筛选 + 分页；行点开 `.drawer` 看时间线；详情内可触发核销（跳 pickup 或内联）。
- 状态：列表 state（filters/page/total/loading）；空态用 `.empty`；状态标签 STORED=蓝/PICKED_UP=绿/滞留=红/异常=琥珀。

#### 取件核销 `views/pickup`
- 高保真：`pickup.html`（核销输入 + 待核销列表 + 家人代取授权 + `.btn-accent` 确认）。
- API：`POST /api/pickup {pickupCode}` 或 `{phoneTail}` → 命中包裹核销 → `PICKED_UP`。
- 交互：输入取件码/手机尾号（支持扫码枪）→ 校验回显待核销包裹 → 确认核销 → 成功提示 + 列表移除 + 库位释放可见；并发/重复核销由后端幂等保护，前端展示「已被核销」提示。
- 状态：`v-perm="'pickup:verify'"`；核销中按钮 loading 防双击。

#### 货架库位 `views/shelves`
- 高保真：`shelves.html`（货架网格 + 占用率 `.progress` + 库位 `.card` + 分配/释放）。
- API：`GET /api/stations/:id/shelves`、`GET /api/shelves/:id/slots`；`POST /api/shelves`（建货架）、`POST /api/shelves/:id/slots:batch`（批量建位）。
- 交互：建货架 → 批量建位（区-排-层-位编码）→ 网格看空闲/占用 + 占用率进度条。
- 状态：`v-perm="'station:manage'"`；建位后刷新网格，供入库分配使用。

#### 员工与角色权限 `views/staff-roles`
- 高保真：`staff-roles.html`（员工 `.table-card` + 角色配置 `.modal` + 门店 scope + `.switch` 权限）。
- API：`GET/POST/PATCH /api/staff`（员工 CRUD）；`GET/POST /api/roles`、`GET /api/permissions`（权限树）、`POST /api/roles/:id/permissions`（勾权限）；`POST /api/staff/:id/stations`（门店 scope）。
- 交互：员工 CRUD；角色勾选权限树（`.switch`）；分配门店 scope；新建店员设初始密码。
- 状态：`v-perm="'staff:manage'"`；保存后该店员重新登录其菜单/按钮按配置生效（验证 RBAC 闭环）。

#### 门店设置 `views/settings`（轻量）
- 高保真：`settings.html`（`.tabs` 基础/通知/营业 + `.field` + `.switch`）。
- API：`GET/PATCH /api/stations/:id`（基础信息）；含**主题偏好同步**字段（§5.6）。
- 本期最小：展示门店基础信息 + 主题偏好；通知/营业配置可占位。

### 3.2 user-app（H5 优先）

#### 登录 `pages/login`
- 高保真：`user-app/login.html`（手机号验证码 `.field` + `.btn-lg` + 微信一键登录）。
- API：`POST /api/consumer/auth/send-code {phone}`；`POST /api/consumer/auth/verify {phone,code}` → `{pickToken, consumerId}`。小程序：`#ifdef MP-WEIXIN` `wx.login` 拿 code → `POST /api/consumer/auth/wechat`（P1 通道预留，主走验证码降级）。
- 交互：输入手机号 → 发码（60s 倒计时）→ 输验证码 → 登录拿查件 token。
- 状态：`user.store`；token 存 uni storage。

#### 首页 `pages/home`
- 高保真：`user-app/home.html`（取件码卡 + 包裹列表卡 + tabbar）。
- API：`GET /api/consumer/parcels`（按已验证手机号跨门店聚合，消费者只读通道，见 §5.7）。
- 交互：顶部展示最近一个待取包裹取件码入口；下方在库包裹卡列表；点卡进取件码页。
- 状态：未登录引导登录；列表 loading/empty。

#### 我的包裹 `pages/parcels`
- 高保真：`user-app/parcels.html`（`.tabs` 待取/已取/全部 + 包裹卡 + `.tag`）。
- API：`GET /api/consumer/parcels?status=`（跨门店）。
- 交互：tab 切换待取/已取/全部；卡片显示门店、库位、状态、入库时间。

#### 取件码 `pages/pickup-code`
- 高保真：`user-app/pickup-code.html`（大号取件码 + 二维码/条码 + 门店/库位）。
- API：`GET /api/consumer/parcels/:id`（含 `pickupCode`、门店、库位）。
- 交互：大号取件码 + 生成条码/二维码（前端库生成，承载取件码字符串）出示给店员核销；亮屏建议提示。
- 状态：码格式化展示（4-4 分组等）；过期/已取态切换提示。

---

## 4. 前后端接口契约对接（P1-3 调用端点）

> 统一前缀 `/api`（后端 `setGlobalPrefix('api')`）；统一响应 `{code,message,data}`，`code=0`(或 `ApiCode.OK`) 为成功；鉴权 `Authorization: Bearer <accessToken>`；多租户由 JWT 内 `tenantId` 驱动后端 RLS，前端不传租户头。

### 4.1 鉴权与 RBAC（identity，P1-1 + 本 plan 补充）
| 方法 | 端点 | 入参 | 返回 | 来源 |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{username,password}` | `{accessToken,user{id,username,tenantId,roles,isPlatform}}` | P1-1 已有 |
| GET | `/api/auth/me` | — | `{id,username,tenantId,roles,isPlatform,themePref?}` | P1-1 已有（本 plan 可扩展 themePref） |
| GET | `/api/auth/permissions` | — | `string[]`（权限码 `module:action`） | **本 plan 补充（Task 0）** |
| GET | `/api/auth/menus` | — | `MenuNode[]`（按 RBAC 过滤的菜单树） | **本 plan 补充（Task 0）** |
| PATCH | `/api/auth/preferences` | `{theme}` | `ok` | **本 plan 补充（主题同步，可选）** |

> 约定：可将 permissions+menus 合并进 `/auth/me`（返回 `{user,perms,menus}`）减少往返；本文以独立端点表述，实现二选一即可，前端 `loadProfile` 适配。

### 4.2 入库 / 在库 / 核销（inbound/parcel/pickup，P1-2）
| 方法 | 端点 | 入参 | 返回 |
|---|---|---|---|
| POST | `/api/inbound` | `{waybillNo,phone}` | `{parcelId,pickupCode,slot,status}` |
| GET | `/api/parcels` | query：`phoneTail,pickupCode,slot,status,page,size,sort` | `{list,total,page,size}` |
| GET | `/api/parcels/:id` | — | `{...parcel, events:[...]}` |
| POST | `/api/pickup` | `{pickupCode}` 或 `{phoneTail}` | `{parcelId,status:PICKED_UP,slotReleased}` |

### 4.3 门店 / 货架 / 库位（station，P1-2）
| 方法 | 端点 | 用途 |
|---|---|---|
| GET | `/api/stations/:id/shelves` | 货架列表 |
| POST | `/api/shelves` | 建货架 |
| GET | `/api/shelves/:id/slots` | 库位列表（空闲/占用） |
| POST | `/api/shelves/:id/slots:batch` | 批量建位 |
| GET/PATCH | `/api/stations/:id` | 门店基础信息 |

### 4.4 员工与角色（identity，P1-1 RBAC 之上）
| 方法 | 端点 | 用途 |
|---|---|---|
| GET/POST/PATCH | `/api/staff` `/api/staff/:id` | 员工 CRUD |
| GET | `/api/permissions` | 权限树（配角色用） |
| GET/POST | `/api/roles` | 角色 CRUD |
| POST | `/api/roles/:id/permissions` | 角色勾权限 |
| POST | `/api/staff/:id/stations` | 门店 scope 分配 |

### 4.5 基础统计（analytics，本 plan 后端 Task）
| 方法 | 端点 | 返回 |
|---|---|---|
| GET | `/api/analytics/overview` | `{inboundToday,pickedToday,inStock,pickupRate,overdueCount,notifyToday}`（按租户/门店隔离） |

### 4.6 消费者只读查件（consumer 通道，本 plan 后端 Task）
| 方法 | 端点 | 鉴权 | 返回 |
|---|---|---|---|
| POST | `/api/consumer/auth/send-code` | 公开 | `ok`（发码，P1 控制台/固定码降级） |
| POST | `/api/consumer/auth/verify` | 公开 | `{pickToken,consumerId}` |
| GET | `/api/consumer/parcels` | pickToken | 跨门店在库/历史包裹（消费者只读通道，绕租户 RLS、仅本手机号数据） |
| GET | `/api/consumer/parcels/:id` | pickToken | 单包裹（含取件码、门店、库位） |

---

## 5. 关键机制

### 5.1 登录态 / JWT 存储与刷新
- **存储**：P1-1 仅 `accessToken` 单 token。存 `localStorage['cn_token']`（station-web）/ uni storage（user-app）。Axios 请求拦截器注入 `Authorization: Bearer`。
- **解包**：响应拦截器统一处理 `{code,message,data}`——`code===OK` 返回 `data`；非 0 业务码 `ElMessage.error(message)` 并 `reject`；HTTP 401 → 清 token + 跳 `/login?redirect=`。
- **刷新（前瞻设计）**：规范 §9 目标为 access+refresh，但 P1-1 未交付 refresh。**接口层预留** `refreshToken()` 钩子与「401 单次静默刷新 + 请求队列重放」骨架（默认关闭）；后端加 `/auth/refresh` 后开启即可，业务代码不改。本期降级策略：401 直接登出跳登录。
- **刷新页恢复**：刷新浏览器后 token 仍在 localStorage，但 perms/menus/动态路由丢失 → 路由守卫检测 `token && !routesReady` 时先 `loadProfile()` 重建路由再放行（见 §5.2）。

### 5.2 路由守卫（全局前置）
```
beforeEach(to):
  theme 已在 main 初始化
  if to.path == '/login': 有 token → 跳 /workbench；否则放行
  if !token: → /login?redirect=to.fullPath
  if token && !auth.routesReady:
      try loadProfile() → addDynamicRoutes() → next({...to, replace:true})
      catch → logout → /login
  if to.meta.perm && !auth.hasPerm(to.meta.perm): → /403（或 /workbench + 提示）
  else next()
```

### 5.3 `v-perm` 指令
- 用法：`v-perm="'inbound:create'"`（单码）或 `v-perm="['a:b','c:d']"`（任一命中）。
- 行为：`mounted/updated` 时查 `auth.store.perms`；未命中默认 `el.remove()`（从 DOM 摘除）；可选修饰 `v-perm.disable` 改为禁用态（`disabled` + 弱化样式）。
- 注意：仅为 UI 便利，**真正鉴权在后端**（`@RequirePermission`）；前端隐藏不等于安全。

### 5.4 动态菜单 / 路由（按 getMyMenusAndPerms）
- 登录后 `loadProfile()` 拉 `/auth/me` + `/auth/permissions` + `/auth/menus`（或合并端点）。
- 前端维护「全量路由清单 + 菜单元数据」（`constants/menus.ts`，含 route name ↔ 权限码 ↔ 图标/分组）。
- 用后端菜单（或权限码）**过滤**全量清单 → 生成最终路由集合 → `router.addRoute(layoutName, child)` 注入 → `auth.routesReady=true`。
- 侧栏 `.nav` 据同一菜单数据渲染（分组「代收业务 / 网点管理」），当前页 `.nav a.on`；异常件等 badge 红点计数预留（P2 接）。
- `logout` 时 `resetRoutes()`（移除动态路由）防止串号。

### 5.5 扫码枪输入处理
- 扫码枪 = 模拟 USB 键盘，快速逐字符输入 + 结尾 `Enter`。
- 机制：在入库/核销输入框挂全局/局部 `keydown` 缓冲——按时间间隔（如 < 30ms/键）聚合连续字符为一次扫码，`Enter` 视为提交；普通手动输入（间隔大）不触发自动提交。
- 实现为可复用组件 `ScanInput.vue` / composable `useScanGun()`：输出 `onScan(code)` 回调；入库填运单号自动跳手机号字段，核销填取件码后可自动校验。
- 降级：H5 摄像头扫码（`ScanSource` 接口语义）P1 不实现，键盘扫码枪为唯一通道；提供纯手动输入兜底。

### 5.6 主题切换 / 偏好同步
- 见 §2.8。`setTheme(t)`：写 `data-theme` + `localStorage['cn-theme']`；登录态调 `PATCH /api/auth/preferences {theme}`（后端落 `users` 偏好字段）。
- `loadProfile` 若返回 `themePref` 且与本地不同 → 以后端为准覆盖（跨设备一致，§UI规范 3.2 优先级）。
- user-app 仅浅/暗两档，跟随系统或手动；不接 mint。

### 5.7 user-app 登录态与跨门店查件
- **登录态**：H5 手机验证码 → `verify` 拿 `pickToken`（与 station 的 staff token 不同体系，作用域=该手机号消费者只读）；存 uni storage，`utils/request` 注入。
- **跨门店查件**：`GET /api/consumer/parcels` 走后端**消费者只读通道**——按已验证手机号聚合其在各租户/门店的包裹，绕租户 RLS 但仅返回该手机号数据（设计 §3「跨店查件」），不影响租户写隔离。
- **小程序通道预留**：`#ifdef MP-WEIXIN` `wx.login`→openid 绑手机号映射 Consumer；P1 主走验证码降级，小程序编译目标保留但可暂不上架。
- 401/token 失效：清 token 回登录页。

---

## 6. 任务分解（有序 Task）

> 每 Task：做什么 / 产物 / 验收。粒度对齐总表，可由子代理逐个领取，Task 间评审。前端「可点通流程」即绿灯，关键纯逻辑配 Vitest。

**Task 0 · 后端契约补口（前置）**
- 做：补 `GET /auth/permissions`、`GET /auth/menus`（或扩展 `/auth/me`）、`GET /analytics/overview`、`consumer` 验证码登录 + 只读查件通道。
- 产物：上述端点 + 最小返回；analytics 基础计数（直查/事件计数）；consumer 通道按手机号聚合。
- 验收：Postman/e2e 验证返回结构与 §4 契约一致、租户/只读隔离正确。

**Task 1 · station-web 脚手架与主题**
- 做：建 Vue3+TS+Vite+Pinia+Router 工程，接入 Element Plus + `kit.css` + 三主题 `theme.css` + EP override + 全屏平铺 `DefaultLayout`。
- 产物：可起站的壳工程、`app.store` 主题、顶栏 `.seg` 切换、`index.html` 字体引入。
- 验收：本地起站；切 blue/dark/mint 整页换肤、刷新记忆；EP 组件随主题变色；侧栏 248px + 内容铺满。

**Task 2 · 统一请求层与登录**
- 做：`http.ts`（解包/注入/401/刷新钩子骨架）、`auth.api`、登录页对接 `/auth/login`、token 持久化。
- 产物：Axios 实例 + 拦截器、`auth.store.login/logout`、登录页。
- 验收：正确密码进工作台、错误密码提示；token 持久化；401 跳登录；解包逻辑 Vitest 绿。

**Task 3 · 动态菜单/路由 + v-perm**
- 做：`loadProfile`（me+perms+menus）、菜单元数据、动态 `addRoute`、路由守卫、`v-perm` 指令、侧栏渲染。
- 产物：动态路由机制、`v-perm.ts`、`DefaultLayout` 侧栏 `.nav`。
- 验收：店长见全功能、（造）店员见受限菜单与按钮；刷新页能重建路由；无权限路由被拦。

**Task 4 · 扫码入库页**
- 做：入库表单 + `ScanInput`/`useScanGun` + 对接 `POST /inbound` + 结果展示。
- 产物：`inbound` 视图、扫码缓冲组件、入库 api。
- 验收：扫码枪/手动录入后即时回显取件码+库位、清表单续录；`useScanGun` 缓冲逻辑单测绿。

**Task 5 · 在库列表与详情**
- 做：列表（筛选 phoneTail/pickupCode/slot/status + 分页 + tabs）+ 详情抽屉（时间线 + events）。
- 产物：`parcels`、`parcel-detail` 视图、`parcel.api`。
- 验收：筛选/分页/空态正确；状态标签语义色对；详情时间线展示 `parcel_events`。

**Task 6 · 取件核销页**
- 做：核销输入（支持扫码）+ 校验回显 + 对接 `POST /pickup` + 成功刷新。
- 产物：`pickup` 视图、`pickup.api`。
- 验收：正确码核销成功、列表减少、库位释放可见；重复核销提示「已核销」；按钮防双击。

**Task 7 · 货架库位页**
- 做：货架/库位网格 + 占用率进度 + 建货架/批量建位。
- 产物：`shelves` 视图、`station.api`。
- 验收：建货架→批量建位→网格看占用；建位后入库可分配到。

**Task 8 · 员工与角色权限页**
- 做：员工 CRUD + 角色勾权限树 + 门店 scope。
- 产物：`staff-roles` 视图、`staff/roles/permissions` api。
- 验收：新建店员配角色/门店后，其登录菜单与按钮按配置生效（RBAC 闭环可见）。

**Task 9 · 工作台首屏与基础统计对接**
- 做：5 KPI 卡 + 快捷入口 + 最近入库 + 趋势（有则接、无则降级）对接 `/analytics/overview`。
- 产物：`workbench` 视图、`analytics.api`。
- 验收：指标与后端一致、租户隔离；KPI 数字等宽对齐；滞留预警卡告警态。

**Task 10 · user-app 脚手架与登录**
- 做：uni-app 工程 + tabbar + `request` 封装（条件编译）+ 手机验证码登录（小程序通道预留）。
- 产物：user-app 壳、`user.store`、登录页。
- 验收：H5 发码→验证码登录拿 pickToken；浅/暗主题可切；条件编译不报错。

**Task 11 · user-app 查件与取件码**
- 做：首页/我的包裹（跨门店聚合）+ 取件码页（条码/二维码生成）。
- 产物：`home`/`parcels`/`pickup-code` 页、`parcel.api`（consumer）。
- 验收：H5 用本人手机号查到某店在库包裹并展示取件码；tabs 切换待取/已取。

**Task 12 · P1-3 联调冒烟**
- 做：端到端走查脚本/清单——店长入库 → user 端查到码 → 店长核销 → user 端态变更。
- 产物：联调清单 + （可选）Playwright 冒烟脚本。
- 验收：三端串通、与后端 P1-2 e2e 行为一致；主题切换、权限隔离、扫码、跨门店查件全可演示。

---

## 7. 验收标准

1. **station-web**：可登录、按 RBAC 看到对应菜单/按钮；入库 / 在库 / 核销 / 货架 / 员工 五条主流程可点通。
2. **user-app（H5）**：可验证码登录、跨门店查件、出示取件码（含条码/二维码）。
3. **统计**：工作台基础指标与 `/analytics/overview` 一致、租户隔离。
4. **权限**：`v-perm` 与动态路由生效——造一个受限店员，其菜单/按钮/路由受限且与后端 `@RequirePermission` 一致。
5. **UI**：对齐高保真清爽蓝、全屏平铺；station-web 可切 blue/dark/mint 并记忆、EP 组件随主题换肤；user-app 浅/暗两档。
6. **联调**：店长入库 → user 端查到码 → 核销 → 释放 全链路串通，与后端 e2e 行为一致。
7. **工程**：纯逻辑（响应解包、`v-perm`、`useScanGun`、取件码格式化）Vitest 绿；构建无类型错误。

---

## 8. 依赖与风险

### 8.1 依赖
- **P1-2**：入库/核销/在库/货架/库位接口与领域行为；缺则入库核销页无法对接。
- **P1-1**：登录/JWT/RBAC/统一响应/`/api` 前缀；权限码与菜单数据结构需与前端 `constants` 对齐。
- **本 plan 后端 Task 0**：permissions/menus 端点、analytics 基础统计、consumer 只读查件通道——是前端动态路由、工作台、user-app 的硬前置。

### 8.2 风险与对策
| 风险 | 影响 | 对策 |
|---|---|---|
| P1-1 无 refresh token | 长会话掉线只能重登 | 接口层预留刷新钩子+队列重放骨架，默认 401 直接登出；后端补 `/auth/refresh` 即开启，业务不改 |
| permissions/menus 端点未定 | 动态路由/`v-perm` 无数据 | Task 0 先定契约（独立端点或并入 `/auth/me`）；前端 `loadProfile` 写成适配两种形态 |
| 后端字段命名/分页结构与契约偏差 | 列表/详情对接返工 | §4 契约为对接基线，联调前与后端对齐字段；api 层做一层 DTO 映射隔离 |
| 扫码枪型号差异（前缀/速率/结尾符） | 自动识别误判 | `useScanGun` 阈值可配（间隔/结尾键），并保留纯手动兜底；真机校准 |
| EP 默认样式与 kit token 冲突 | 主题换肤不彻底 | `element-override.css` 把 EP 变量映射到 kit token；高保真为视觉验收基准，必要处自定义组件 |
| uni-app H5 与小程序差异 | 条件编译遗漏报错 | `request`/登录用 `#ifdef` 隔离；P1 以 H5 为主验收，小程序通道仅预留编译 |
| 消费者只读通道越权风险 | 跨租户数据泄露 | 通道仅按已验证手机号返回、只读、与 staff 鉴权体系隔离；后端用例覆盖越权拒绝 |
| user-app mint 主题误入移动端 | 与规范不符 | 主题枚举在移动端限定浅/暗两档 |

---

> 实现前请先与后端确认 Task 0 契约（permissions/menus/analytics/consumer 四组端点）。本文为对接基线，字段以联调时双方确认为准；视觉以 `design/mockups/hifi/` 与 `design/_kit/kit.css` 为单一基准。
