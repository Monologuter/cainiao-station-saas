# P1-2 驿站核心闭环（Station Core Loop）· 详细设计

> 版本 v1.0（2026-06-18）｜ 配套《设计方案（整合版）v2.0》§4/§5/§6/§7、《实现计划总表》P1-2、地基《P1-1 后端地基》。
> 本文为**设计级别**文档：给出数据模型、接口与服务签名、事件、关键逻辑与规则、流程时序、任务分解与验收。**不含完整实现代码**，仅以签名/伪代码表达关键决策。
> 执行时由 subagent-driven / executing-plans 把每个 Task 展开为逐步 TDD（红→绿→重构）。

---

## 1. 目标 · 周期 · 依赖

**目标**：在 P1-1 地基之上实现驿站「代收」核心闭环——门店/货架/库位建模 + 包裹聚合根与状态机 + 入库（绑手机号、生成取件码、分配库位、置 STORED）+ 取件核销（并发安全）+ 通知（站内 + 模拟短信，BullMQ 异步）+ 进程内 EventBus，跑通 `PENDING → STORED →（通知）→ PICKED_UP` 全链路并有 e2e 闭环冒烟。`parcel` 是系统心脏，状态机是唯一权威。

**周期**：P1（MVP），建议顺序第 2（P1-1 之后、P1-3 之前）。

**依赖（直接复用 P1-1，不重写）**：
| 能力 | 来源 | 本期用法 |
|---|---|---|
| `PrismaService` | `core/prisma/prisma.service` | 无租户上下文的查询（含显式 bypass 事务） |
| `TenantPrismaService.withTenant(fn)` | `core/prisma/tenant-prisma.service` | 业务读写统一走它，自动注入 `app.tenant_id` GUC，RLS 过滤 |
| `TenantContext`（AsyncLocalStorage） | `core/tenant-context` | 取当前 `tenantId/userId/isPlatform`；BullMQ worker 需手动 `run()` 重建 |
| 统一响应 `{code,message,data}` + `AllExceptionsFilter` + `BizError(code,msg)` + `ApiCode` | `core/http` | 业务错误抛 `BizError`，新增本期业务码 |
| RLS 模式（`ENABLE/FORCE ROW LEVEL SECURITY` + `tenant_isolation_*` policy） | P1-1 Task6 迁移范式 | 每张新业务表照此追加 policy（隐性验收项） |
| `@RequirePermission(...codes)` + `PermissionGuard` + 全局 `JwtAuthGuard` | `identity` | 新接口挂功能权限码；新权限码进 seed |
| RBAC 种子（角色/权限/role_permissions） | `prisma/seed.ts` | 追加本期权限码并赋给「店长/店员」内置角色 |

**本期新增基础设施**：进程内 `EventBus`（Task1）、Redis 锁工具 `RedisLockService`、BullMQ 队列基础设施（notify 异步）。

---

## 2. 涉及上下文与模块

按设计 §2.4 限界上下文，本期落地 5 个业务上下文 + core 扩展。模块间**只走领域服务接口（同步）与 EventBus（异步）**，不互相直连对方的表。

| 上下文 | Nest 模块目录 | 职责 | 关键服务 |
|---|---|---|---|
| `core`（扩展） | `core/event-bus`、`core/redis`、`core/queue` | EventBus、Redis 客户端与分布式锁、BullMQ 装配 | `EventBus`、`RedisLockService`、`QueueModule` |
| `station` | `station/` | 门店、货架（区-排-层-位）、库位、库位分配；订阅取件/退回释放库位 | `StationService`、`ShelfService`、`SlotService`、`SlotAllocatorService`、`SlotReleaseSubscriber` |
| `parcel` | `parcel/` | 包裹聚合根 + 状态机（唯一权威）、事件落库 | `ParcelAggregate`、`ParcelService` |
| `inbound` | `inbound/` | 入库编排（录入→建包裹→分配库位→取件码→STORED→发事件）、取件码生成与缓存 | `InboundService`、`PickupCodeService` |
| `pickup` | `pickup/` | 取件核销（校验→锁→乐观锁→PICKED_UP→释放）；家人代取表结构预留 | `PickupService` |
| `notify` | `notify/` | 统一通知出口，多渠道可降级，订阅 `ParcelStored` 异步发通知 | `NotifyService`、`NotifyChannel`（接口）、`InAppChannel`、`MockSmsChannel`、`TemplateRenderer`、`ParcelStoredSubscriber` |

**依赖方向**（编译期单向，避免环）：`inbound → parcel / station / notify(事件)`；`pickup → parcel / station(事件)`；`station/notify` 仅**订阅** parcel 事件，不反向 import parcel 服务。跨上下文释放库位、发通知一律通过 EventBus 解耦。

```
inbound ──同步调用──▶ parcel(状态机) ─发事件▶ EventBus ─┬─▶ notify(异步发通知)
   │                                                     └─▶ analytics(P2-4, 计数)
   └─同步调用──▶ station.SlotAllocator(分配库位) / PickupCodeService(取件码)
pickup ──同步调用──▶ parcel(状态机) ─发事件▶ EventBus ───▶ station(释放库位)
```

---

## 3. 数据模型

> 约定（沿用设计 §6）：业务表含 `id uuid pk`、`tenant_id uuid`（平台级表除外）、`created_at/updated_at`、`deleted_at`（软删）、`created_by`。每张新表迁移内同步 `ENABLE + FORCE ROW LEVEL SECURITY` 并建 `tenant_isolation_<table>` policy（`bypass_rls='on' OR tenant_id = app.tenant_id`）。下表只列业务关键字段，省略公共审计字段。

### 3.1 新增表

**shelves（货架）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid | RLS |
| station_id | uuid FK→stations | 所属门店 |
| code | string | 货架编码（门店内唯一，如 `A`/`B`） |
| name | string | 货架名 |
| zone | string? | 区（可空，编码组成部分） |
| status | enum `ACTIVE/DISABLED` | 停用货架不参与分配 |
约束：`@@unique([station_id, code])`；索引 `@@index([tenant_id, station_id])`。

**slots（库位）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid | RLS |
| station_id | uuid FK→stations | 冗余，便于按门店查空闲与分配锁 |
| shelf_id | uuid FK→shelves | 所属货架 |
| code | string | 库位编码（门店内唯一，区-排-层-位，如 `A-01-02-03`） |
| row_no / level_no / col_no | int? | 排/层/位（编码语义化，便于排序与就近） |
| status | enum `FREE/OCCUPIED/DISABLED` | 空闲/占用/停用 |
| current_parcel_id | uuid? | 当前占用包裹（占用时写，释放置 null） |
| version | int @default(0) | 乐观锁（分配/释放并发） |
约束：`@@unique([station_id, code])`；索引 `@@index([tenant_id, station_id, status])`（查空闲位高频）。

**parcels（包裹聚合根 · 心脏）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid | RLS |
| station_id | uuid FK→stations | 入库门店 |
| waybill_no | string | 运单号 |
| carrier | string? | 快递公司 |
| receiver_phone | string | 收件人手机号（绑定，11 位） |
| receiver_phone_tail | string | 手机尾号（后 4 位，核销/查件用，建索引） |
| pickup_code | string? | 取件码（STORED 时有值，门店内在库唯一） |
| slot_id | uuid? FK→slots | 占用库位（释放后保留历史可空或清空，见 §6.4） |
| status | enum `PENDING/STORED/PICKED_UP/EXCEPTION/RETURNED` | 状态机当前态 |
| stored_at / picked_up_at | datetime? | 关键时点 |
| version | int @default(0) | 乐观锁（核销并发） |
索引：`@@index([tenant_id, station_id, status])`、`@@index([tenant_id, receiver_phone])`、`@@index([tenant_id, station_id, receiver_phone_tail, status])`（核销按尾号查在库）。
**取件码在库唯一**：用部分唯一索引（迁移手写）`CREATE UNIQUE INDEX ux_parcel_active_code ON parcels(station_id, pickup_code) WHERE status='STORED' AND deleted_at IS NULL`（详见 §6.3）。

**parcel_events（包裹事件流水，审计 + 溯源）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid | RLS |
| parcel_id | uuid FK→parcels | 关联包裹 |
| from_status / to_status | enum? / enum | 流转前后态（创建时 from 为空） |
| event_type | string | `INBOUND/STORED/PICKED_UP/EXCEPTION/RETURNED` 等 |
| operator_id | uuid? | 操作人（取自 TenantContext） |
| payload | jsonb? | 快照（取件码/库位/手机号尾号等） |
| created_at | datetime | 发生时间（流水只增不改） |
索引：`@@index([tenant_id, parcel_id, created_at])`。

**notifications（通知记录）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid | RLS |
| parcel_id | uuid? | 关联包裹（可空，通用化） |
| receiver_phone | string | 接收手机号 |
| channel | enum `IN_APP/SMS` | 渠道（对应 NotifyChannel 实现） |
| template_code | string | 使用的模板 |
| content | string | 渲染后内容 |
| status | enum `PENDING/SENT/FAILED` | 发送结果 |
| dedup_key | string | 幂等键（`parcel_id:event:channel`），唯一约束防重发 |
| sent_at | datetime? | 发送时间 |
| error | string? | 失败原因 |
约束：`@@unique([tenant_id, dedup_key])`（幂等核心）；索引 `@@index([tenant_id, parcel_id])`、`@@index([tenant_id, receiver_phone])`。

**notify_templates（通知模板）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid? | 可空=平台级默认模板；非空=租户自定义覆盖 |
| code | string | 模板码（如 `PARCEL_STORED`） |
| channel | enum `IN_APP/SMS` | 适用渠道 |
| content | string | 含占位符 `{code}{slot}{station}{tail}` 等 |
| enabled | boolean | 是否启用 |
约束：`@@unique([tenant_id, code, channel])`。平台默认模板由 seed 写入（`tenant_id=null`）。

**pickup_authorizations（家人代取授权 · 本期仅建表预留，不实现业务）**
| 字段 | 类型 | 说明 |
|---|---|---|
| tenant_id | uuid | RLS |
| owner_phone | string | 收件人手机号 |
| authorized_phone | string | 被授权人手机号 |
| status | enum `ACTIVE/REVOKED` | 状态 |
| expires_at | datetime? | 失效时间 |
> 本期只建模型 + RLS，便于后续 pickup 扩展；不暴露接口、不参与核销逻辑。

### 3.2 修改/复用表

- `stations`（P1-1 已有）：本期新增反向关系 `shelves[] / slots[] / parcels[]`，无字段变更。
- RBAC 表：seed 追加权限码（见 §4.3）。

### 3.3 RLS 说明

- 所有上表（含 `pickup_authorizations`）均为租户级，迁移内 `ENABLE + FORCE ROW LEVEL SECURITY` + `tenant_isolation_<table>` policy。
- 业务读写全部经 `TenantPrismaService.withTenant`，GUC `app.tenant_id` 自动注入。
- **取件码门店内查重、核销按尾号查在库**等查询天然在租户 RLS 内（同租户多门店时再按 `station_id` 过滤）。
- 跨门店查件（P1-3 消费者通道）不在本期范围；本期所有查询均为店内（同租户）视角。
- 平台超管（`isPlatform`）走 bypass，仅用于运维/e2e 造数，业务接口不开放跨租户。

---

## 4. 接口与 API

### 4.1 REST 端点表

> 统一前缀 `/api`，统一响应 `{code,message,data}`。权限码由 `@RequirePermission` 校验；未标注权限的需登录但仅需角色在租户内。

| 方法 | 路径 | 入参（body/query） | 出参（data） | 权限码 |
|---|---|---|---|---|
| POST | `/stations/:id/shelves` | `{code,name,zone?}` | 货架对象 | `station:manage` |
| GET | `/stations/:id/shelves` | — | 货架列表（含库位占用率） | `station:read` |
| POST | `/shelves/:id/slots/batch` | `{rows,levels,cols}` 或 `{codes:[]}` | `{created:int}` | `station:manage` |
| GET | `/shelves/:id/slots` | `?status=FREE` | 库位列表 | `station:read` |
| GET | `/stations/:id/slots/free` | `?limit` | 空闲库位列表 | `station:read` |
| POST | `/inbound` | `{stationId,waybillNo,carrier?,receiverPhone}` | `{parcelId,pickupCode,slotCode,status}` | `parcel:inbound` |
| GET | `/parcels` | `?status&phoneTail&pickupCode&page&size` | 分页包裹列表 | `parcel:read` |
| GET | `/parcels/:id` | — | 包裹详情（含事件流水） | `parcel:read` |
| POST | `/pickup` | `{stationId,pickupCode?,phoneTail?,parcelId?}` | `{parcelId,status,slotReleased:true}` | `parcel:pickup` |
| GET | `/notifications` | `?parcelId&phone&page&size` | 分页通知记录 | `parcel:read` |

> 说明：`POST /inbound`、`POST /pickup` 为对外写入口，**带幂等键**（见 §6）。`station_id` 由调用方传（首期单门店可由前端固定/从用户 scope 取）。家人代取、异常标记（EXCEPTION）、退回（RETURNED）接口属 P2-2，本期状态机已支持流转但不开放对应 REST 端点（仅 e2e/内部可触发）。

### 4.2 关键领域服务接口签名

> 仅签名 + 语义，实现 TDD 时补。所有读写默认在 `TenantPrismaService.withTenant` 内。

**core / EventBus**（进程内）
```ts
interface DomainEvent { name: string; payload: Record<string, unknown>; occurredAt: Date; eventId: string; }
class EventBus {
  publish(event: DomainEvent): Promise<void>;            // 同步分发给所有订阅者；订阅者异常隔离（不影响发布方与其它订阅者）
  subscribe(name: string, handler: (e: DomainEvent) => Promise<void>): void;
}
```

**core / RedisLockService**
```ts
class RedisLockService {
  // SET key val NX PX ttl；返回是否拿到锁与释放函数（释放用 Lua 校验 token 防误删）
  acquire(key: string, ttlMs: number): Promise<{ ok: boolean; release: () => Promise<void> }>;
  withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>; // 拿不到锁抛 BizError(LOCK_BUSY)
}
```

**station**
```ts
class StationService {
  createShelf(stationId: string, input: { code: string; name: string; zone?: string }): Promise<Shelf>;
  listShelves(stationId: string): Promise<ShelfWithUsage[]>;            // 含占用率
}
class SlotService {
  batchCreate(shelfId: string, spec: BatchSlotSpec): Promise<{ created: number }>; // 区-排-层-位生成编码
  listByShelf(shelfId: string, status?: SlotStatus): Promise<Slot[]>;
  listFree(stationId: string, limit?: number): Promise<Slot[]>;
}
class SlotAllocatorService {
  allocate(stationId: string): Promise<Slot>;     // 选首个 FREE → 锁 → 乐观锁置 OCCUPIED；无空位抛 BizError(NO_FREE_SLOT)
  release(slotId: string): Promise<void>;          // 置 FREE、清 current_parcel_id（幂等）
}
// 订阅者：ParcelPickedUp / ParcelReturned → release(slotId)
class SlotReleaseSubscriber { onParcelPickedUp(e): Promise<void>; onParcelReturned(e): Promise<void>; }
```

**parcel**（状态机收口）
```ts
type ParcelStatus = 'PENDING'|'STORED'|'PICKED_UP'|'EXCEPTION'|'RETURNED';
class ParcelAggregate {
  static canTransit(from: ParcelStatus, to: ParcelStatus): boolean;   // 查合法流转表
  static assertTransit(from: ParcelStatus, to: ParcelStatus): void;   // 非法抛 BizError(ILLEGAL_TRANSITION)
}
class ParcelService {
  create(input: CreateParcelInput): Promise<Parcel>;                  // PENDING + 写 parcel_events(INBOUND)
  markStored(parcelId: string, p: { pickupCode: string; slotId: string }): Promise<Parcel>; // →STORED, 发 ParcelStored
  markPickedUp(parcelId: string, expectedVersion: number): Promise<Parcel>; // 乐观锁 →PICKED_UP, 发 ParcelPickedUp
  // 预留（本期状态机支持、REST 不暴露）：markException / markReturned
  findInStore(stationId: string, by: { pickupCode?: string; phoneTail?: string }): Promise<Parcel|null>;
}
```

**inbound**
```ts
class PickupCodeService {
  generate(stationId: string): Promise<string>;     // 门店内在库唯一短码；Redis 占位加速 + DB 部分唯一索引兜底
  release(stationId: string, code: string): Promise<void>; // 核销/退回后从 Redis 集合移除（DB 索引随状态变更自然失效）
}
class InboundService {
  inbound(input: { stationId: string; waybillNo: string; carrier?: string; receiverPhone: string }, idempotencyKey?: string)
    : Promise<{ parcelId: string; pickupCode: string; slotCode: string; status: 'STORED' }>;
  // 编排：建 PENDING → 分配库位 → 生成取件码 → markStored(发 ParcelStored) ；幂等键防同运单重复入库
}
```

**pickup**
```ts
class PickupService {
  pickup(input: { stationId: string; pickupCode?: string; phoneTail?: string; parcelId?: string })
    : Promise<{ parcelId: string; status: 'PICKED_UP'; slotReleased: true }>;
  // 编排：定位在库包裹 → Redis 锁(parcel) → 乐观锁 markPickedUp(发 ParcelPickedUp) → 释放取件码
}
```

**notify**
```ts
interface NotifyChannel { readonly channel: 'IN_APP'|'SMS'; send(msg: RenderedMessage): Promise<{ ok: boolean; error?: string }>; }
class TemplateRenderer { render(code: string, channel, vars: Record<string,string>): Promise<{ content: string }>; }
class NotifyService {
  notifyParcelStored(payload: ParcelStoredPayload): Promise<void>; // 渲染 + 入队（每渠道一条，带 dedup_key）
}
// 订阅者：ParcelStored → 入 BullMQ 队列 → worker 调 NotifyService 各渠道发送、落 notifications
class ParcelStoredSubscriber { onParcelStored(e): Promise<void>; }
```

### 4.3 权限码（追加进 seed，赋给租户内置角色）

| 权限码 | 名称 | 模块 | 店长 | 店员 |
|---|---|---|---|---|
| `station:manage` | 货架库位管理 | station | ✓ | ✗ |
| `station:read` | 查看门店/货架/库位 | station | ✓ | ✓ |
| `parcel:inbound` | 入库 | parcel | ✓ | ✓ |
| `parcel:pickup` | 取件核销 | parcel | ✓ | ✓ |
| `parcel:read` | 查看包裹/通知 | parcel | ✓ | ✓ |

> 内置角色「店长」=全部本期权限；「店员」=日常操作（read/inbound/pickup）不含货架管理。`role_permissions` 在 seed 内 upsert。

---

## 5. 领域事件

> 进程内 `EventBus`（设计 §4.3/§9）。订阅方**必须幂等**（重复投递只生效一次）。事件携带最小必要快照，订阅方不反查发布方私有表。

| 事件 | 发布者 | 触发时机 | payload（关键） | 订阅者（本期） |
|---|---|---|---|---|
| `ParcelStored` | `ParcelService.markStored` | 包裹置 STORED | `{parcelId, tenantId, stationId, receiverPhone, pickupCode, slotCode}` | `notify`（入队发通知）；（P2-4 analytics 计数） |
| `ParcelPickedUp` | `ParcelService.markPickedUp` | 包裹置 PICKED_UP | `{parcelId, tenantId, stationId, slotId}` | `station`（释放库位）；（P2-3 member 记积分、P2-4 计数） |
| `ParcelReturned` | `ParcelService.markReturned`（本期预留） | 退回 | `{parcelId, tenantId, slotId}` | `station`（释放库位） |

**幂等约定**：
- 通知侧：`notifications.dedup_key = parcelId:ParcelStored:<channel>` 唯一约束，重复事件插入冲突即跳过（已发不重发）。
- 库位释放侧：`SlotAllocatorService.release` 对已 FREE 的库位为 no-op（幂等）；释放前校验 `slot.current_parcel_id == parcelId` 再释放，防错放。
- `EventBus` 不做投递保证（进程内同步）；持久化幂等在订阅方落库约束兜底，演进到 MQ 时语义不变。

---

## 6. 关键逻辑与规则

### 6.1 状态机合法流转校验

合法流转表（设计 §4.1，`parcel` 唯一权威，对外只暴露合法动作）：

| from \ to | STORED | PICKED_UP | EXCEPTION | RETURNED |
|---|---|---|---|---|
| PENDING | ✓ | ✗ | ✓ | ✗ |
| STORED | ✗ | ✓ | ✓ | ✓ |
| EXCEPTION | ✓(归位) | ✗ | ✗ | ✓ |
| PICKED_UP / RETURNED | ✗（终态） | ✗ | ✗ | ✗ |

- `ParcelAggregate.assertTransit(from,to)` 查上表，非法抛 `BizError(ILLEGAL_TRANSITION)`。
- 本期 REST 仅驱动 `PENDING→STORED`（入库）与 `STORED→PICKED_UP`（核销）；`EXCEPTION/RETURNED` 流转在状态机内已就绪，P2-2 接入。
- 所有状态推进都经 `ParcelService`，推进时**同事务**写一条 `parcel_events`（from/to/operator/payload），保证状态与事件流水一致（事务边界由 `withTenant` 提供）。

### 6.2 库位分配规则（`SlotAllocatorService.allocate`）

P1 规则化（设计 §5 station：P1 规则化、P4 智能推荐）：
1. 查门店内 `status=FREE AND shelf.status=ACTIVE` 的库位，按 `(zone, row_no, level_no, col_no, code)` 排序取**首个**（就近/顺序）。
2. 对候选库位加 **Redis 锁** `lock:slot:<slotId>`（短 TTL，如 5s）防并发占同位。
3. 锁内用**乐观锁** `UPDATE slots SET status=OCCUPIED, current_parcel_id=:pid, version=version+1 WHERE id=:id AND status='FREE' AND version=:v`；
   - 影响行数=0（被抢占）→ 释放锁、回到步骤 1 重试下一个（有限重试次数，如 5 次）。
4. 全部无空位 → 抛 `BizError(NO_FREE_SLOT)`（业务码，前端提示「库位已满」）。
> Redis 锁防「同位竞争」，乐观锁防「锁失效/锁未覆盖」双保险（设计 §9 并发幂等）。

### 6.3 取件码生成规则（`PickupCodeService.generate`）

要求：**门店内在库（STORED）唯一** + Redis 加速 + DB 兜底。
1. 生成候选短码：店内序号/随机短码（如 4~6 位数字，避免易混字符）。
2. **Redis 加速防重**：维护门店在库取件码集合 `code:set:<stationId>`（SADD NX 语义，或 `SET pcode:<station>:<code> NX EX`）。候选码 Redis 占位成功→进入下一步；占位失败→重新生成（有限重试）。
3. **DB 兜底唯一**：`parcels` 上的部分唯一索引 `ux_parcel_active_code (station_id, pickup_code) WHERE status='STORED'` 是最终真理；`markStored` 写入时若违反唯一约束→重生成重试。Redis 仅加速，索引保证正确性（Redis 与 DB 不一致时以 DB 为准）。
4. 核销/退回（离开 STORED）后：`PickupCodeService.release` 从 Redis 集合移除该码（DB 部分索引因 status 改变自然不再占用），码可被复用。
> 关键决策：唯一性边界 = **门店 + 在库状态**（已取件的旧码可复用，规模可控）；Redis 是性能优化层，正确性由 DB 部分唯一索引保证，避免「Redis 挂了就发重码」。

### 6.4 核销并发安全（`PickupService.pickup`）

双重保护（设计 §9：Redis 锁 + 乐观锁）：
1. **定位**：按 `pickupCode` 或 `phoneTail`（在库且属本门店）查包裹；尾号命中多条→要求进一步选择/报歧义（`BizError(AMBIGUOUS_PICKUP)`）；无命中→`BizError(PARCEL_NOT_FOUND)`；非 STORED→`BizError(ILLEGAL_TRANSITION)`。
2. **Redis 锁** `lock:parcel:<parcelId>`（TTL 如 10s），防同一包裹并发重复核销。
3. **乐观锁更新**：`UPDATE parcels SET status='PICKED_UP', picked_up_at=now(), version=version+1 WHERE id=:id AND status='STORED' AND version=:v`；
   - 影响行数=1 → 成功，发 `ParcelPickedUp`，写 `parcel_events(PICKED_UP)`，`PickupCodeService.release`。
   - 影响行数=0（已被取走）→ 抛 `BizError(ALREADY_PICKED_UP)`（并发重复核销只成功一次）。
4. **库位释放走事件**：核销事务只改 parcel，`station.SlotReleaseSubscriber` 收 `ParcelPickedUp` 后 `release(slotId)`（解耦 + 幂等：校验 `current_parcel_id==parcelId`）。`parcels.slot_id` 保留为历史引用便于追溯。
> 幂等：同一核销请求带幂等键（可选）；并发由「Redis 锁 + 乐观锁版本」共同保证「只成功一次」，这是验收硬指标。

### 6.5 通知异步（notify · BullMQ）

- 订阅 `ParcelStored`：`ParcelStoredSubscriber` **只入队**（`notify` 队列 + jobId=`parcelId:ParcelStored` 防重复入队），不在订阅回调里同步发，避免阻塞发布方与事件分发。
- worker 消费：`TenantContext.run(...)` 重建租户上下文 → `TemplateRenderer.render` → 对 `[InAppChannel, MockSmsChannel]` 逐渠道 `send`，每渠道落一条 `notifications`（带 `dedup_key`，唯一冲突即视为已发跳过）。
- `MockSmsChannel`：控制台打印模拟短信（设计 §7 短信降级实现），`status=SENT`；`InAppChannel`：写站内通知记录。
- 重试：BullMQ job 配置 `attempts + backoff`；最终失败 `notifications.status=FAILED` 记 `error`（不影响主链路）。
- 渠道选择由配置开关 `NOTIFY_SMS_PROVIDER=mock`（设计 §7），P4 切真服务时业务零改动。

### 6.6 幂等键（对外写）

- `POST /inbound`：可选 `Idempotency-Key`（或以 `tenant+station+waybillNo` 在 STORED/PENDING 去重）——同运单短时间重复提交返回首次结果，不建重复包裹。
- `POST /pickup`：核销天然由乐观锁保证「只成功一次」；幂等键用于网络重试场景返回同一结果。

---

## 7. 业务流程（时序）

**入库 → 取件码 + 通知 → 核销 → 释放库位**

```
店员                InboundService        SlotAllocator    PickupCodeService   ParcelService(状态机)   EventBus        notify(BullMQ)    station(释放)
 │  POST /inbound       │                      │                  │                   │                  │                 │                 │
 │─────────────────────▶│                      │                  │                   │                  │                 │                 │
 │            create(PENDING)─────────────────────────────────────────────────────────▶│ 写 parcel_events │                 │                 │
 │                      │  allocate(stationId) │                  │                   │                  │                 │                 │
 │                      │─────────────────────▶│ 锁+乐观锁占位     │                   │                  │                 │                 │
 │                      │  generate(stationId) │                  │                   │                  │                 │                 │
 │                      │────────────────────────────────────────▶│ Redis占位+码      │                  │                 │                 │
 │                      │  markStored(code,slot)──────────────────────────────────────▶│ →STORED,events   │                 │                 │
 │                      │                      │                  │                   │ publish ParcelStored─▶│ enqueue        │                 │
 │◀─{pickupCode,slot}───│                      │                  │                   │                  │                 │ worker:渲染+发  │                 │
 │                      │                      │                  │                   │                  │                 │ InApp+MockSms   │                 │
 │                      │                      │                  │                   │                  │                 │ 落 notifications│                 │
 │  POST /pickup        │  (PickupService)     │                  │                   │                  │                 │                 │
 │─────────────────────────────────────────────────────────────────────────────────▶ 定位+Redis锁       │                  │                 │                 │
 │                      │                      │                  │                   │ 乐观锁 →PICKED_UP │                  │                 │                 │
 │                      │                      │                  │  release(code)◀──│ publish ParcelPickedUp─▶│            │ onPickedUp:     │
 │◀─{status:PICKED_UP}──────────────────────────────────────────────────────────────│                  │                 │                 │ release(slot)→FREE
```

要点：入库为单 controller 编排多服务（一个 `withTenant` 事务覆盖建包裹/占库位/置 STORED，取件码 Redis 占位在事务外或同事务尾，发事件在提交后）；通知与库位释放均经事件**异步/解耦**，主链路只对 `parcel` + `slot` 写一致事务。

---

## 8. 任务分解（有序 Task）

> 每个 Task：**做什么 / 产物 / 验收要点**。执行时展开为逐步 TDD（红→绿→重构），每 Task 结束 commit（约定式）。沿用 P1-1 文件结构与风格。

1. **core/EventBus 抽象与进程内实现**
   - 做什么：`DomainEvent` 类型、`EventBus.publish/subscribe`，订阅者异常隔离。
   - 产物：`core/event-bus/event-bus.ts` + 单测。
   - 验收：发布触发所有订阅者；某订阅者抛错不影响其它与发布方；重复事件由订阅方幂等约定（单测覆盖一次性生效）。

2. **core/Redis 客户端与分布式锁**
   - 做什么：`ioredis` 客户端 provider；`RedisLockService.acquire/withLock`（SET NX PX + Lua 安全释放）。
   - 产物：`core/redis/redis.service.ts`、`redis-lock.service.ts` + 单测/集成测。
   - 验收：并发 `withLock` 同 key 串行；拿不到锁抛 `BizError(LOCK_BUSY)`；释放只删自己的 token。

3. **station 数据模型与门店/货架 CRUD**
   - 做什么：`shelves/slots` Prisma 模型 + RLS 迁移；`StationService.createShelf/listShelves`、controller。
   - 产物：迁移、`station.service.ts`、`station.controller.ts` + 单测。
   - 验收：建货架单测绿；RLS 隔离（跨租户看不到）；`station:manage/read` 权限生效。

4. **货架与库位 CRUD（编码 + 批量建位）**
   - 做什么：`SlotService.batchCreate`（区-排-层-位编码）/`listByShelf`/`listFree`；slot 状态机 FREE/OCCUPIED/DISABLED。
   - 产物：`slot.service.ts` + controller + 单测。
   - 验收：批量建位编码正确且门店内唯一；查空闲位单测绿；空态正确。

5. **库位分配规则服务**
   - 做什么：`SlotAllocatorService.allocate`（首个空闲 + Redis 锁 + 乐观锁重试）/`release`。
   - 产物：`slot-allocator.service.ts` + 并发单测。
   - 验收：并发分配不撞位（N 并发只占 N 个不同位）；无空位抛 `NO_FREE_SLOT`；`release` 幂等。

6. **parcel 聚合与状态机**
   - 做什么：`ParcelAggregate.canTransit/assertTransit` + 合法流转表；`parcels/parcel_events` 模型 + RLS + `version` 乐观锁字段。
   - 产物：迁移、`parcel.aggregate.ts` + 状态机单测。
   - 验收：合法流转通过、非法流转抛 `ILLEGAL_TRANSITION`，覆盖所有组合。

7. **parcel 服务与事件落库**
   - 做什么：`ParcelService.create/markStored/markPickedUp`（+预留 markException/markReturned），状态推进同事务写 `parcel_events` 并 `EventBus.publish`。
   - 产物：`parcel.service.ts` + 单测。
   - 验收：状态推进与事件流水同事务一致；发对应领域事件（可用假 EventBus 断言）。

8. **取件码生成与缓存**
   - 做什么：`PickupCodeService.generate/release`（Redis 占位 + DB 部分唯一索引兜底 + 重生成重试）。
   - 产物：`pickup-code.service.ts` + 迁移（部分唯一索引）+ 单测。
   - 验收：门店内在库码唯一；Redis 命中加速；冲突重试；release 后码可复用。

9. **inbound 入库编排**
   - 做什么：`InboundService.inbound`（PENDING→分配库位→取件码→markStored→ParcelStored）+ `POST /inbound`；幂等键防重复运单。
   - 产物：`inbound.service.ts`、`inbound.controller.ts` + 单测。
   - 验收：入库后包裹 STORED、占用库位、有取件码；重复运单幂等返回首次结果；`parcel:inbound` 权限生效。

10. **notify 适配层 + 站内/模拟短信 + 订阅 ParcelStored**
    - 做什么：`NotifyChannel` 接口 + `InAppChannel`/`MockSmsChannel`、`TemplateRenderer`、`notifications/notify_templates` 模型 + RLS + 平台默认模板 seed；BullMQ 队列 + worker；`ParcelStoredSubscriber` 入队。
    - 产物：`notify/` 全套 + `core/queue` + 单测/集成测。
    - 验收：`ParcelStored` 触发一条站内 + 一条模拟短信记录；`dedup_key` 唯一防重发；重复事件不重发。

11. **pickup 取件核销**
    - 做什么：`PickupService.pickup`（定位→Redis 锁→乐观锁 markPickedUp→release code）+ `POST /pickup`。
    - 产物：`pickup.service.ts`、`pickup.controller.ts` + 并发单测。
    - 验收：正确码/尾号核销成功；并发重复核销只成功一次（`ALREADY_PICKED_UP`）；尾号歧义/不存在/非在库各自报错；`parcel:pickup` 权限生效。

12. **station 订阅释放库位**
    - 做什么：`SlotReleaseSubscriber` 订阅 `ParcelPickedUp/ParcelReturned` → `SlotAllocator.release`（校验 current_parcel_id 幂等）。
    - 产物：`slot-release.subscriber.ts` + 单测。
    - 验收：核销后库位回 FREE；重复事件幂等；错配不释放他人库位。

13. **pickup_authorizations 表预留**
    - 做什么：仅建模型 + RLS 迁移（不实现业务、不暴露接口）。
    - 产物：迁移。
    - 验收：迁移成功、RLS 生效；不影响现有链路。

14. **P1-2 e2e 闭环冒烟**
    - 做什么：`test/station-loop.e2e-spec.ts`：开店(复用 P1-1)→建货架/批量库位→入库→产生通知→核销→库位释放。
    - 产物：e2e 文件。
    - 验收：全链路绿；终态 PICKED_UP、库位 FREE、`notifications` 有 IN_APP+SMS 记录；跨租户包裹/库位经 RLS 隔离。

> 顺序依赖：1→2 基础；3→4→5 站点链；6→7→8 包裹链；9 依赖 5/7/8；10 依赖 1/7；11 依赖 7/8；12 依赖 5/11；14 串全部。可并行：{3,4,5} 与 {6,7,8} 两条链在 1/2 完成后并行（subagent-driven 适用）。

---

## 9. 验收标准

- **单测覆盖**：状态机所有合法/非法流转；库位并发分配不撞位；取件码门店内在库唯一与复用；核销并发幂等（只成功一次）；通知 `dedup_key` 去重；库位释放幂等。
- **e2e 闭环**：`station-loop.e2e-spec.ts` 跑通「开店→建货架库位→入库→通知→取件→释放」，终态正确（PICKED_UP / 库位 FREE / 有 IN_APP+SMS 通知）。
- **多租户隔离**：`shelves/slots/parcels/parcel_events/notifications/notify_templates/pickup_authorizations` 全部带 `tenant_id` + RLS（`FORCE`），跨租户读写被隔离。
- **事件闭环**：`ParcelStored` 有 notify 订阅且发通知；`ParcelPickedUp` 有 station 订阅且释放库位；订阅方幂等。
- **权限**：本期 5 个权限码进 seed 并赋内置角色；接口 `@RequirePermission` 校验生效（无权返回业务码 1003）。
- **工程**：`npm run test` 与 `npm run test:e2e` 全绿；每 Task 约定式 commit；新表迁移含 RLS（隐性验收项）。

---

## 10. 依赖与风险

**依赖**：P1-1（RLS/鉴权/RBAC/统一响应/EventBus 雏形/PrismaService/TenantPrismaService/TenantContext）。Redis7 + BullMQ 需在 `docker-compose` 就绪（P1-1 已起 Redis，本期接 BullMQ）。

**风险与对策**：
| 风险 | 影响 | 对策 |
|---|---|---|
| BullMQ worker 丢失租户上下文 | 通知写错租户/RLS 拦截 | worker 内显式 `TenantContext.run(从 job 数据重建)` 后再走 `withTenant`；job payload 带 `tenantId` |
| Redis 不可用 | 取件码/分配锁失效 | 取件码以 DB 部分唯一索引为正确性兜底（Redis 仅加速）；分配锁失效由乐观锁兜底；锁获取失败抛 `LOCK_BUSY` 让前端重试 |
| 取件码碰撞概率随在库量上升 | 生成重试增多 | 唯一边界限「门店+在库」缩小空间；码长可配；重试上限 + 失败抛业务错误而非死循环 |
| 入库编排多服务非原子（库位占用成功但置 STORED 失败） | 库位泄漏/脏占用 | 建包裹/占库位/置 STORED 包在同一 `withTenant` 事务；取件码 Redis 占位失败可补偿释放；事务回滚则库位乐观锁未提交不生效 |
| 事件订阅者异常 | 通知漏发/库位不释放 | `EventBus` 订阅者异常隔离 + 记录；notify 走 BullMQ 重试；库位释放幂等可重放（P2 可加补偿扫描） |
| 手机尾号核销歧义（多包裹同尾号） | 核销错件 | 尾号命中多条返回 `AMBIGUOUS_PICKUP` 要求改用取件码/选择具体包裹，不盲取 |
| 进程内 EventBus 无投递保证 | 演进到多实例时事件丢失 | 边界与 payload 已按 MQ 设计（最小快照 + 幂等），P3 换 Redis Stream/Kafka 订阅方不变 |

---

> 完成本计划即交付驿站「代收」可运行可测试闭环（系统心脏一期），为 P1-3 前端接入与 P2 寄件/滞留/会员/大屏提供 `parcel` 状态机、库位、通知与核心领域事件基座。
