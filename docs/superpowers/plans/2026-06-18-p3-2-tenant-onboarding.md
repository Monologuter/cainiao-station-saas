# P3-2 自助入驻审核（Tenant Onboarding）详细设计

> 版本 v1.0（2026-06-18）｜ 周期 P3 商业化 ｜ 配套《设计方案（整合版）v2.0》§3.5/§5/§10、《实现计划总表》P3-2、《UI 设计规范》§8.2
> 本文为**设计级**文档：给出数据模型、接口契约、服务签名、状态机、编排逻辑与前端结构，不含完整实现代码（实现期再按 P1-1 粒度展开逐步 TDD）。

---

## 1. 目标 / 周期 / 依赖

### 1.1 目标

开放**自助入驻**，替代 P1 的「平台手动开店」：

- 驿站经营者在公开页**提交入驻申请**（主体信息 / 联系人 / 资质材料 / 拟开门店）；
- 平台运营在 `admin-web`**审核**（通过 / 驳回，驳回带原因）；
- 审核**通过即自动开通**——一个事务内建租户 + 默认门店 + 店长账号 + 分配默认套餐并起订阅；
- 开通发 `TenantApproved` / `TenantStatusChanged`，通知申请人。

P1-1 的 `tenant:create` 平台手动开店**保留**（运营兜底/补录通道），P3-2 的开通**复用**其开店逻辑，二者收口到同一段开通编排。

### 1.2 周期

P3 商业化（建议顺序第 9，紧随 P3-1 订阅计费）。

### 1.3 依赖

| 依赖 | 提供能力 | 本期如何用 |
|---|---|---|
| **P1-1 后端地基** | `TenantService.createTenant`（事务建租户+默认门店+店长角色+店长账号）、RLS、JWT、RBAC、统一响应、`bypass_rls` | 开通编排复用建店逻辑；申请表走 `bypass_rls` 平台通道 |
| **P3-1 订阅计费** | `PlanService`（套餐）、`SubscriptionService.start`（起订阅）、欠费联动租户状态 | 开通时为新租户分配默认套餐并起首期订阅 |
| **file（适配层）** | `FileStorage`（MinIO，预签名上传 / 取回） | 资质材料上传与审核时取回 |
| **notify** | 站内 + 模拟短信渠道、模板渲染、`NotificationRequested` | 审核结果通知申请人 |
| **core/event-bus** | 进程内 `EventBus`，订阅方幂等 | 发 `TenantApproved` / `TenantStatusChanged` |

> 软依赖：若 P3-1 未就绪可降级——开通时跳过起订阅、只建租户，留 TODO 钩子；本文按 P3-1 已就绪设计。

---

## 2. 涉及上下文与模块

主上下文 **`tenant`**（平台层，设计 §2.4），新增「入驻申请」子域；前端涉及**公开申请页**（官网/H5 入口，无需登录）与 **`admin-web` 入驻审核**。

```
backend/src/tenant/
├── tenant.module.ts                      # 注册 application/onboarding，依赖 billing/file/notify
├── tenant.service.ts                     # 【P1-1 既有】createTenant(开店)——被 onboarding 复用
├── tenant.controller.ts                  # 【P1-1 既有】POST /platform/tenants（手动开店，保留）
├── application/
│   ├── application.service.ts            # 申请提交/查询/审核状态机（platform 通道）
│   ├── application.controller.ts         # 公开提交 + 平台审核接口
│   ├── application.state.ts              # 申请状态机（合法流转表 + 守卫）
│   └── dto/                              # SubmitApplicationDto / ReviewDto / 查询 DTO
├── onboarding/
│   └── onboarding.service.ts             # 审核通过 → 开通编排（事务：建租户+门店+店长+起订阅）
└── events/
    └── tenant.events.ts                  # TenantApproved / TenantStatusChanged 定义
```

### 2.1 后端文件职责（锁定，便于展开）

| 文件 | 职责 | 不做什么 |
|---|---|---|
| `application.service.ts` | 申请 CRUD、防重复校验、状态流转（提交/通过/驳回）、调用 `onboarding` 开通、发审核结果通知事件 | 不直接建租户/订阅（委托 onboarding） |
| `application.state.ts` | 申请状态合法流转表 + `assertTransition()` 守卫 | 不碰持久化 |
| `onboarding.service.ts` | **唯一开通编排**：一个事务内建租户+默认门店+店长+起订阅，发 `TenantApproved`/`TenantStatusChanged`；幂等（同申请只开通一次） | 不写申请状态（由 application 在编排成功后置 APPROVED） |
| `application.controller.ts` | 公开提交（匿名 + 限流）、平台审核（`@RequirePermission`） | 不含业务逻辑 |
| `tenant.events.ts` | 事件 payload 契约 | — |

> 跨上下文调用：`onboarding.service` 通过**领域服务接口**调用 `billing` 的 `SubscriptionService`，不直连 billing 表（设计 §1.4「数据不串门」）。

---

## 3. 数据模型

> 约定（设计 §6）：`id(uuid)`、`created_at/updated_at/deleted_at(软删)`、`created_by`。

### 3.1 新表 `tenant_applications`（入驻申请，**平台级**）

`tenant_applications` 是**平台级表**——申请提交时尚无租户，故**不带 `tenant_id`**、**不挂租户 RLS**（与 `plans`、`consumers` 同类，见设计 §3/§6）。归属与访问控制改由「**平台权限 + 公开提交通道**」收口（§3.4）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | 申请单 ID |
| `application_no` | varchar 唯一 | 业务单号（如 `APP20260618-0001`），给申请人查询用 |
| `status` | enum | `PENDING` / `APPROVED` / `REJECTED`（§3.3） |
| **主体信息** | | |
| `entity_type` | enum | `INDIVIDUAL`(个体) / `COMPANY`(企业) |
| `entity_name` | varchar | 主体名称（驿站经营主体 / 公司名） |
| `unified_credit_code` | varchar? | 统一社会信用代码（企业必填，个体可空） |
| `region_code` | varchar | 经营所在行政区划码 |
| **联系人** | | |
| `contact_name` | varchar | 联系人姓名 |
| `contact_phone` | varchar | 联系人手机号（**防重复申请关键字段**，§6.5） |
| `contact_email` | varchar? | 邮箱（接收审核结果，可空） |
| **拟开门店** | | |
| `station_name` | varchar | 拟开门店名称 |
| `station_address` | varchar | 门店详细地址 |
| `proposed_plan_code` | varchar? | 申请人意向套餐（审核时可改；空则用平台默认套餐） |
| **资质材料** | | |
| `qualifications` | jsonb | 材料清单 `[{ type, fileKey, fileName, uploadedAt }]`（type∈营业执照/身份证正反面/门头照…），fileKey 为 MinIO 对象键（§6.6） |
| **审核轨迹** | | |
| `reviewed_by` | uuid? | 审核人（平台 user.id） |
| `reviewed_at` | timestamptz? | 审核时间 |
| `reject_reason` | varchar? | 驳回原因（REJECTED 必填） |
| `approved_tenant_id` | uuid? | 开通后回填的租户 ID（APPROVED 后非空，幂等锚点，§6.2） |
| `created_at/updated_at/deleted_at` | timestamptz | 标准字段 |

**索引**：`@@unique([application_no])`；`@@index([status, created_at])`（审核列表按状态+时间）；`@@index([contactPhone])`（防重查询）；活跃防重唯一索引见 §6.5。

```prisma
enum ApplicationStatus { PENDING APPROVED REJECTED }
enum EntityType { INDIVIDUAL COMPANY }

model TenantApplication {
  id                String            @id @default(uuid()) @db.Uuid
  applicationNo     String            @unique
  status            ApplicationStatus @default(PENDING)
  entityType        EntityType
  entityName        String
  unifiedCreditCode String?
  regionCode        String
  contactName       String
  contactPhone      String
  contactEmail      String?
  stationName       String
  stationAddress    String
  proposedPlanCode  String?
  qualifications    Json              // [{type,fileKey,fileName,uploadedAt}]
  reviewedBy        String?           @db.Uuid
  reviewedAt        DateTime?
  rejectReason      String?
  approvedTenantId  String?           @db.Uuid
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  deletedAt         DateTime?
  @@index([status, createdAt])
  @@index([contactPhone])
}
```

### 3.2 关联 / 复用的既有表（不改结构或仅回填）

| 表 | 来源 | 本期关系 |
|---|---|---|
| `tenants` | P1-1 | 开通时由 `createTenant` 新建；状态走 `TenantStatus`（ACTIVE/SUSPENDED/CLOSED） |
| `stations` | P1-1 | 开通时建**默认门店**（沿用 `code='S001'`），名称/地址用申请的 `station_name/station_address` |
| `users` / `roles` / `user_roles` | P1-1 | 开通时建店长账号 + 店长角色（`scope=TENANT`，`isBuiltin`） |
| `subscriptions` / `plans` | P3-1 | 开通时分配默认套餐并起首期订阅 |
| `notifications` | P1-2 | 审核结果通知落库 |

> `tenant_applications` 与 `tenants` **不建外键**（申请先于租户存在），仅靠 `approved_tenant_id` 弱关联，避免开通失败时的引用约束问题。

### 3.3 申请状态机（待审核 / 已通过 / 已驳回）

```
            ┌──────────── reject(reason) ──────────┐
            ▼                                       │
       [REJECTED] 已驳回（终态）            [PENDING] 待审核 ──┐
                                                 │  submit       │
            ┌──── approve→开通编排成功 ──────────┘               │
            ▼                                                    │
       [APPROVED] 已通过（终态，回填 approved_tenant_id）         │
                                                                 │
   （驳回后重新申请 = 新建一条 PENDING，原 REJECTED 不复用）◀──────┘
```

| 当前态 | 动作 | 目标态 | 守卫 / 副作用 |
|---|---|---|---|
| —（无） | `submit` | `PENDING` | 防重复校验（§6.5）；生成 `application_no` |
| `PENDING` | `approve` | `APPROVED` | **先跑开通编排成功**再置态并回填 `approved_tenant_id`（§6.2/§6.3）；需 `tenant:review` 权限 |
| `PENDING` | `reject` | `REJECTED` | `reject_reason` 必填；发驳回通知；需 `tenant:review` 权限 |
| `APPROVED` / `REJECTED` | 任意 | —（拒绝） | 终态，`assertTransition` 抛业务码 `1xxx`（非法流转） |

- 状态机由 `application.state.ts` 统一收口（对齐 parcel 状态机收口范式，设计 §4.1）；非法流转（如重复审核已通过单）抛业务异常，**不**静默。

### 3.4 RLS / 归属说明（关键设计点）

- `tenant_applications` **平台级、无 `tenant_id`、不挂租户 RLS**——若挂 RLS 会因申请时无租户上下文而全被过滤。
- **写隔离**改由通道与权限三道控制：
  1. **公开提交通道**：匿名只能 `INSERT`（提交），不能读他人申请；提交后仅返回 `application_no` + 状态，凭 `application_no` + `contact_phone` 查询自己那一条（§4.1 公开查询）。
  2. **平台读写通道**：列表 / 详情 / 审核全部 `@RequirePermission('tenant:read'|'tenant:review')`，且服务层走 `bypass_rls='on'` 事务（平台通道，对齐 P1-1 登录/开店的无租户上下文查询）。
  3. **开通后**新建的 `tenants/stations/users` 等业务数据照常带 `tenant_id` + RLS（沿用 P1-1 既有 Policy，新租户天然隔离）。
- 迁移内**无需**为 `tenant_applications` 加 `tenant_isolation_*` Policy；这是该表区别于普通业务表的显式例外，需在迁移注释中标注「平台级表，故意不挂租户 RLS」。

---

## 4. 接口与 API

### 4.1 端点表

> 统一响应 `{code,message,data}`；除标注「公开」外均需 JWT + 平台权限。公开端点加**接口限流**（防刷，设计 §9）。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/onboarding/qualifications/upload-url` | **公开**（限流） | 取资质材料**预签名上传 URL**（前端直传 MinIO），入参 `{ fileType, contentType }`，返回 `{ uploadUrl, fileKey }`（§6.6） |
| POST | `/onboarding/applications` | **公开**（限流） | 提交入驻申请（主体/联系人/拟开门店/qualifications[]）；返回 `{ applicationNo, status }` |
| GET | `/onboarding/applications/track` | **公开**（限流） | 申请人凭 `?applicationNo=&contactPhone=` 查自己申请的**状态与驳回原因**（不返回审核人等内部字段） |
| GET | `/admin/applications` | `tenant:read` | 平台审核列表：分页 + 按 `status`/关键字（主体名/联系人手机）/时间区间筛选 |
| GET | `/admin/applications/:id` | `tenant:read` | 申请详情（含资质材料**取回 URL**，§6.6） |
| POST | `/admin/applications/:id/approve` | `tenant:review` | 审核通过 → 触发开通编排；可在 body 覆盖 `planCode`/`stationName`；返回 `{ tenantId, ownerUsername }` |
| POST | `/admin/applications/:id/reject` | `tenant:review` | 驳回，body `{ rejectReason }`（必填） |

> 新增权限码：`tenant:read`（看租户/申请）、`tenant:review`（审核入驻）——平台 `scope=platform` 角色（超管/运营）勾选，写入 P1-1 种子（§9 任务）。`tenant:create`（手动开店）保留不变。

### 4.2 服务接口签名（设计级，TS 伪签名）

```typescript
// application.service.ts —— 申请域（platform 通道，bypass_rls）
interface SubmitApplicationInput {
  entityType: 'INDIVIDUAL' | 'COMPANY';
  entityName: string; unifiedCreditCode?: string; regionCode: string;
  contactName: string; contactPhone: string; contactEmail?: string;
  stationName: string; stationAddress: string; proposedPlanCode?: string;
  qualifications: { type: string; fileKey: string; fileName: string }[];
}
class ApplicationService {
  submit(input: SubmitApplicationInput): Promise<{ applicationNo: string; status: 'PENDING' }>;
  track(applicationNo: string, contactPhone: string): Promise<{ status: ApplicationStatus; rejectReason?: string }>;
  list(query: ListApplicationQuery): Promise<Paged<ApplicationListItem>>;
  detail(id: string): Promise<ApplicationDetail>;                 // 含资质取回 URL
  approve(id: string, reviewerId: string, override?: { planCode?: string; stationName?: string })
    : Promise<{ tenantId: string; ownerUsername: string }>;       // 内部委托 onboarding，再置 APPROVED
  reject(id: string, reviewerId: string, rejectReason: string): Promise<void>;
}

// onboarding.service.ts —— 唯一开通编排
interface ProvisionInput {                 // 由 approve 从申请单装配
  applicationId: string;
  tenantName: string; ownerName: string; ownerPhone: string;
  stationName: string; stationAddress: string;
  planCode: string;                        // override ?? proposedPlanCode ?? 平台默认
}
class OnboardingService {
  // 幂等：同 applicationId 已开通则直接返回既有结果（§6.2）
  provision(input: ProvisionInput): Promise<{ tenantId: string; stationId: string; ownerUserId: string; ownerUsername: string; tempPassword: string }>;
}

// 复用 P1-1（不改）：建租户+默认门店+店长角色+店长账号，返回 {tenantId, stationId, ownerUserId}
// TenantService.createTenant(input: CreateTenantInput)

// 复用 P3-1（接口调用，不直连表）：起首期订阅
// SubscriptionService.start({ tenantId, stationId, planCode }): Promise<{ subscriptionId }>
```

---

## 5. 领域事件

事件经进程内 `EventBus`（设计 §4.3/§9），订阅方**幂等**。

| 事件 | 发出时机 | Payload（关键字段） | 订阅方 / 副作用 |
|---|---|---|---|
| `TenantApproved` | 开通编排**成功提交后**（审核通过） | `{ applicationId, tenantId, stationId, ownerUserId, ownerUsername, planCode }` | `notify`：发「入驻通过 + 登录账号/初始密码引导」通知（站内 + 模拟短信，发至 `contact_phone`）；`analytics`：平台租户数 +1 |
| `TenantStatusChanged` | 开通成功（首次进入 ACTIVE）；后续停用/注销也复用 | `{ tenantId, from: null\|TenantStatus, to: TenantStatus, reason }` | `billing` / `station` / `analytics` 等关注租户生命周期者（对齐设计 §3.5/§4.3，与 P3-1 欠费置 SUSPENDED 同事件） |
| `ApplicationRejected`（内部） | 驳回成功 | `{ applicationId, contactPhone, rejectReason }` | `notify`：发驳回原因通知 |

设计取舍：

- `TenantApproved` 是 P3-2 引入的**新事件**（入驻语义，携申请上下文）；`TenantStatusChanged` 是设计 §4.3 **既有**事件（租户生命周期通用），开通时**两者都发**——前者驱动入驻专属通知/统计，后者让生命周期订阅方与停用/注销共用一条订阅。
- 事件在编排**事务提交成功后**发布（避免事务回滚而通知已发）；订阅方以 `applicationId`/`tenantId` 去重保证幂等。

---

## 6. 关键逻辑

### 6.1 申请状态机（收口）

`application.state.ts` 持有合法流转表（§3.3），暴露 `assertTransition(from, action)`；`approve/reject` 必先过守卫。终态（APPROVED/REJECTED）不可再流转——重复审核、审核已驳回单等都抛业务异常（非法流转码），保证审核动作可重放但语义安全。

### 6.2 审核通过的开通编排（事务建租户 + 门店 + 店长 + 订阅）—— **本期核心**

`OnboardingService.provision` 在**单一数据库事务 + `bypass_rls='on'`** 内顺序完成，任一步失败整体回滚（申请保持 PENDING，可重审）：

```
BEGIN (bypass_rls='on')
  0. 幂等检查：该 applicationId 已有 approved_tenant_id → 直接返回既有结果，不重复建
  1. 复用 TenantService.createTenant({ name, ownerName, ownerPhone, ownerPassword })
        → 建 tenant(ACTIVE) + 默认门店 station(code=S001) + 店长 role + 店长 user + user_role
           · ownerPhone = 申请 contact_phone（作为店长登录名，对齐 P1-1）
           · ownerPassword = 随机临时密码 tempPassword（通知里引导首登改密）
           · 门店名/地址用申请的 station_name/station_address 覆盖默认
        → 返回 { tenantId, stationId, ownerUserId }
  2. 分配套餐 + 起订阅（调 SubscriptionService.start，接口调用，不直连 billing 表）
        planCode = override.planCode ?? proposedPlanCode ?? 平台默认套餐
        → 建 subscription（绑 tenantId + stationId + planCode，首期账期）
  3. 回填申请单：approved_tenant_id = tenantId, status=APPROVED, reviewed_by/at
COMMIT
→ 事务后发 TenantApproved + TenantStatusChanged(from=null,to=ACTIVE)
→ notify 异步发「入驻通过」通知（含店长登录名 + 临时密码引导）
```

要点：

- **唯一开通入口**：手动开店（P1-1 controller）与自助开通**都**经 `createTenant` 这段建店逻辑（§6.4）；P3-2 在其外层包了「套餐订阅 + 申请回填 + 事件」，二者不分叉。
- **跨上下文边界**：步骤 2 走 `SubscriptionService` 接口，billing 表由 billing 自己写（设计 §1.4）。同一事务跨模块写入靠共享 `tx`（同库模块化单体允许），契约上仍是接口调用。
- **失败可重审**：编排失败 → 事务回滚 → 申请仍 PENDING → 运营可修正套餐/材料后重新点「通过」；幂等检查（步 0）防止重复点击建出两个租户。

### 6.3 编排与状态机的次序（防半成品租户）

`approve` 的次序固定为「**先编排成功，后置 APPROVED**」：

- 编排在事务内把 `status=APPROVED` 与 `approved_tenant_id` 一并写入（步 3），即「开通成功」与「状态已通过」**同事务原子**——不会出现「状态 APPROVED 但租户没建出来」或反之。
- 若仅想标记通过而不开通（理论上不允许）——本设计不提供该路径，APPROVED 永远蕴含「租户已开通」。

### 6.4 与 P1-1 手动开店的关系

| 维度 | P1-1 手动开店 | P3-2 自助开通 |
|---|---|---|
| 入口 | `POST /platform/tenants`（平台超管，`tenant:create`） | `POST /admin/applications/:id/approve`（`tenant:review`）经审核 |
| 触发 | 运营直接填表建店（兜底/补录） | 申请人提交 → 运营审核通过 |
| 建店逻辑 | `TenantService.createTenant` | **复用同一** `createTenant` |
| 套餐订阅 | P1 无（P3-1 起手动补） | 编排内**自动**分配默认套餐起订阅 |
| 申请记录 | 无 | 有 `tenant_applications` 轨迹 |

P1-1 接口**保留**（运营兜底）；P3-2 不删手动通道，只是把「常规入驻」改走审核流。两条路最终都落到 `createTenant`，开通副作用一致。

### 6.5 防重复申请

- **规则**：同一 `contact_phone` 不允许存在**多条活跃申请**（活跃 = `status=PENDING`）；`APPROVED`/`REJECTED` 为终态不算活跃。
- **实现（双保险）**：
  1. **DB 部分唯一索引**（首选）：`CREATE UNIQUE INDEX uniq_active_app ON tenant_applications(contact_phone) WHERE status='PENDING' AND deleted_at IS NULL;`——并发提交由数据库兜底，撞索引转友好业务码。
  2. **服务层预检**：`submit` 先查是否有该手机号的 PENDING 单，有则返回业务码（如 `APPLICATION_DUPLICATE`）+ 既有 `application_no`，提示「您已有待审核申请」。
- **已是租户的手机号**：`createTenant` 用 `contact_phone` 作店长登录名，`users` 有 `@@unique([tenantId,username])`——开通时若该手机号已是某租户店长，提交阶段额外提示「该手机号已注册门店」（查 users 平台通道），避免审核到开通才失败。
- 驳回后**允许**用同手机号重新申请（新建 PENDING，不复用旧单）。

### 6.6 资质材料上传

走 `file`（FileStorage / MinIO，设计 §7）的**预签名直传**，材料不经后端中转：

1. 前端调 `POST /onboarding/qualifications/upload-url` 取 `{ uploadUrl, fileKey }`（按 `fileType` 生成对象键，如 `onboarding/{yyyymm}/{uuid}-营业执照.jpg`）；
2. 前端 PUT 直传 MinIO；
3. 提交申请时把 `qualifications:[{type,fileKey,fileName}]` 一并提交（只存键，不存文件）；
4. 审核详情 `GET /admin/applications/:id` 返回每个 `fileKey` 的**临时取回 URL**（预签名 GET，短 TTL），平台审核人查看；
5. 校验：上传 URL 限定 `contentType`/大小白名单；提交时校验 `qualifications` 必含必需类型（企业=营业执照；个体=身份证正反面），缺失转业务码。

降级：P3 走 MinIO；若 file 未就绪可临时退化为「材料文字描述 + 后补」，但默认按 MinIO 直传设计。

---

## 7. 业务流程

### 7.1 申请 → 审核 → 开通 → 通知（主链路）

```
申请人(公开页)                平台运营(admin-web)              系统(tenant/billing/notify)
  │ 取上传URL→直传材料 ───────────────────────────────────▶ MinIO
  │ 提交申请(主体/联系人/门店/材料) ─▶ [PENDING] 落 tenant_applications
  │ ◀── 返回 applicationNo + 待审核
  │ （凭 no+phone 查状态）
  │                            │ 入驻审核列表(待审 .tag.amber)
  │                            │ 打开审核弹窗，查材料预签名URL
  │                            │
  │                            ├─ 通过 ─▶ approve ─▶ provision 事务：
  │                            │         建租户+默认门店+店长 (复用 createTenant)
  │                            │         + 起默认订阅 (SubscriptionService)
  │                            │         + 回填 approved_tenant_id, status=APPROVED
  │                            │       ─▶ 发 TenantApproved + TenantStatusChanged(→ACTIVE)
  │ ◀──── 通知:入驻通过+登录名+临时密码引导(站内/模拟短信) ◀── notify
  │                            │
  │                            └─ 驳回(填原因) ─▶ status=REJECTED ─▶ ApplicationRejected
  │ ◀──── 通知:驳回原因 ◀────────────────────────────────── notify
  │ (查状态见驳回原因，可重新申请)
```

### 7.2 异常与边界

- **编排中途失败**（如起订阅报错）：事务回滚，申请仍 PENDING，运营可重审；步 0 幂等防重复建租户。
- **重复点击「通过」**：第二次因 `approved_tenant_id` 已存在走幂等分支，返回既有结果，不建第二个租户。
- **审核已驳回/已通过单再操作**：`assertTransition` 抛非法流转业务码。
- **公开端点被刷**：限流（设计 §9）+ 防重唯一索引兜底。

---

## 8. 前端

### 8.1 公开入驻申请页（官网/H5 入口，无需登录）

- **定位**：独立公开页（非 station-web/admin-web 登录后页面），可挂官网或 H5 入口；走公开端点。
- **结构**（分步表单 `.form-grid` + `.field`/`.input`/`.select`）：
  1. **主体信息**：`entityType`（个体/企业 `.select`）、`entityName`、`unifiedCreditCode`（企业必填）、`regionCode`；
  2. **联系人**：`contactName`、`contactPhone`、`contactEmail`；
  3. **拟开门店**：`stationName`、`stationAddress`、`proposedPlanCode`（意向套餐 `.select`，可空）；
  4. **资质材料**：按 `entityType` 动态必填项（企业=营业执照；个体=身份证正反面），调上传 URL 直传，展示已上传文件名；
  5. 提交 → 展示 `applicationNo` + 「待审核」`.tag.amber`，提供「凭单号+手机号查询进度」入口（`track`）。
- 复用 kit token 与组件类；提交前端校验必填 + 手机号格式 + 必需材料齐全。

### 8.2 admin-web 入驻审核列表（`/applications`，高保真 `applications.html`）

- 侧栏分组「商业化」（设计 UI §8.2）。
- **`.toolbar`**：状态筛选 `.tabs`（待审/已通过/已驳回/全部）+ 关键字（主体名/联系人手机）+ 时间区间。
- **`.table-card`**：列 = 单号 / 主体名 / `entity_type .tag` / 联系人+手机（脱敏尾号 4 位）/ 拟开门店 / 提交时间 / 状态 `.tag`（待审 `.amber` / 通过 `.green` / 驳回 `.red`）/ 行操作「审核」。
- 待审条数走侧栏 `.nav a .badge`（红点计数）。
- `.pager` 分页。

### 8.3 审核弹窗（`.modal`，通过/驳回）

- **头部**：单号 + 主体名 + 状态。
- **主体**：只读展示申请全量字段（主体/联系人/拟开门店）+ **资质材料缩略/查看**（点开预签名 URL 大图）。
- **可调项**：`planCode`（套餐 `.select`，默认申请意向或平台默认）、`stationName`（可微调）。
- **底部 `.modal>.ft`**：
  - 「通过并开通」`.btn-primary` → `approve`，成功 toast「已开通租户 {tenantName}，店长账号 {phone}」并刷新列表（该行转 `.green`）；
  - 「驳回」`.btn-danger` → 弹原因输入（`reject_reason` 必填）→ `reject`，该行转 `.red`。
- 通过后弹窗内提示「初始密码已通过短信/站内通知发送给店长」（不在前端明示明文密码）。

---

## 9. 任务分解

> 进入执行期再按 P1-1 粒度展开逐步 TDD（红→绿→重构）。下为有序任务 + 关键产物 + 验收要点。

1. **入驻申请模型与迁移** → 产物：`tenant_applications` Prisma 模型 + 迁移（**显式不挂租户 RLS**，注释标注平台级表）+ 活跃防重部分唯一索引；验收：迁移成功、索引生效、`migrate` 幂等。
2. **申请状态机** → 产物：`application.state.ts`（合法流转表 + `assertTransition`）；验收：合法流转通过、终态再流转/重复审核抛业务码的单测绿。
3. **申请提交服务（含防重）** → 产物：`application.service.submit`（生成 `application_no`、防重双保险、资质必需项校验）；验收：提交建单、重复手机号 PENDING 被拒、必需材料缺失被拒的单测绿。
4. **资质上传与取回** → 产物：`upload-url`（预签名直传）+ 详情资质取回 URL，接 `FileStorage`；验收：取上传 URL、提交存 fileKey、详情返回可取回 URL 的集成测绿。
5. **开通编排 `onboarding.service.provision`** → 产物：事务复用 `createTenant` + 调 `SubscriptionService.start` + 回填申请 + 发 `TenantApproved`/`TenantStatusChanged`，含**幂等**；验收：一次开通后租户 ACTIVE、默认门店/店长/订阅齐备、店长可登录；重复调用不建第二租户的单测绿。
6. **审核动作（approve/reject）** → 产物：`application.service.approve`（先编排后置 APPROVED）/`reject`（发 `ApplicationRejected`）；验收：通过触发开通+置态原子、驳回必填原因+置 REJECTED 的单测绿。
7. **入驻接口 + 权限** → 产物：公开 `POST /onboarding/applications`、`/upload-url`、`/track`（限流，免登录）+ 平台 `GET /admin/applications(/:id)`、`approve`/`reject`（`tenant:read`/`tenant:review`）+ 新权限码写入 P1-1 种子；验收：公开提交免登录、审核需平台权限（无权返回 `1003`）的 e2e 绿。
8. **审核结果通知订阅** → 产物：`notify` 订阅 `TenantApproved`/`ApplicationRejected` 发站内+模拟短信（幂等）；验收：通过发账号引导、驳回发原因各一条的单测绿。
9. **公开申请页** → 产物：分步申请表单 + 材料直传 + 提交后单号/状态 + 进度查询；验收：可提交、看到「待审核」、凭单号查状态。
10. **admin-web 审核列表 + 弹窗** → 产物：列表（筛选/分页/待审 badge）+ 审核弹窗（看材料/调套餐/通过/驳回），对齐 `applications.html`；验收：平台可审核并触发开通、UI 对齐高保真清爽蓝。
11. **P3-2 e2e 冒烟** → 产物：`test/onboarding.e2e-spec.ts`（提交申请 → 审核通过 → 开通 → 店长登录 → 订阅生效；提交 → 驳回 → 收驳回通知 → 重新申请）；验收：自助入驻全链路 e2e 绿。

---

## 10. 验收标准

- **闭环**：申请 → 审核 → 开通 → 通知全链路 e2e 绿；通过后自动建租户（ACTIVE）+ 默认门店 + 店长账号 + 默认订阅，店长可登录、`/auth/me` 返回正确 `tenantId`。
- **权限边界**：公开提交免登录可达；列表/详情/审核需 `tenant:read`/`tenant:review`，无权返回业务码 `1003`；公开端点限流生效。
- **状态机**：合法流转通过、终态/重复审核非法流转被拒（单测覆盖）。
- **幂等与一致性**：开通编排同申请只建一个租户（重复点击/重放安全）；编排失败整体回滚、申请保持 PENDING 可重审。
- **防重复申请**：同手机号活跃 PENDING 唯一（DB 索引 + 服务预检）；驳回后可重新申请。
- **事件**：开通发 `TenantApproved` + `TenantStatusChanged(→ACTIVE)`，订阅方幂等；驳回发 `ApplicationRejected`。
- **资质材料**：预签名直传可用、审核可取回查看、必需材料校验生效。
- **RLS 例外正确**：`tenant_applications` 平台级不挂租户 RLS 而由权限/通道收口；开通后新租户业务数据照常 RLS 隔离。
- **与 P1-1 一致**：自助开通与手动开店共用 `createTenant`，开通副作用一致；手动开店通道保留可用。

---

## 11. 依赖与风险

| 项 | 说明 | 缓解 |
|---|---|---|
| 依赖 P3-1 订阅 | 开通编排步骤 2 需 `SubscriptionService.start` 与默认套餐 | P3-1 先行（建议顺序在前）；未就绪则降级跳过起订阅、留钩子，e2e 标记跳过订阅断言 |
| 依赖 P1-1 建店 | 复用 `createTenant`、`bypass_rls`、RBAC 种子 | 已交付；新增权限码追加进 P1-1 seed（与既有 `tenant:create` 并列） |
| 依赖 file/MinIO | 资质直传与取回 | 走适配层 `FileStorage`，未就绪可临时退化文字描述（默认按 MinIO） |
| **平台级表无 RLS** | `tenant_applications` 故意不挂租户 RLS，易被误判为漏配 | 迁移注释显式标注；公开端点只返回自身单据、平台端点强制权限；评审时作为「显式例外」核对 |
| **跨上下文事务** | 开通在单事务内跨 tenant/billing 写入（模块化单体借共享 tx） | 契约上仍走 `SubscriptionService` 接口；未来拆服务时此处改为 Saga/最终一致（编排已隔离在 onboarding，影响面可控） |
| 防重并发 | 同手机号并发提交 | DB 部分唯一索引兜底 + 服务预检；撞索引转友好业务码 |
| 临时密码安全 | 店长初始密码下发 | 随机临时密码，仅经通知渠道下发、前端不明示，引导首登改密 |
| 公开接口被刷 | 匿名提交/上传 URL 滥用 | 接口限流（设计 §9）+ 内容类型/大小白名单 + 防重索引；P3-4 加固期可加验证码 |
