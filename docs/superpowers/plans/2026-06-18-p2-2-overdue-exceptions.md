# P2-2 滞留与异常（Overdue Scan & Exceptions）详细设计

> 版本 v1.0（2026-06-18）｜ 配套《设计方案（整合版）v2.0》§4/§5/§9、《实现计划总表》P2-2
> 本文为**设计级文档**：给出数据模型、接口契约、领域事件、关键逻辑与流程、前端与任务分解。
> **不写完整实现代码**，仅在必要处给签名、表结构、状态流转、规则表与伪逻辑。
> 实现时由子代理据此展开为逐步 TDD 计划（粒度对齐 `2026-06-18-p1-foundation.md`）。

---

## 1. 目标 / 周期 / 依赖

### 1.1 目标
在 P1-2 驿站核心闭环之上，补齐**运营兜底**两条能力：

1. **滞留管理**：BullMQ 定时任务按租户/门店阈值扫描在库（`STORED`）超 N 天包裹，**分级预警**（提醒/催取/最终），发 `ParcelOverdueDetected`，由 notify 自动分级催取；**超超期**自动转 `RETURNED` 并释放库位。定时任务多实例运行用 ShedLock 思路（分布式锁占位）**防重复执行**。
2. **异常件管理**：店员对破损/错件/无主/拒收/超大件等异常包裹建**工单**，工单状态流转 `待处理 → 处理中 → 已解决`，处理方式含「联系快递 / 退回 / 重新入库 / 作废」；工单与 `parcel` 状态机衔接（进 `EXCEPTION`，归位回 `STORED`，退回转 `RETURNED`）。

### 1.2 周期
P2 增强期 · 建议顺序第 5 · 与 P2-1 仅共用 P1-2 基础，**可并行**。

### 1.3 依赖
| 依赖 | 来源 | 用到什么 |
|---|---|---|
| P1-1 | 后端地基 | RLS 多租户、JWT、RBAC（`@RequirePermission`/`v-perm`）、统一响应/异常、`TenantPrismaService`、`EventBus` 雏形 |
| P1-2 | 驿站核心闭环 | `parcel` 聚合与状态机、`parcel_events`、`notify`（`NotifyChannel`/模板）、库位占用/释放（`slot`）、Redis 锁工具 |
| Redis 7 / BullMQ | 基础设施 | 定时 repeatable job、worker、分布式锁 |
| 解耦先行 | P3-4 | 本期自带轻量 ShedLock 等价锁；P3-4 将其统一收口加固，本期接口预留可平滑替换 |

> 隐性验收（贯穿）：新表 `exceptions` 带 `tenant_id` + RLS + `FORCE ROW LEVEL SECURITY`；新事件订阅方幂等；并发热点加锁；收尾 e2e 冒烟；测试全绿。

---

## 2. 涉及上下文与模块

| 上下文 | 角色 | 本期新增/改动（设计级） |
|---|---|---|
| `core/queue`（新） | BullMQ 基础设施 | 队列注册、worker 装配、repeatable job 调度、`DistributedLock`（ShedLock 等价） |
| `parcel` | 心脏 | 滞留扫描编排、`markException`/`restock`/`returnParcel` 合法动作、发 `ParcelOverdueDetected`/`ParcelMarkedException`/`ParcelReturned` |
| `exceptions`（新） | 异常工单域 | `exception.service`、`exceptions` 表、工单状态机、与 parcel 衔接 |
| `notify` | 通知出口 | 三级催取模板 + 订阅 `ParcelOverdueDetected` 分级发通知（幂等去重） |
| `station` | 门店/库位 | 阈值配置读取（门店级 overdue 配置）；订阅 `ParcelReturned` 释放库位（P1-2 已有，复用） |
| `station-web` | 前端 | 异常件页（列表 + 标记异常 + 处理弹窗）、滞留催取看板 |

### 2.1 后端文件职责（锁定，便于展开）
```
backend/src/
├── core/queue/
│   ├── queue.module.ts            # 注册 Redis 连接 + 各队列 + worker
│   ├── queue.constants.ts         # 队列名/job 名常量
│   ├── repeatable.registrar.ts    # 应用启动注册 repeatable jobs（去重 jobId）
│   └── distributed-lock.ts        # ShedLock 等价：tryLock(key,ttl)/release（Redis SET NX PX）
├── parcel/
│   ├── overdue/overdue-scan.processor.ts   # 滞留扫描 worker（分页扫 STORED）
│   ├── overdue/overdue-policy.ts           # 分级规则（阈值→level）纯函数
│   ├── parcel.service.ts                   # +markException/+restock/+returnParcel
│   └── parcel.aggregate.ts                 # 状态机（P1-2 已有，补流转校验）
├── exceptions/
│   ├── exception.module.ts
│   ├── exception.service.ts       # 建单/查/认领/处理/解决
│   ├── exception.aggregate.ts     # 工单状态机（OPEN→IN_PROGRESS→RESOLVED）
│   └── exception.controller.ts    # 异常工单 REST
└── notify/
    └── subscribers/overdue.subscriber.ts   # 订阅 ParcelOverdueDetected → 分级发通知（去重）
```

---

## 3. 数据模型

### 3.1 新表 `exceptions`（异常工单）
> 约定（设计 §6）：`id(uuid)`、`tenant_id`、`created_at/updated_at/deleted_at(软删)`、`created_by`；`tenant_id` 建 RLS Policy + 联合索引。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | 工单号（对外可另发友好编号，见下） |
| `tenant_id` | uuid | 租户隔离键（RLS） |
| `station_id` | uuid | 门店 |
| `parcel_id` | uuid FK→parcels | 关联包裹（无主件可空，见 §6.3） |
| `code` | varchar | 友好工单号（如 `EX-yyyymmdd-序号`，租户内唯一） |
| `type` | enum `ExceptionType` | `DAMAGED`破损 / `MISDELIVERED`错件 / `UNCLAIMED`无主 / `REJECTED`拒收 / `OVERSIZED`超大件 |
| `status` | enum `ExceptionStatus` | `OPEN`待处理 / `IN_PROGRESS`处理中 / `RESOLVED`已解决 |
| `resolution` | enum `ExceptionResolution` null | `CONTACT_COURIER`联系快递 / `RETURN`退回 / `RESTOCK`重新入库 / `VOID`作废（解决时落定） |
| `severity` | enum `Severity` null | `LOW/MEDIUM/HIGH`（可选，破损/超大件默认偏高，用于排序与看板） |
| `description` | text | 上报描述 |
| `evidence_urls` | jsonb | 存证照 URL 列表（走 `file`，本期可空数组） |
| `assignee_id` | uuid null | 认领/处理人（进 `IN_PROGRESS` 时落） |
| `parcel_status_before` | varchar null | 标记异常前 parcel 状态快照（用于归位回滚判断） |
| `opened_at` | timestamptz | 建单时间 |
| `resolved_at` | timestamptz null | 解决时间 |
| `resolution_note` | text null | 处理说明 |

**索引**：`(tenant_id, status)`、`(tenant_id, station_id, status)`、`(tenant_id, parcel_id)`、`unique(tenant_id, code)`。
**RLS**：迁移内追加 `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `USING (tenant_id = current_setting('app.tenant_id')::uuid)` + 平台 `app.bypass_rls` 旁路（与 P1-1 其他表一致）。

### 3.2 `parcels` 相关字段（本期使用/补充）
| 字段 | 既有/新增 | 用途 |
|---|---|---|
| `status` | 既有 | `STORED/EXCEPTION/RETURNED` 流转目标 |
| `stored_at` | 既有（P1-2）/确认 | 入库进 `STORED` 的时间，**滞留计龄基准**（取件码生成时落） |
| `version` | 既有（乐观锁） | 滞留批量转 `RETURNED`、异常流转并发保护 |
| `last_overdue_level` | **新增** smallint default 0 | 已触达的最高催取级别（0/1/2/3），用于**分级去重**（同级别不重发） |
| `overdue_returned_at` | **新增** timestamptz null | 超超期转 `RETURNED` 时间（审计/统计） |

> 不为滞留单独建表：滞留是 parcel 的派生视图（`STORED` + 计龄 + `last_overdue_level`），扫描任务无状态化，仅读 parcel 写 parcel + 发事件。异常落 `exceptions` 表，因其有独立生命周期与处理人。

### 3.3 门店级滞留阈值配置
本期最小化：阈值默认全局常量（见 §6.1），**门店覆盖**字段挂在 `stations`（或复用 P3-3 `system_configs`，本期先读 `stations.overdue_config jsonb null`，缺省走默认）。结构：
```jsonc
{ "remindDays": 3, "urgeDays": 7, "finalDays": 11, "returnDays": 15 }
```
读取顺序：门店配置 → 租户默认 → 平台常量。

### 3.4 `notifications`（复用 P1-2）
新增分级催取模板键：`OVERDUE_REMIND` / `OVERDUE_URGE` / `OVERDUE_FINAL`（落 `notify_templates`）。无新表。

---

## 4. 接口与 API

### 4.1 端点表
> 统一响应 `{code,message,data}`；统一前缀 `/api`；均需 JWT；权限码格式 `module:action`。

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| POST | `/parcels/:id/exception` | `exception:create` | 标记包裹异常 → 建工单 + parcel 进 `EXCEPTION` |
| GET | `/exceptions` | `exception:read` | 工单列表（筛选 status/type/station/keyword + 分页） |
| GET | `/exceptions/:id` | `exception:read` | 工单详情（含 parcel 快照、处理轨迹） |
| POST | `/exceptions/:id/claim` | `exception:handle` | 认领 → `OPEN→IN_PROGRESS`，落 assignee |
| POST | `/exceptions/:id/resolve` | `exception:handle` | 解决 → `IN_PROGRESS→RESOLVED`，带 `resolution` + note，联动 parcel |
| GET | `/parcels/overdue` | `parcel:read` | 滞留看板：按级别聚合的在库滞留包裹（分页/筛选 level） |
| POST | `/parcels/overdue/scan` | `parcel:overdue:scan` | （平台/调试）手动触发一次滞留扫描（幂等，正式靠定时） |

> 无主件（`UNCLAIMED`）允许无 `parcel_id` 建单：另设 `POST /exceptions`（body 带 `type=UNCLAIMED` + 描述），权限同 `exception:create`；与 `/parcels/:id/exception` 共用 service。

### 4.2 服务接口签名（设计级，TS 伪签名）
```ts
// exceptions/exception.service.ts
interface CreateExceptionInput {
  parcelId?: string;            // 无主件可空
  stationId: string;
  type: ExceptionType;
  description: string;
  severity?: Severity;
  evidenceUrls?: string[];
}
createException(input: CreateExceptionInput): Promise<ExceptionDto>;   // 建单；有 parcelId 则推 parcel→EXCEPTION
claim(id: string, assigneeId: string): Promise<ExceptionDto>;         // OPEN→IN_PROGRESS
resolve(id: string, resolution: ExceptionResolution, note?: string): Promise<ExceptionDto>; // →RESOLVED + 联动 parcel
list(query: ExceptionQuery): Promise<Paginated<ExceptionDto>>;
get(id: string): Promise<ExceptionDetailDto>;

// parcel/parcel.service.ts（本期新增/补充）
markException(parcelId: string, reason: ExceptionType): Promise<void>;  // STORED→EXCEPTION，发 ParcelMarkedException
restock(parcelId: string): Promise<void>;                               // EXCEPTION→STORED（重新分配库位/复用原位）
returnParcel(parcelId: string, cause: ReturnCause): Promise<void>;      // EXCEPTION|STORED→RETURNED，发 ParcelReturned，释放库位

// parcel/overdue/overdue-scan.processor.ts
runOverdueScan(now?: Date): Promise<OverdueScanResult>;  // 分页扫 STORED 计龄分级；幂等；返回各级命中数

// parcel/overdue/overdue-policy.ts（纯函数）
classifyOverdue(storedAt: Date, now: Date, cfg: OverdueConfig): OverdueLevel; // 0/1/2/3

// core/queue/distributed-lock.ts
tryLock(key: string, ttlMs: number): Promise<boolean>;
release(key: string): Promise<void>;
```

---

## 5. 领域事件

> 进程内 `EventBus`（设计 §4.3）；订阅方**幂等**；演进期换 Redis Stream/Kafka，订阅方不变。

| 事件 | 发布方 | payload（关键） | 订阅方 / 副作用 |
|---|---|---|---|
| `ParcelOverdueDetected` | 滞留扫描 processor | `{tenantId, parcelId, stationId, level, storedAt, daysOverdue}` | `notify`：按 level 发对应催取通知（去重）；`analytics`（P2-4）：滞留计数 |
| `ParcelMarkedException` | `parcel.markException` | `{tenantId, parcelId, exceptionId, type}` | `analytics`：异常计数；（可选）notify 内部告警 |
| `ParcelReturned` | `parcel.returnParcel`（超期或工单退回） | `{tenantId, parcelId, cause: OVERDUE|EXCEPTION_RETURN}` | `station`：释放库位（P1-2 已订阅）；`analytics`：退回计数；`member`（P2-3）：不计积分 |

**幂等键约定**：
- 催取去重 = `parcelId + level`（写 `parcels.last_overdue_level`，同级别不重发；扫描重复投递同级别被拦）。
- `ParcelReturned` 订阅（释放库位）幂等 = parcel 已 `RETURNED` 或库位已空闲则跳过。

> 不新增 `ParcelOverdueReturned`，复用 `ParcelReturned` 带 `cause` 区分，订阅方按 cause 分流。

---

## 6. 关键逻辑

### 6.1 滞留分级规则（设计核心）
计龄基准 = `stored_at`；`daysOverdue = floor((now - stored_at) / 1d)`。默认阈值（门店可覆盖，见 §3.3）：

| Level | 名称 | 条件 | 动作 |
|---|---|---|---|
| 0 | 正常 | `< remindDays(3)` | 不处理 |
| 1 | 提醒 | `>= 3 且 < 7` | 发 `OVERDUE_REMIND`（温和提醒） |
| 2 | 催取 | `>= 7 且 < finalDays(11)` | 发 `OVERDUE_URGE`（明确催取） |
| 3 | 最终 | `>= 11 且 < returnDays(15)` | 发 `OVERDUE_FINAL`（最终告知将退回） |
| — | 退回 | `>= 15` | **转 `RETURNED`**（`cause=OVERDUE`），释放库位，不再催 |

`classifyOverdue` 为纯函数（易单测：构造不同 `stored_at` 验证边界 2/3/6/7/10/11/14/15 天）。**单调升级**：只在 `newLevel > last_overdue_level` 时发事件并更新 `last_overdue_level`（避免同级别重发，也避免阈值配置调小导致回退乱发）。

### 6.2 定时任务调度与防重复（ShedLock 思路）
- **调度**：BullMQ `repeatable job`，固定 `jobId`（如 `overdue-scan`）+ cron（如每日 02:00 与每小时各一次可配）。固定 jobId 保证多实例注册同一 repeatable 不重复堆叠。
- **防重复执行**：worker 进入 `runOverdueScan` 前先 `distributedLock.tryLock('lock:overdue-scan', ttl=扫描预算+缓冲)`；拿不到锁直接 return（另一实例在跑）。锁用 Redis `SET key val NX PX ttl`（ShedLock 等价），完成后 `release`（校验 value 防误删）。TTL 兜底防实例崩溃死锁。
- **按租户隔离扫描**：扫描在**平台 bypass** 下分页遍历 → 按 `tenant_id` 分组，每组进入对应租户上下文（`set_config app.tenant_id`）发事件，保证通知/计数落到正确租户。
- **分页 + 预算**：`WHERE status='STORED' AND stored_at <= now - remindDays` 按页处理，单次有处理上限，超时让下一周期续扫（计龄是绝对时间，幂等可断点续）。
- **幂等**：扫描无状态，重复跑只会因 §6.1 单调升级 + `last_overdue_level` 去重而不重复发通知/不重复退回（退回前判 `status='STORED'`）。

### 6.3 异常工单状态机
```
[OPEN 待处理] ──claim/认领──▶ [IN_PROGRESS 处理中] ──resolve(resolution)──▶ [RESOLVED 已解决]
```
| 流转 | 守卫 | parcel 联动 |
|---|---|---|
| 建单 `→OPEN` | parcel 当前为 `STORED`（无主件无 parcel）；同 parcel 无未结工单 | `markException`：parcel `STORED→EXCEPTION`，记 `parcel_status_before` |
| `OPEN→IN_PROGRESS` | 工单为 OPEN | 落 `assignee_id`、`opened_at` 不变 |
| `IN_PROGRESS→RESOLVED` | 工单为 IN_PROGRESS，必带 `resolution` | 按 resolution 分流（见下） |

非法流转（如 `OPEN→RESOLVED` 跳步、重复 resolve、已结单再改）抛业务错误码（沿用 P1-1 `api-code` 风格，新增 `EXCEPTION_INVALID_TRANSITION` 等）。

### 6.4 处理方式 → parcel 状态机衔接
| `resolution` | 含义 | parcel 动作 | 库位 |
|---|---|---|---|
| `RESTOCK` 重新入库 | 异常解除归位 | `restock`：`EXCEPTION→STORED`（复用/重分库位，重置 `last_overdue_level=0`） | 重新占用 |
| `RETURN` 退回 | 退回发件方 | `returnParcel(cause=EXCEPTION_RETURN)`：`EXCEPTION→RETURNED` | 释放 |
| `CONTACT_COURIER` 联系快递 | 错件/破损联系快递处理 | 默认保持 `EXCEPTION`（线下处理后再由后续 resolve 落 RESTOCK/RETURN）；本期允许直接 RESOLVED 但 parcel 仍 `EXCEPTION` 需二次处理，或在弹窗强制选最终去向（见前端约束） | 不变 |
| `VOID` 作废 | 无主/无法处理 | parcel 转 `RETURNED`（cause=EXCEPTION_RETURN）或保持 EXCEPTION+软结单；无主件无 parcel 则仅结工单 | 释放（若占位） |

> 设计约束：为避免「工单已解决但 parcel 永久卡 EXCEPTION」，**前端 resolve 弹窗对有 parcel 的工单，`resolution` 必须导出明确去向**——`RESTOCK→STORED` 或 `RETURN/VOID→RETURNED`；`CONTACT_COURIER` 视为中间态，提示「需后续二次处理」，不直接 RESOLVED（或 RESOLVED 后该 parcel 仍在异常清单）。最终去向收敛由 service 守卫保证。

### 6.5 与 parcel 状态机的整体衔接（设计 §4.1）
```
STORED ──标记异常──▶ EXCEPTION ──RESTOCK──▶ STORED
   │                    │
   │ 滞留>=15(OVERDUE)   │ RETURN/VOID
   ▼                    ▼
RETURNED ◀──────────────┘
```
所有流转经 `parcel.aggregate` 合法性校验（非法抛错），并发用乐观锁（`version`）+ 必要处 Redis 锁。

---

## 7. 业务流程

### 7.1 滞留扫描 → 催取 → 退回
```
BullMQ 定时触发(每日/每小时)
  → tryLock(lock:overdue-scan)  ── 拿不到 → 退出（防重复）
  → bypass 分页扫 status=STORED
     for each parcel:
        level = classifyOverdue(stored_at, now, 门店cfg)
        if level == RETURN(>=15):
           parcel.returnParcel(cause=OVERDUE) → ParcelReturned → 释放库位
        elif level > last_overdue_level:
           更新 last_overdue_level = level
           emit ParcelOverdueDetected(level)
  → release(lock)
ParcelOverdueDetected → notify.overdue.subscriber
  → 按 level 选模板(REMIND/URGE/FINAL) → 发站内+模拟短信（去重：同 parcel+level 不重发）
```

### 7.2 异常上报 → 处理 → 解决/退回
```
店员在 station-web 在库列表选包裹 → 「标记异常」
  → POST /parcels/:id/exception {type,description}
  → createException：建 exceptions(OPEN) + parcel.markException(STORED→EXCEPTION) + emit ParcelMarkedException
店员认领 → POST /exceptions/:id/claim → IN_PROGRESS（落 assignee）
店员处理弹窗选处理方式 → POST /exceptions/:id/resolve {resolution,note}
  ├ RESTOCK → parcel.restock(EXCEPTION→STORED)，库位重占，工单 RESOLVED
  ├ RETURN  → parcel.returnParcel(EXCEPTION→RETURNED)，释放库位，工单 RESOLVED
  ├ VOID    → parcel→RETURNED 或仅结单（无主件），工单 RESOLVED
  └ CONTACT_COURIER → 中间态，提示二次处理
```

---

## 8. 前端（station-web）

> 对齐高保真清爽蓝、全屏平铺布局；走统一请求层与 `v-perm` 按钮权限（P1-3 已建）。

### 8.1 异常件页（`/exceptions`）
- **列表**：工单号、类型（破损/错件/无主/拒收/超大件标签）、关联包裹（运单/取件码/手机尾号）、状态（待处理/处理中/已解决，状态色）、严重度、上报人、上报时间、处理人。
- **筛选**：状态、类型、门店、关键字（运单/取件码/手机）、分页。
- **入口**：在库列表行操作「标记异常」打开**上报弹窗**（选 type + 描述 + 上传存证）；本页 Tab/段控切「待处理 / 处理中 / 已解决」。
- **操作**：`OPEN` 行→「认领」；`IN_PROGRESS` 行→「处理」打开**处理弹窗**。按钮受 `exception:handle` 控制。

### 8.2 处理弹窗
- 展示工单与 parcel 详情、上报描述、存证图。
- **处理方式单选**：联系快递 / 退回 / 重新入库 / 作废，下方处理说明（必填）。
- 选「重新入库」提示「将归位回在库（STORED）」；选「退回/作废」提示「将退回并释放库位（RETURNED）」；选「联系快递」提示「中间处理，需后续二次确认去向」。
- 提交 → `POST /exceptions/:id/resolve`，成功后刷新列表 + Toast；失败按业务码提示（非法流转/状态冲突）。

### 8.3 滞留催取看板（`/parcels/overdue`）
- 按级别分组卡（提醒/催取/最终/将退回计数）+ 列表（包裹、滞留天数、级别、最近催取时间）。
- 只读为主（催取由定时自动），可保留「手动触发扫描」按钮（受 `parcel:overdue:scan`，调试/兜底）。

---

## 9. 任务分解

> 有序 Task（一句话 + 关键产物 + 验收要点）；进入执行时展开为逐步 TDD（红→绿→重构），每 Task 收尾 commit。

1. **BullMQ 基础设施 + 分布式锁** → 产物：`core/queue`（Redis 连接、队列/worker 注册、repeatable 注册、`DistributedLock`）。验收：注册一个 repeatable job 被消费的集成测绿；双实例并发 `tryLock` 仅一方成功的单测绿。
2. **滞留分级规则纯函数** → 产物：`overdue-policy.classifyOverdue` + `OverdueConfig` 解析（门店→租户→默认）。验收：边界 2/3/6/7/10/11/14/15 天分级单测绿。
3. **parcel 异常/退回/归位动作** → 产物：`parcel.service` `markException/restock/returnParcel` + aggregate 流转校验 + 乐观锁。验收：合法流转通过、非法（如 PICKED_UP 标异常）抛错单测绿。
4. **滞留扫描 processor** → 产物：`overdue-scan.processor.runOverdueScan`（分页、按租户分组、单调升级去重、>=returnDays 转 RETURNED）。验收：构造不同 stored_at 数据扫出正确分级、超期转 RETURNED 并释放库位、重复跑不重复发/退的单测绿。
5. **分级催取通知订阅** → 产物：`notify` 三级模板 + `overdue.subscriber`（按 level 发，`parcelId+level` 去重）。验收：分级触发正确模板、同级别不重发单测绿。
6. **exceptions 模型 + RLS + 工单 service/状态机** → 产物：`exceptions` 迁移（RLS+FORCE）、`exception.aggregate`、`exception.service`（建/认领/解决 + parcel 联动）。验收：标记→认领→解决（各 resolution 分流）流转单测绿、RLS 跨租户隔离生效、同 parcel 重复建单被拦。
7. **异常与滞留接口** → 产物：`exception.controller`（建/列表/详情/认领/解决 + 无主件建单）+ `GET /parcels/overdue` + `POST /parcels/overdue/scan`，权限码与守卫。验收：接口走通、`exception:create/read/handle` 权限校验生效、跨租户隔离。
8. **前端异常件页 + 处理弹窗 + 滞留看板（station-web）** → 产物：`/exceptions` 列表+上报弹窗+处理弹窗、`/parcels/overdue` 看板、API/store。验收：店员可标记异常、认领、按四种方式处理并见 parcel 去向变化、看滞留分级。
9. **P2-2 e2e 闭环冒烟** → 产物：`test/overdue-exception.e2e-spec.ts`（造滞留→扫描→分级催取→超期退回释放库位；标记异常→认领→处理 RESTOCK/RETURN）。验收：滞留与异常两条链路 e2e 绿。

---

## 10. 验收标准

- 定时滞留扫描**可调度**且多实例**单实例执行不重复**（分布式锁集成测验证）。
- 分级催取按 §6.1 规则触发，**同包裹同级别不重发**（`last_overdue_level` 单调升级去重）。
- 超超期（`>=returnDays`）正确转 `RETURNED`、释放库位、不再催。
- 异常工单 `OPEN→IN_PROGRESS→RESOLVED` 闭环；四种处理方式正确联动 parcel 状态机（`RESTOCK→STORED` / `RETURN|VOID→RETURNED` / `CONTACT_COURIER` 中间态收敛约束）。
- 所有领域事件（`ParcelOverdueDetected/ParcelMarkedException/ParcelReturned`）有订阅方且**幂等**。
- `exceptions` 表带 `tenant_id` + RLS + FORCE，跨租户隔离生效。
- 单测覆盖：分级边界、状态机合法/非法流转、去重、并发锁；e2e 跑通两条链路；测试全绿。
- 前端异常件页与处理弹窗可点通，按钮受 RBAC（`exception:*`）控制。

---

## 11. 依赖与风险

| 项 | 说明 | 缓解 |
|---|---|---|
| 依赖 P1-2 | 复用 parcel 状态机、库位释放订阅、notify、Redis 锁 | 若 P1-2 `stored_at`/库位释放未就绪，本期需先补这两点为前置 Step |
| 本期锁 vs P3-4 | ShedLock 用 Redis SET NX 轻量实现，非完整 ShedLock 表锁 | `DistributedLock` 接口收口，P3-4 替换为统一锁实现，调用方不改 |
| 计龄基准 | `stored_at` 必须在入库取件码生成时准确落库 | TDD 用例固定基准时间注入 `now`，避免时区/时钟漂移影响分级 |
| 扫描规模 | 大租户 STORED 量大，单次扫描耗时 | 分页 + 单次预算 + 下周期续扫；锁 TTL 覆盖预算 + 缓冲 |
| 阈值配置回退 | 管理员调小 returnDays 可能误退回大量在库 | 单调升级 + 退回前判 `status='STORED'`；退回为不可逆，建议配置变更走审计/确认（P3-3） |
| CONTACT_COURIER 悬挂 | 工单解决但 parcel 仍 EXCEPTION | 前端强制最终去向 + service 守卫；异常看板持续暴露未收敛 parcel |
| 通知风暴 | 同一扫描周期大量到级别 | notify 走 BullMQ 异步 + 重试 + 限速；分级去重天然削峰 |
| 平台 bypass 扫描安全 | 扫描用 bypass 遍历跨租户 | 仅扫描 processor 内部使用，按 tenant 分组后回到租户上下文发事件，不暴露给业务接口 |
