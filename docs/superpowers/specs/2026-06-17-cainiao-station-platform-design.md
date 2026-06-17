# 菜鸟驿站 SaaS 平台 · 整体设计方案

> 版本：v1.2 ｜ 日期：2026-06-17 ｜ 状态：6 项决策 + 权限体系已细化回填，待评审
> 定位：面向**真实运营**的多租户（SaaS）驿站管理平台

---

## 0. 文档说明

本文是**整体完整设计方案**，覆盖全平台所有业务域，不限于首期要做的部分。
落地按 P1→P4 分期推进（见第 11 节），但设计上一次性把边界、领域模型、数据结构、集成口子全部定清楚，保证「先做的部分」与「后做的部分」在同一套架构里无缝衔接、不返工。

阅读顺序建议：第 1 节（定位）→ 第 2 节（架构）→ 第 4 节（包裹状态机，全系统的心脏）→ 其余按需。

---

## 1. 项目概述

### 1.1 背景与定位
菜鸟驿站是社区/校园最后一公里的代收代寄网点。本平台**不是给一家店用，而是一套对外开放的 SaaS**：很多互不相干的驿站经营者注册入驻、各自独立使用、数据互相隔离、按店订阅收费。

核心价值：让一个驿站老板**开箱即用**地完成「代收（入库→通知→取件）+ 代寄 + 经营分析」全流程，平台方通过订阅与增值服务变现。

### 1.2 角色与三端
| 端 | 应用 | 使用者 | 职责 |
|---|---|---|---|
| 驿站工作台（前台） | `station-web` | 驿站店长/店员 | 日常运营：入库、库位、取件核销、寄件、店内数据 |
| 平台运营后台 | `admin-web` | SaaS 平台运营方 | 租户/门店审核、订阅计费、全局监控、平台配置 |
| 用户端 | `user-app` | 收件人/寄件人 | 手机查件、出示取件码、在线寄件、物流追踪 |

### 1.3 运营模式
- **多租户**：一个「租户」= 一个驿站经营主体（老板/品牌），下可挂 1~N 个门店。
- **入驻**：P1 由平台手动开店；P3 开放自助申请→审核→开通。
- **变现**：**月费 + 用量混合**——按门店月费订阅（基础/标准/旗舰套餐，含基础额度）+ 超额用量加费（短信条数等）+ 增值（寄件抽佣、AI 能力等），P3 落地。

### 1.4 设计原则
1. **演进式架构**：第一天就按微服务边界设计（限界上下文 + 事件 + 契约），但以模块化单体形态部署；哪个上下文先扛不住就先抽哪个，不返工。
2. **适配层可降级**：所有外部依赖（扫码/短信/支付/物流/OCR）一律「接口 + 现在用可行方案顶 + 以后接真的」，核心业务永不被外部资质卡住。
3. **数据不串门**：每个上下文只碰自己的表，跨上下文只走接口或领域事件——这是单体能平滑拆分的命门。
4. **YAGNI，但边界先行**：功能可以后做，边界必须先划好。
5. **多租户安全是底线**：租户数据隔离由数据库层（RLS）强制，不依赖应用层自觉。

---

## 2. 总体架构

### 2.1 架构风格
**模块化单体（Modular Monolith）+ 微服务可演进**。
单一 NestJS 应用按限界上下文分模块（Nest Module），模块间通过：
- **领域服务接口**（同步、契约化）
- **领域事件总线**（异步、解耦）

通信，绝不互相直连数据库。AI 能力从第一天起就是**独立进程**（Python FastAPI），作为「已经拆出去的第一个服务」验证拆分模式。

### 2.2 技术栈总览
| 维度 | 选型 | 说明 |
|---|---|---|
| 后端运行时 | Node 22 LTS | |
| 后端框架 | NestJS + TypeScript | Monorepo（apps + libs），模块化、内置微服务传输层 |
| 数据库 | PostgreSQL 16 + Prisma | 强类型 ORM，迁移版本化（prisma migrate） |
| 多租户隔离 | PostgreSQL **行级安全 RLS** | 数据库层强制 `tenant_id` 隔离 |
| 缓存/队列 | Redis 7 + **BullMQ** | 取件码、验证码、排行榜、异步任务、滞留扫描 |
| 鉴权 | Passport + JWT | RBAC：平台角色 + 驿站角色两套体系 |
| 实时 | Socket.IO | 运营大屏、到件提醒推送 |
| 对象存储 | MinIO（S3 兼容） | 面单图、存证照，接口可换 OSS |
| API 文档 | Swagger / OpenAPI 3 | Nest 内置 |
| 日志 | pino + 请求链路 ID | |
| AI 服务 | Python 3.12 + FastAPI | OCR、大模型客服，走适配层接口 |
| 前端 | Vue3 + TS + Vite + Pinia + Vue Router（两后台）; **uni-app**（用户端） | 3 个独立应用 |
| 前端 UI | Element Plus（两后台）/ **uni-app + uView/uni-ui**（用户端→微信小程序+H5） | ECharts 图表 |
| 部署 | Docker Compose | 单机一键起，可平滑扩 |

### 2.3 系统分层
```
┌───────────────────────────────────────────────────────────┐
│ 接入层   Nginx 反代 · 静态托管(3 前端) · API 网关(预留)        │
├───────────────────────────────────────────────────────────┤
│ 应用层   Controllers(REST) · WebSocket Gateway · 鉴权/限流     │
├───────────────────────────────────────────────────────────┤
│ 领域层   各限界上下文(Domain Services) · 领域事件 · 状态机      │
├───────────────────────────────────────────────────────────┤
│ 适配层   notify/pay/logistics/ocr/file 适配器(接口+可降级实现) │
├───────────────────────────────────────────────────────────┤
│ 基础设施 PostgreSQL(RLS) · Redis/BullMQ · MinIO · EventBus     │
└───────────────────────────────────────────────────────────┘
```

### 2.4 部署拓扑
**起步（单体）**：`Nginx + nest-api(单体) + ai-service + PostgreSQL + Redis + MinIO`，一台服务器 Docker Compose 起。
**演进（拆服务）**：把高负载上下文（如 notify、analytics）从单体抽成独立 Nest 微服务，EventBus 从进程内换 Redis Stream/Kafka，前面加 API 网关。业务代码与契约不变。

### 2.5 限界上下文地图（全局 / 未来的微服务切分线）
```
平台层    │ identity(认证/RBAC)   tenant(租户/入驻)   billing(订阅计费)
─────────┼──────────────────────────────────────────────────────────
核心业务  │ station(门店/货架库位)
         │                         ┌────────────────────────────┐
         │   inbound(入库)  ──────▶ │   parcel  包裹核心域        │ ◀──── pickup(取件核销)
         │   shipping(寄件) ──────▶ │   (包裹聚合 + 状态机)        │
         │                         └────────────────────────────┘
─────────┼──────────────────────────────────────────────────────────
能力/适配 │ notify(通知)  pay(支付)  logistics(物流)  ocr/ai  file(存储)
─────────┼──────────────────────────────────────────────────────────
支撑      │ analytics(统计/大屏)   audit(操作日志)   member(会员/积分)
```
每个方框 = 一个 Nest 模块 = 一个未来可独立部署的服务。`parcel` 是心脏。

### 2.6 仓库结构（Monorepo）
```
cainiao-station/
├── backend/                      # NestJS Monorepo
│   ├── apps/
│   │   └── api/                  # 主应用（模块化单体）
│   ├── libs/
│   │   ├── contracts/            # 跨上下文契约 DTO / 事件定义（契约先行）
│   │   ├── core/                 # 统一响应/异常/分页/基础设施
│   │   ├── tenant-context/       # 租户上下文（AsyncLocalStorage）+ RLS 注入
│   │   └── event-bus/            # 事件总线抽象（进程内 → MQ）
│   └── modules/                  # 各限界上下文（identity/tenant/station/parcel/...）
├── ai-service/                   # Python FastAPI（OCR + 大模型）
├── station-web/                  # 驿站工作台（Vue3 + Element Plus）
├── admin-web/                    # 平台运营后台（Vue3 + Element Plus）
├── user-app/                      # 用户端（uni-app，一套编译 微信小程序 + H5）
├── deploy/                       # docker-compose、nginx、初始化脚本
└── docs/                         # 设计文档、ADR、接口文档
```

---

## 3. 多租户设计

### 3.1 隔离策略
**共享数据库 + 共享 Schema + 行级 `tenant_id` + PostgreSQL RLS**。
起步性价比最高；将来某大租户需独立，可平滑迁到独立 Schema/库。

### 3.2 租户层级模型
```
Platform(平台)
  └── Tenant(租户=驿站经营主体)         ← 计费、订阅、隔离边界
        ├── Station(门店, 1~N)          ← 实际网点，含货架库位
        └── StaffUser(员工, 1~N)        ← 店长/店员，可分配到门店
Consumer(收件人/寄件人)                  ← 平台级，按手机号，跨租户
```
- **隔离边界 = Tenant**：RLS 按 `tenant_id` 隔离，租户之间绝对不可见。
- **门店是租户内部维度**：同租户多门店可互相协作（如调拨），由应用层控制。

### 3.3 RLS 实现机制
1. 每张业务表带 `tenant_id`，建 RLS Policy：`USING (tenant_id = current_setting('app.tenant_id')::uuid)`。
2. 请求进来 → JWT 解出 `tenant_id` → 存入 `AsyncLocalStorage`（tenant-context）。
3. Prisma 每次取连接时执行 `SET app.tenant_id = '...'`（事务级 `set_config`）。
4. 之后所有 SQL 自动被 Postgres 过滤，**应用层忘了加 where 也不会越权**。
5. 平台运营接口用「平台超级角色」连接（bypass RLS 或专用策略），可跨租户读。

### 3.4 跨租户的「用户端查件」
收件人是**平台级**实体（按手机号），其包裹分散在各门店。用户端按「已验证手机号」聚合查询其全部包裹——这是**有意的跨租户读**，通过专用的「消费者读模型」接口实现（绕开租户 RLS，但只读、只返回与该手机号绑定的数据），不影响租户对自身数据的写隔离。

### 3.5 租户生命周期
`申请 → 审核 → 开通(active) → 停用(suspended，如欠费) → 注销(closed，数据保留期后清理/导出)`。
每次状态变更发 `TenantStatusChanged` 事件，billing/notify 订阅处理。

---

## 4. 领域模型 —— 包裹核心域（系统的心脏）

### 4.1 代收包裹 Parcel 状态机
```
                 入库完成                取件核销
  [PENDING] ──────────────▶ [STORED] ──────────────▶ [PICKED_UP]
  待入库                     在库待取                    已取件
                              │  ▲
                   标记异常    │  │ 异常解决(归位)
                              ▼  │
                          [EXCEPTION] ───── 异常解决(退回) ──┐
                          异常件                            │
                              │  滞留超期 / 主动退回          ▼
                              └────────────────────────▶ [RETURNED] 已退回
```
| 状态 | 含义 | 进入触发 | 关键副作用 |
|---|---|---|---|
| PENDING | 已扫描录入，未上架 | 入库扫描 | 占位，待分配库位 |
| STORED | 在库待取（已分配库位+取件码） | 入库完成 | 发 `ParcelStored` → 触发通知 |
| PICKED_UP | 已取出 | 取件核销 | 发 `ParcelPickedUp` → 释放库位、记积分 |
| EXCEPTION | 破损/错件/无主等 | 标记异常 | 进异常工单流转 |
| RETURNED | 退回快递公司 | 滞留超期/主动退回 | 发 `ParcelReturned` → 释放库位 |

> 状态机在 `parcel` 上下文统一收口，所有流转校验合法性（如不能从 PICKED_UP 回退），并发场景用乐观锁 + Redis 锁保护。

### 4.2 寄件订单 ShipOrder 状态机（独立聚合）
```
[CREATED] ─支付─▶ [PAID] ─揽收─▶ [COLLECTED] ─▶ [IN_TRANSIT] ─▶ [DELIVERED]
 待支付            待揽收           已揽收          运输中           已签收
   └─取消─▶ [CANCELLED]
```

### 4.3 核心领域事件清单
| 事件 | 发布方 | 主要订阅方 |
|---|---|---|
| `ParcelStored` | inbound | notify（发通知）、analytics、member |
| `ParcelPickedUp` | pickup | analytics、member（积分）、station（释放库位） |
| `ParcelMarkedException` | parcel | notify、analytics |
| `ParcelReturned` | parcel | notify、analytics、logistics |
| `ParcelOverdueDetected` | parcel(定时) | notify（催取） |
| `ShipOrderCreated` | shipping | pay、analytics |
| `ShipOrderPaid` | shipping | logistics、analytics |
| `TenantStatusChanged` | tenant | billing、notify、station |
| `NotificationRequested` | 任意 | notify |

事件先走**进程内 EventBus**，演进期换 Redis Stream/Kafka，订阅方代码不变。

---

## 5. 限界上下文详细设计

> 每个上下文统一描述：**职责 / 关键实体 / 对外接口 / 发布·订阅事件 / 依赖**。

### 5.1 identity（认证与权限）—— 完整自定义 RBAC
- **三类主体**：平台员工(platform) / 租户员工(staff) / 收件人(consumer)。前两者走 RBAC；consumer 仅身份认证（小程序微信登录 / H5 手机号验证码），不进 RBAC。
- **两套独立 RBAC**：`roles.scope = platform | tenant`，平台与租户的角色、权限码、菜单完全隔离、互不污染。
- **P1 即完整动态 RBAC**：店长（及平台超管）可自建角色、勾选权限、配置可见菜单；内置角色作为默认种子，可改可扩。
  - 平台种子角色：**超管 / 运营 / 客服 / 财务**
  - 租户种子角色：**店长 / 店员**
- **权限三层**：
  1. **功能权限**（操作码 `module:action`，如 `parcel:inbound`/`pickup:verify`/`staff:manage`）：后端 `@RequirePermission` 守卫 + 前端 `v-perm` 指令
  2. **菜单/路由权限**：角色→可见菜单，前端**动态路由**
  3. **数据范围**：租户内按**门店**隔离——店长 = 全租户门店；店员 = `staff_stations` 分配的门店；查询自动追加 `station_id IN (...)`
- **三道防线**：① 租户隔离(Postgres RLS, `tenant_id`) ② 功能权限(守卫+指令) ③ 数据范围(门店级 scope，service 层)——RLS 管租户之间，数据范围管租户内门店之间，正交配合。
- **实体**：`User`(type)、`Role`(scope, is_builtin)、`Permission`、`Menu`、`UserRole`、`RolePermission`、`RoleMenu`、`StaffStation`。
- **接口**：`login/refresh/logout`、角色 CRUD、分配权限/菜单、`getMyMenusAndPerms`、`@RequirePermission()`、上下文注入(tenantId + stationScope)。
- **JWT**：仅含 `userId/type/tenantId/roleCodes`，权限明细不入 token；登录后单独拉「我的菜单 + 按钮权限」，改权限即时生效。
- **依赖**：tenant（解析归属租户与门店范围）。

### 5.2 tenant（租户与入驻）
- **职责**：租户注册/审核/开通/停用、门店归属、租户级配置、入驻申请。
- **实体**：`Tenant`、`TenantApplication`（入驻申请）、`TenantConfig`。
- **接口**：`apply / approve / activate / suspend`、`getCurrentTenant`、RLS 上下文来源。
- **事件**：发 `TenantStatusChanged`。
- **依赖**：identity、billing。

### 5.3 billing（订阅计费）— P3
- **职责**：套餐、订阅、账单、用量计量（短信条数、包裹量）、欠费停用。计费模式 = **月费套餐(含基础额度) + 超额用量加费**。
- **实体**：`Plan`、`Subscription`、`Invoice`、`UsageRecord`。
- **接口**：`subscribe / renew / getInvoice / meter(usage)`。
- **事件**：订阅 `TenantStatusChanged`；发 `SubscriptionExpiring`。
- **依赖**：tenant、pay。

### 5.4 station（门店与货架库位）
- **职责**：门店信息、营业配置、货架与库位（区-排-层-位）、库位占用/分配规则。
- **实体**：`Station`、`Shelf`（货架，含编码/区位）、`Slot`（库位/格口，可选细粒度）。
- **接口**：`createStation`、`shelf CRUD`、`allocateSlot(parcel) / releaseSlot(slot)`、`querySlotMap`。
- **库位分配**：P1 规则化（按货架空闲度 + 包裹大小顺序分配）；P4 升级智能推荐（按取件频率/时段）。
- **事件**：订阅 `ParcelPickedUp/Returned`（释放库位）。
- **依赖**：parcel。

### 5.5 inbound（入库）
- **职责**：扫码/手动录入到件、绑定收件人手机号、生成取件码、调用库位分配、推进包裹至 STORED。
- **录入方式**：键盘扫码枪（监听输入框，今天可用）/ 手动录入 / 批量导入 / （P4）OCR 拍照识别。
- **接口**：`scanInbound(运单号, 手机号, 快递公司, 规格)`、`batchInbound`、`createPickupCode`。
- **取件码**：门店内当前在库唯一，短码（如 `1-2-3456` = 货架-排-序号 或纯数字 6 位），同时落 Redis（快速核销）与 DB。
- **事件**：发 `ParcelStored`。
- **依赖**：parcel、station、notify（间接，经事件）。

### 5.6 pickup（取件核销）
- **职责**：核销出库——校验取件码/手机号后四位/扫码，校验合法性，推进至 PICKED_UP，存证。
- **核销方式**：取件码 / 手机号后四位 / 包裹二维码扫描 /（P4）人脸。
- **接口**：`verifyByCode / verifyByPhoneTail / pickup(parcelIds[])`、`authorizePickup`（家人代取授权）。
- **并发保护**：核销加 Redis 锁 + 状态机校验，防重复出库。
- **事件**：发 `ParcelPickedUp`。
- **依赖**：parcel、station。

### 5.7 shipping（寄件）— P2
- **职责**：在线下单、智能选快递（比价/时效）、智能定价、揽收、支付、运单。
- **实体**：`ShipOrder`、`ShipOrderItem`、`PriceRule`。
- **接口**：`createOrder / quote / pay / collect / cancel`。
- **事件**：发 `ShipOrderCreated/Paid`。
- **依赖**：pay、logistics、parcel。

### 5.8 parcel（包裹核心域）
- **职责**：包裹聚合根 + 状态机的唯一权威；对外只暴露「合法的状态流转动作」，不让别的上下文直接改状态字段。
- **实体**：`Parcel`（聚合根）、`ParcelEvent`（状态变更流水/事件溯源）。
- **接口**：`store / pickUp / markException / resolveException / returnParcel / getById / query`。
- **依赖**：被 inbound/pickup/analytics 调用；发上述领域事件。

### 5.9 notify（通知适配）
- **职责**：统一通知出口，多渠道、模板化、可降级、可重试。
- **渠道**：站内消息（DB）/ 模拟短信（控制台+记录，今天可用）/ 真实短信（**腾讯云短信**，资质后）/ 微信模板/小程序订阅消息（认证后）/ H5 推送（Socket.IO）。
- **接口**：`NotifyChannel { send(target, template, params) }` + `NotifyService.notify(scene, payload)`。
- **机制**：BullMQ 异步发送 + 失败重试 + 发送记录；模板管理。
- **事件**：订阅 `ParcelStored/Overdue/Returned` 等，按场景发通知。

### 5.10 pay（支付适配）— P2
- **接口**：`PayChannel { createPayment / queryStatus / refund }`。
- **降级**：模拟支付（直接标记已付）；真实接微信支付商户号。

### 5.11 logistics（物流适配）— P2
- **接口**：`LogisticsProvider { getTrack(运单号) / subscribe }`。
- **降级**：模拟轨迹生成器；真实接快递100/快递鸟。

### 5.12 ocr / ai（智能适配）— P4
- **能力**：面单 OCR 识别入库、大模型智能客服、智能库位推荐、包裹量预测。
- **部署**：独立 `ai-service`（Python FastAPI）。
- **接口**：`OcrProvider { recognizeWaybill(image) }`、`AiAssistant { ask(question, context) }`。
- **降级**：OCR 未接入时回落手动录入；客服回落 FAQ 知识库。

### 5.13 file（存储适配）
- **接口**：`FileStorage { put / get / presignUrl }`，实现 MinIO（可换 OSS）。
- **用途**：面单图、取件存证照、破损件照片、导出报表。

### 5.14 analytics（统计与大屏）— 基础 P1，大屏 P2
- **职责**：经营指标聚合、实时大屏推送、报表导出。
- **指标**：今日入库/出库/在库、取件率、滞留榜、货架热力、各门店对比。
- **实现**：订阅领域事件做增量统计 + Redis 计数/ZSet 排行榜；大屏经 Socket.IO 推送；复杂报表离线聚合。

### 5.15 audit（操作日志）
- **职责**：AOP 拦截关键操作，记录「谁在哪个租户/门店做了什么」。
- **实体**：`AuditLog`（actor、tenant、action、target、time、ip、diff）。

### 5.16 member（会员/积分）— P2
- **职责**：收件人会员、积分获取/消费、优惠券、签到。
- **事件**：订阅 `ParcelPickedUp`（取件积分）、`ShipOrderPaid`（寄件积分）。

---

## 6. 数据模型（关键库表）

> 约定：所有业务表含 `id(uuid)`、`tenant_id`（平台级表除外）、`created_at`、`updated_at`、`deleted_at`（软删）、`created_by`。`tenant_id` 上建 RLS Policy 与联合索引。

**identity / tenant / billing**
- `users`(id, tenant_id?, type[platform|staff], username, password_hash, phone, status)
- `roles`(id, tenant_id?, code, name, scope[platform|tenant], is_builtin)
- `permissions`(id, code, name, module)
- `menus`(id, parent_id, code, name, path, perm_code, scope, sort)
- `user_roles`(user_id, role_id) / `role_permissions`(role_id, permission_id) / `role_menus`(role_id, menu_id)
- `staff_stations`(staff_id, station_id)  ← 员工↔门店分配，数据范围来源
- `tenants`(id, name, owner_name, contact_phone, status, plan_id)
- `tenant_applications`(id, applicant, contact, materials, status, reviewed_by)
- `plans`(id, code, name, price_monthly, quota_json)
- `subscriptions`(id, tenant_id, plan_id, period_start, period_end, status)
- `invoices`(id, tenant_id, amount, period, status)
- `usage_records`(id, tenant_id, metric, qty, occurred_at)

**station**
- `stations`(id, tenant_id, name, address, lng, lat, business_hours, status)
- `shelves`(id, tenant_id, station_id, code, area, rows, layers, capacity)
- `slots`(id, tenant_id, shelf_id, code, status[free|occupied], parcel_id?)

**parcel / inbound / pickup**
- `parcels`(id, tenant_id, station_id, waybill_no, carrier, consignee_phone, spec[normal|large|fresh|valuable], status, shelf_id, slot_id, pickup_code, stored_at, picked_at, version)
- `parcel_events`(id, tenant_id, parcel_id, from_status, to_status, action, operator_id, occurred_at)
- `pickup_authorizations`(id, tenant_id, parcel_id, authorized_phone, expires_at)
- `exceptions`(id, tenant_id, parcel_id, type[broken|wrong|ownerless|reject], note, photos, status, handler_id)

**shipping**
- `ship_orders`(id, tenant_id, station_id, sender_*, receiver_*, weight, volume, carrier, fee, status, waybill_no, paid_at)
- `price_rules`(id, tenant_id, carrier, first_weight_price, add_weight_price, area_factor)

**notify / 适配**
- `notifications`(id, tenant_id, scene, channel, target, template_code, params, status[pending|sent|failed], retry_count, sent_at)
- `notify_templates`(id, tenant_id?, code, channel, content)
- `payments`(id, tenant_id, biz_type, biz_id, amount, channel, status, trade_no)
- `logistics_tracks`(id, tenant_id, waybill_no, carrier, nodes_json, updated_at)

**支撑**
- `audit_logs`(id, tenant_id?, actor_id, action, target_type, target_id, diff, ip, created_at)
- `members`(id, phone, level, points) / `point_records`(id, member_id, change, reason, biz_id)
- `consumers`(id, phone, nickname)  ← 平台级收件人

---

## 7. 集成适配层（留口子统一模式）

统一模式：**定义接口 → 现在用可降级实现 → 配置开关切换真实实现**，核心业务零改动。

| 集成点 | 接口 | 现在的降级实现（无需资质/硬件） | 未来真实实现 |
|---|---|---|---|
| 扫码输入 | `ScanSource` | 键盘扫码枪（聚焦输入框监听）/ H5 摄像头解码 | PDA SDK |
| 短信通知 | `NotifyChannel` | 站内消息 + 控制台模拟发送 + 记录 | 阿里云短信 |
| 微信通知 | `NotifyChannel` | H5 站内消息 | 公众号模板消息 |
| 支付 | `PayChannel` | 模拟支付（标记已付） | 微信支付商户号 |
| 物流轨迹 | `LogisticsProvider` | 模拟轨迹生成 | 快递100/快递鸟 |
| 面单 OCR | `OcrProvider` | 手动录入/键盘扫码 | 云 OCR |
| 对象存储 | `FileStorage` | MinIO（自建） | 阿里云 OSS |

切换通过环境变量/配置中心控制（如 `NOTIFY_SMS_PROVIDER=mock|aliyun`），同一份业务代码不动。

---

## 8. 前端设计（3 个独立应用）

### 8.1 station-web（驿站工作台·前台）
- **定位**：店员高频操作，效率优先、键盘/扫码友好。
- **关键页**：工作台首页（今日概览）/ 入库（扫码录入工作台）/ 在库包裹 / 取件核销 / 货架库位图 / 寄件 / 异常件 / 店内统计 / 员工管理。
- **要点**：入库与核销页做成「扫一下即录入/即核销」的快捷流；全程支持键盘扫码枪。

### 8.2 admin-web（平台运营·后台）
- **定位**：平台方管控。
- **关键页**：租户管理 / 入驻审核 / 门店监控 / 订阅与账单 / 全局运营大屏 / 平台配置（套餐、模板、字典）/ 操作审计。

### 8.3 user-app（用户端）
- **技术**：**uni-app（Vue3 语法 + TS）**，一套代码编译 **微信小程序（P1 主目标）+ H5**；组件库 uView/uni-ui。
- **定位**：收件人/寄件人手机使用，跨门店按手机号聚合查件（见 3.4）。
- **登录态**：小程序走**微信登录（`wx.login`→code→openid）+ 绑定手机号**；H5 走**手机号验证码**；两者统一映射到平台级 `Consumer`（按手机号）。
- **关键页**：登录/授权 / 我的包裹（待取·已取·历史，跨门店）/ 取件码出示 / 代取授权 / 在线寄件 / 物流追踪 / 消息中心 / 会员积分。
- **扫码**：小程序用 `uni.scanCode`；H5 用 `vue-qrcode-reader`。

### 8.4 前端公共
- 共享 `request`（Axios 封装、租户头、错误码处理）、`api types`（与后端 contracts 对齐）、权限指令/路由守卫。

---

## 9. 横切关注点

- **鉴权与权限**：JWT（access + refresh）；**完整自定义 RBAC**（详见 5.1）——功能权限(操作码) + 菜单/动态路由 + 数据范围(门店级)三层；三道防线 = RLS 租户隔离 + 守卫/指令功能权限 + service 层门店 scope；平台/租户两套角色隔离。
- **领域事件总线**：`EventBus` 抽象，进程内同步/异步 → 演进 Redis Stream/Kafka；订阅方幂等。
- **异步任务（BullMQ）**：通知发送、滞留扫描（定时）、报表生成、订阅到期检查；多实例用任务唯一键/ShedLock 思路防重复。
- **缓存（Redis）**：取件码（核销加速）、短信验证码、统计计数、排行榜 ZSet；缓存与 DB 一致性用「写时失效」。
- **并发与幂等**：库位分配、取件核销加 Redis 分布式锁 + DB 乐观锁（`version`）；对外写接口带幂等键。
- **统一响应/异常**：`{ code, message, data }`，全局异常过滤器，业务错误码字典。
- **操作日志/审计**：AOP 拦截关键写操作。
- **可观测性**：pino 结构化日志 + 请求链路 ID；健康检查；（演进）Prometheus + Grafana。
- **安全**：密码 bcrypt；接口限流（登录/验证码）；RLS 防越权；输入校验（class-validator）；敏感信息脱敏（手机号）。

---

## 10. 关键业务流程（时序要点）

**入库**：扫码/录入运单+手机号 → parcel 创建(PENDING) → station 分配库位 → 生成取件码 → parcel→STORED → 发 `ParcelStored` → notify 异步通知收件人 → analytics 计数。

**取件核销**：店员输入取件码/手机号后四位 → pickup 校验(Redis+DB) → 加锁 → parcel→PICKED_UP → 发 `ParcelPickedUp` → station 释放库位 + member 积分 + analytics 计数 → 存证照入 MinIO。

**寄件**：用户下单 → shipping 报价(price_rule) → 选快递 → pay 模拟支付 → `ShipOrderPaid` → 店员揽收 → logistics 模拟轨迹 → 用户追踪。

**滞留扫描**：BullMQ 定时任务扫描 `STORED` 且超 N 天 → 发 `ParcelOverdueDetected` → notify 分级催取 → 超超期转 RETURNED。

**租户入驻**：申请 → 平台审核 → 开通(建租户/初始店长账号/默认门店) → `TenantStatusChanged` → billing 起订阅 → 通知开通。

---

## 11. 落地路线（分期）

| 期 | 主题 | 范围 | 交付物（可上线/可演示） |
|---|---|---|---|
| **P1** | MVP 核心闭环 | tenant(手动开店)+identity(完整自定义 RBAC：角色/权限/菜单/门店数据范围)+station(货架库位)+inbound+parcel(状态机)+pickup+notify(站内/模拟短信)+user-app(查件取件)+基础统计 | 一家驿站能真用：入库→通知→取件全流程跑通 |
| **P2** | 经营增强 | shipping+pay(模拟)+logistics(模拟)、滞留扫描催取、异常件、评价、member(积分)、运营大屏 | 一家店用得爽，功能闭环 |
| **P3** | SaaS 商业化 | billing(订阅计费)、自助入驻审核、平台运营后台完善、多门店监控、限流/熔断 | 能对外招商收费 |
| **P4** | 智能化 & 接真服务 | OCR 入库、大模型客服、智能库位/预测；短信/支付/物流/微信换真实接口 | 亮点齐备、生产就绪 |

每期独立走「设计细化 → 实现计划 → 实现 → 验收」，本总方案是它们共同的地基。

---

## 12. 部署与运维

- **Docker Compose**：`nginx`(托管 3 前端 + 反代 API) + `nest-api` + `ai-service` + `postgres` + `redis` + `minio`。
- **环境**：Spring/Nest Profiles 分 dev/prod；配置走环境变量；适配层 mock/real 开关。
- **数据迁移**：`prisma migrate`（版本化，禁手改库）。
- **备份**：Postgres 定时备份 + MinIO 桶；保留策略。
- **上线**：单机即可起；演进期前端 CDN、API 多实例 + 负载均衡。

---

## 13. 微服务演进路径

1. **触发条件**：某上下文成为瓶颈（如大促通知量、统计聚合压力）或需独立团队/独立发布节奏。
2. **先拆谁**：notify、analytics、ai（已独立）、file —— 它们与核心域耦合最松、负载最独立。
3. **怎么拆**：
   - EventBus 进程内 → Redis Stream/Kafka（订阅方代码不变）；
   - 模块对外契约（libs/contracts）从函数调用换 gRPC/HTTP；
   - 前面加 API 网关，按上下文路由；
   - 数据按上下文「表组」迁出到独立 Schema/库。
4. **不变量**：领域边界、契约、事件，从第一天就定好，拆分只是改通信方式与部署单元。

---

## 14. 关键决策记录（v1.1 已拍板）

| # | 议题 | 决策 | 落地影响 |
|---|---|---|---|
| 1 | 租户多门店 | **数据模型支持 1 租户 N 门店；P1 UI 先按单门店** | `stations` 自始支持多门店；P1 界面单店，做连锁不返工 |
| 2 | 用户端跨店查件 | **支持**：收件人按手机号跨门店聚合查件 | 走专用「消费者只读通道」（绕租户 RLS、仅返回该手机号数据），见 3.4 |
| 3 | 小程序 | **P1 就要小程序** | 用户端改用 **uni-app**，一套编译 微信小程序 + H5；小程序微信登录、H5 验证码 |
| 4 | 代收货款 COD | **暂不做** | 接口边界预留，未来再加；不进 P1~P2 |
| 5 | 订阅计费模式 | **月费 + 用量混合** | billing：月费套餐含基础额度 + 超额用量加费，P3 落地 |
| 6 | 真实短信服务商 | **腾讯云短信** | `NotifyChannel` 的真实实现按腾讯云做，P4 接入；现阶段模拟发送 |

> 如需再调整以上决策，更新本表并同步相关章节。

---

*本方案为整体设计基线，后续每期细化设计与实现计划均以此为准；如调整架构级决策需更新本文并记录变更。*
