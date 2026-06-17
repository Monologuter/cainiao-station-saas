# P2-1 寄件与物流（Shipping & Logistics）详细设计

> 级别：**详细设计**（设计级别，不含完整实现代码；仅给签名、表结构、流程、算法描述）
> 基线：《设计方案（整合版）》§4.2 / §5 / §7、《实现计划总表》P2-1。
> 版本 v1.0（2026-06-18）

---

## 1. 目标 · 周期 · 依赖

### 1.1 目标
上线「代寄」能力：用户/店长发起寄件下单 → 智能选快递比价与智能定价报价 → 模拟支付 → 揽收 → 模拟物流轨迹推进与追踪，跑通 ShipOrder 状态机：

```
CREATED ─支付成功─▶ PAID ─店长揽收─▶ COLLECTED ─首次轨迹─▶ IN_TRANSIT ─末端签收─▶ DELIVERED
   │
   └─取消─▶ CANCELLED（仅 CREATED/PAID 早期可取消）
```

### 1.2 范围
- **shipping**：寄件下单、智能选快递比价、智能定价（`price_rules`）、揽收、ShipOrder 聚合状态机。
- **pay**：`PayChannel` 接口 + `MockPayChannel` 模拟支付，写 `payments`。
- **logistics**：`LogisticsProvider` 接口 + `MockLogisticsProvider` 模拟轨迹生成，写 `logistics_tracks`。
- **前端**：`station-web` 寄件管理（录单/报价/支付/揽收）、`user-app` 在线寄件 + 物流追踪。

### 1.3 周期
预计 4 个工作单元（roadmap 估时序号 4）。10 个有序任务（见 §9）。

### 1.4 依赖
| 依赖 | 来源 | 用途 |
|---|---|---|
| 多租户地基 + RLS | P1-1 | `tenant_id` 列 + RLS Policy + `tenant-prisma` 按租户注入 |
| JWT + RBAC | P1-1 | `@RequirePermission`、门店 scope、`@CurrentUser` |
| 统一响应/异常/错误码 | P1-1 | `ApiCode` / `BizError` / `{code,message,data}` |
| EventBus（进程内） | P1-1/P1-2 | 发 `ShipOrderCreated/Paid` |
| notify 适配层 | P1-2 | 报价/支付/签收节点通知（可选订阅，非强依赖） |
| Consumer（平台级） | P1-2 | `user-app` 寄件人身份按手机号映射 |

下游消费者：**member（P2-3）** 订阅 `ShipOrderPaid` 记积分；**analytics（P2-4）** 订阅做寄件增量统计；**P4-4** 用 `WechatPayChannel`/`KuaiDi100Provider` 替换降级实现（接口不变）。

---

## 2. 涉及上下文与模块

后端业务分包统一在 `backend/src/<context>/`，沿用 P1 文件职责约定（PascalCase Prisma 模型 + `@@map` snake_case 表名；模块间只走领域服务接口与 EventBus，不互相直连表）。

```
backend/src/
├── shipping/
│   ├── shipping.module.ts
│   ├── ship-order.aggregate.ts        # 聚合根：状态机 + 流转校验（纯领域，无 IO）
│   ├── ship-order.service.ts          # 下单/取消/揽收/查询编排，发事件
│   ├── pricing.service.ts             # 智能定价：首重续重 + 区域系数
│   ├── courier-selector.service.ts    # 智能选快递比价：候选报价排序
│   ├── ship-order.controller.ts       # REST 端点
│   └── dto/                           # CreateShipOrderDto / QuoteDto / ...
├── pay/
│   ├── pay.module.ts
│   ├── pay-channel.interface.ts       # PayChannel 抽象 + DI Token
│   ├── mock-pay.channel.ts            # MockPayChannel（降级实现）
│   └── pay.service.ts                 # 发起支付/回调/幂等，推进 PAID
├── logistics/
│   ├── logistics.module.ts
│   ├── logistics-provider.interface.ts# LogisticsProvider 抽象 + DI Token
│   ├── mock-logistics.provider.ts     # MockLogisticsProvider（降级实现）
│   └── logistics.service.ts           # 下单运力/轨迹推进/查询
└── (复用) core/event-bus · core/prisma/tenant-prisma · core/http/api-code
```

**边界约束**：`shipping` 不直接写 `payments`/`logistics_tracks`；通过 `PayService`/`LogisticsService` 接口与 `ShipOrderPaid` 等事件交互。`pay`/`logistics` 反向不感知寄件业务语义，只持有 `bizType=SHIP_ORDER` + `bizId`。

---

## 3. 数据模型

> 通用约定（沿用 §6）：`id uuid pk`、`tenant_id`、`created_at/updated_at/deleted_at(软删)`、`created_by`；`tenant_id` 建 RLS Policy 与联合索引。下表只列业务字段。

### 3.1 `ship_orders`（寄件订单，ShipOrder 聚合根）
| 字段 | 类型 | 约束/说明 |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | 租户隔离键，RLS |
| station_id | uuid | 受理门店；店内录单必填，线上单揽收时绑定 |
| order_no | varchar(32) | 业务单号，租户内唯一（`@@unique([tenant_id, order_no])`），人读 |
| channel | enum(`STATION`,`ONLINE`) | 来源：店内录单 / 用户线上 |
| status | enum(ShipOrderStatus) | `CREATED/PAID/COLLECTED/IN_TRANSIT/DELIVERED/CANCELLED` |
| sender_json | jsonb | 寄件人 {name, phone, province, city, district, address} |
| receiver_json | jsonb | 收件人 {同上} |
| item_json | jsonb | 物品 {type, weight_gram, declared_value?} |
| weight_gram | int | 计费重量（克），冗余出 jsonb 便于计价/索引 |
| courier_code | varchar(16) | 选定快递商代码（SF/YTO/ZTO/STO/YD/JD…） |
| courier_name | varchar(32) | 快递商名（快照） |
| quote_amount | int | 报价金额（分），下单时**价格快照** |
| quote_snapshot_json | jsonb | 完整报价明细快照（命中规则、首重续重拆分、区域系数）便于审计/复算 |
| consumer_id | uuid? | 线上寄件人（平台级 Consumer），店内单可空 |
| waybill_no | varchar(40)? | 运单号，揽收后由 LogisticsProvider 回填 |
| paid_at | timestamptz? | 支付成功时间 |
| collected_at | timestamptz? | 揽收时间 |
| delivered_at | timestamptz? | 签收时间 |
| cancelled_at | timestamptz? | 取消时间 |
| version | int | 乐观锁，默认 0 |

索引：`@@unique([tenant_id, order_no])`、`@@index([tenant_id, status])`、`@@index([tenant_id, station_id])`、`@@index([tenant_id, consumer_id])`、`@@index([waybill_no])`。

### 3.2 `price_rules`（智能定价规则）
租户可配置的报价规则，命中后驱动 `pricing.service`。
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | RLS |
| courier_code | varchar(16) | 适用快递商 |
| zone | varchar(16) | 区域键（`SAME_CITY`/`SAME_PROVINCE`/`CROSS_PROVINCE`/`REMOTE`） |
| first_weight_gram | int | 首重克数（默认 1000） |
| first_price | int | 首重价（分） |
| add_unit_gram | int | 续重计费单位（克，默认 1000，不足进位） |
| add_price | int | 每续重单位价（分） |
| zone_factor | numeric(4,2) | 区域系数（叠乘，默认 1.00） |
| est_hours | int | 预计时效（小时），供选快递排序 |
| enabled | boolean | 是否启用 |
| priority | int | 同 courier+zone 多规则时取 priority 最高且 enabled |

索引：`@@index([tenant_id, courier_code, zone, enabled])`。
种子：平台预置一套默认规则（SF/YTO/ZTO/STO 四档 × 四区域），租户可覆盖。

### 3.3 `payments`（支付记录，pay 上下文拥有）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | RLS |
| biz_type | enum(`SHIP_ORDER`) | 业务类型（预留扩展） |
| biz_id | uuid | 关联业务 ID（= ship_order.id） |
| channel | varchar(16) | `mock` / `wechat`（P4） |
| amount | int | 金额（分） |
| status | enum(`PENDING`,`SUCCESS`,`FAILED`,`REFUNDED`) | |
| idempotency_key | varchar(64) | 幂等键，`@@unique([tenant_id, idempotency_key])` |
| out_trade_no | varchar(64) | 渠道侧交易号（mock 为本地生成） |
| paid_at | timestamptz? | |
| raw_json | jsonb | 渠道原始响应（mock 为模拟体），审计用 |

索引：`@@unique([tenant_id, idempotency_key])`、`@@index([tenant_id, biz_type, biz_id])`。

### 3.4 `logistics_tracks`（物流轨迹，logistics 上下文拥有）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | RLS（**亦可按运单**追加 policy，见 §3.5） |
| ship_order_id | uuid | 关联 ship_order |
| waybill_no | varchar(40) | 运单号（冗余，便于按运单查询/未来回调） |
| seq | int | 节点序号，`@@unique([ship_order_id, seq])` |
| node_status | enum(`COLLECTED`,`IN_TRANSIT`,`ARRIVED`,`OUT_FOR_DELIVERY`,`DELIVERED`) | 轨迹节点类型 |
| location | varchar(64) | 节点地点描述 |
| description | varchar(255) | 节点文案（「【揽收】快件已被揽收」） |
| happened_at | timestamptz | 节点发生时间 |
| source | enum(`MOCK`,`PROVIDER`) | 来源，便于 P4 真实回调区分 |

索引：`@@unique([ship_order_id, seq])`、`@@index([tenant_id, ship_order_id])`、`@@index([waybill_no])`。

### 3.5 RLS 策略
对四张表统一启用 RLS（沿用 P1 模式）：应用连接非 owner/superuser，且 `FORCE ROW LEVEL SECURITY`；GUC `app.tenant_id` 过滤，平台 `app.bypass_rls='on'` 绕过。迁移 SQL（手写迁移）形如：

```sql
-- 对每张表：ship_orders / price_rules / payments / logistics_tracks
ALTER TABLE "ship_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ship_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ship_orders ON "ship_orders"
  USING (current_setting('app.bypass_rls', true) = 'on'
         OR "tenant_id" = current_setting('app.tenant_id', true)::uuid);
```

- **`logistics_tracks` 可按运单**：除租户隔离外，为支持「`user-app` 寄件人凭运单号/订单查询」的只读通道，叠加一条按运单的读策略（类比 §3「消费者只读通道」）——在专用只读事务里设 `app.bypass_rls='on'` 且业务层强制 `WHERE waybill_no = :wb AND ship_order_id = :id`，仅返回该运单轨迹，不泄露同租户其它单。即「业务层窄查询 + 绕租户 RLS」组合，不放开写隔离。
- **写入恒在租户上下文**：所有 `INSERT/UPDATE` 走 `tenant-prisma`（携 `app.tenant_id`），保证 `tenant_id` 自动正确。

---

## 4. 接口与 API

### 4.1 REST 端点
统一前缀 `/api`，统一响应 `{code,message,data}`，权限码形如 `shipping:*`。

| 方法 | 路径 | 端 | 权限 | 说明 |
|---|---|---|---|---|
| POST | `/shipping/quote` | station-web / user-app | `shipping:quote` | 比价报价（不落库）：入寄收地址+重量，返回候选快递排序 |
| POST | `/shipping/orders` | station-web / user-app | `shipping:create` | 下单，建 `CREATED` + 写报价快照，发 `ShipOrderCreated` |
| GET | `/shipping/orders` | station-web | `shipping:read` | 寄件管理列表（按门店 scope + 状态筛选 + 分页） |
| GET | `/shipping/orders/:id` | station-web / user-app | `shipping:read` | 订单详情 |
| POST | `/shipping/orders/:id/pay` | station-web / user-app | `shipping:pay` | 发起支付（携幂等键），成功推进 `PAID`，发 `ShipOrderPaid` |
| POST | `/shipping/orders/:id/collect` | station-web | `shipping:collect` | 店长揽收，`PAID→COLLECTED`，触发 LogisticsProvider 下单运力 |
| POST | `/shipping/orders/:id/cancel` | station-web / user-app | `shipping:cancel` | 取消（仅 `CREATED/PAID`） |
| GET | `/shipping/orders/:id/tracks` | station-web / user-app | `shipping:read` | 物流追踪：轨迹节点列表（升序 seq） |
| GET | `/shipping/my-orders` | user-app | 登录消费者 | 我的寄件（按 `consumer_id`，跨门店聚合，只读通道） |

> 支付回调（P4 真实渠道用）：`POST /pay/callback/:channel` 预留，mock 走同步成功，不依赖回调。

### 4.2 领域服务接口签名（TS，仅签名）

**PayChannel（pay 适配层）**
```ts
// DI Token: PAY_CHANNEL；实现 MockPayChannel；P4 换 WechatPayChannel，接口不变
interface PayRequest {
  bizType: 'SHIP_ORDER'; bizId: string;
  amount: number;            // 分
  idempotencyKey: string;    // 幂等键（业务侧生成）
  subject: string;           // 交易标题
}
interface PayResult {
  status: 'SUCCESS' | 'FAILED';
  outTradeNo: string;        // 渠道交易号
  paidAt?: Date;
  raw: unknown;              // 渠道原始响应
}
interface PayChannel {
  readonly code: string;                       // 'mock' | 'wechat'
  pay(req: PayRequest): Promise<PayResult>;    // 发起并（mock 即时）返回结果
  verifyCallback?(payload: unknown): PayResult;// P4 真实渠道回调验签（mock 可空）
}
```

**LogisticsProvider（logistics 适配层）**
```ts
// DI Token: LOGISTICS_PROVIDER；实现 MockLogisticsProvider；P4 换 KuaiDi100/KdNiao
interface CreateWaybillRequest {
  shipOrderId: string; courierCode: string;
  sender: AddressVO; receiver: AddressVO; weightGram: number;
}
interface CreateWaybillResult { waybillNo: string; }
interface TrackNode {
  nodeStatus: 'COLLECTED'|'IN_TRANSIT'|'ARRIVED'|'OUT_FOR_DELIVERY'|'DELIVERED';
  location: string; description: string; happenedAt: Date;
}
interface LogisticsProvider {
  readonly code: string;                                  // 'mock' | 'kuaidi100' ...
  createWaybill(req: CreateWaybillRequest): Promise<CreateWaybillResult>;
  // mock：生成预排程节点序列；真实：订阅/回调。返回「下一批应推进的节点」
  pollTracks(waybillNo: string): Promise<TrackNode[]>;
}
```

**ShippingService（领域编排）**
```ts
quote(input: QuoteInput): Promise<CourierQuote[]>;          // 比价排序，不落库
createOrder(input: CreateOrderInput): Promise<ShipOrder>;   // 建 CREATED + 报价快照 + 发事件
pay(orderId: string, idempotencyKey: string): Promise<ShipOrder>; // →PAID + 发 ShipOrderPaid
collect(orderId: string): Promise<ShipOrder>;               // PAID→COLLECTED + 创建运单 + 首节点
cancel(orderId: string, reason?: string): Promise<ShipOrder>;
getTracks(orderId: string): Promise<LogisticsTrack[]>;
```

辅助接口：`PricingService.quote(courierCode, zone, weightGram): PriceBreakdown`；`CourierSelectorService.rank(input): CourierQuote[]`。

---

## 5. 领域事件

进程内 `EventBus`（沿用 P1），订阅方幂等。

| 事件 | 触发点 | Payload（关键字段） | 订阅方（本期/未来） |
|---|---|---|---|
| `ShipOrderCreated` | `createOrder` 成功 | `{tenantId, shipOrderId, orderNo, courierCode, quoteAmount, channel, createdBy}` | analytics(P2-4) |
| `ShipOrderPaid` | 支付成功推进 PAID | `{tenantId, shipOrderId, orderNo, amount, paymentId, paidAt}` | member(P2-3 记积分)、analytics(P2-4) |

> 仅这两个事件在 §4.3 事件清单内属本期范围。`COLLECTED/IN_TRANSIT/DELIVERED` 状态推进本期以**状态字段 + 轨迹表**承载，不强制发领域事件（避免过度设计，YAGNI）；如 P2-4 需要可再补 `ShipOrderDelivered`。事件先走进程内 EventBus，演进期换 Redis Stream，订阅方不变。

---

## 6. 关键逻辑

### 6.1 智能选快递比价（CourierSelectorService）
输入：寄/收省市区 + 重量（+ 可选偏好 `priceFirst | speedFirst`）。
1. **解析区域 zone**：由寄收地址映射 `SAME_CITY / SAME_PROVINCE / CROSS_PROVINCE / REMOTE`（同城 < 同省 < 跨省 < 偏远；偏远地区表预置）。
2. **取候选快递**：查本租户 `enabled` 的 `price_rules`，按 `courier_code` 去重命中该 zone 的最高 `priority` 规则。
3. **逐家计价**：对每个候选调用 `PricingService.quote` 得 `amount`，并取规则 `est_hours` 作时效。
4. **可用性过滤**：无规则/未启用/偏远不达 → 剔除（mock 阶段全部视为可用）。
5. **排序**：默认综合分 = 价格归一化×0.6 + 时效归一化×0.4（越低越好）；`priceFirst` 则按 `amount` 升序，`speedFirst` 按 `est_hours` 升序。返回 `CourierQuote[]{courierCode, courierName, amount, estHours, recommended}`，首位 `recommended=true`。

### 6.2 智能定价算法（PricingService，首重续重 + 区域系数）
命中 `price_rules`（按 `courier_code + zone + enabled + priority`）后：

```
基础价 = first_price
        + ceil( max(weight_gram - first_weight_gram, 0) / add_unit_gram ) * add_price
报价   = round( 基础价 * zone_factor )      // 区域系数叠乘，四舍五入到分
```

- 续重不足一个 `add_unit_gram` 向上进位（`ceil`）。
- `zone_factor` 对偏远/跨省加成（如 REMOTE=1.50）。
- 输出 `PriceBreakdown{firstPrice, addWeightUnits, addPrice, subtotal, zoneFactor, total}` —— 整体写入 `quote_snapshot_json` 供审计与复算。
- 无命中规则 → `BizError(ApiCode.SHIPPING_NO_PRICE_RULE)`，前端提示该快递不可用。
- **金额单位统一为分（int）**，避免浮点误差。

### 6.3 状态机流转（ShipOrder.aggregate）
聚合根为纯领域对象，集中校验合法流转，非法流转抛 `BizError(SHIPPING_ILLEGAL_TRANSITION)`；持久化用 `version` 乐观锁，并发更新冲突重试或报错。

| from | 动作 | to | 守卫 / 副作用 |
|---|---|---|---|
| CREATED | pay 成功 | PAID | 写 `paid_at`、`payment` SUCCESS；发 `ShipOrderPaid` |
| PAID | collect | COLLECTED | 写 `collected_at`、`station_id`；调 `LogisticsProvider.createWaybill` 回填 `waybill_no`；写首轨迹节点(COLLECTED) |
| COLLECTED | 首次轨迹推进 | IN_TRANSIT | 写中间轨迹节点 |
| IN_TRANSIT | 末端签收节点 | DELIVERED | 写 `delivered_at` + DELIVERED 节点（终态） |
| CREATED / PAID | cancel | CANCELLED | 写 `cancelled_at`；PAID 取消预留退款（本期 mock 标 REFUNDED） |

DELIVERED/CANCELLED 为终态。轨迹推进（COLLECTED→IN_TRANSIT→DELIVERED）由 logistics 节点驱动状态同步（见 6.5）。

### 6.4 模拟支付可降级设计（PayService + MockPayChannel）
- `PayService.pay(orderId, idempotencyKey)`：
  1. **幂等**：先按 `(tenant_id, idempotency_key)` 查 `payments`；已存在 SUCCESS → 直接返回（幂等不重复支付），唯一约束兜底并发。
  2. 校验订单状态为 `CREATED`、金额 = `quote_amount`。
  3. 调注入的 `PayChannel.pay(...)`（DI Token 由 `PAY_CHANNEL_CODE=mock|wechat` 选择）。
  4. Mock：即时返回 `SUCCESS`（可配 `PAY_MOCK_FAIL_RATE` 注入失败用于测试失败分支）；写 `payments`。
  5. 成功 → 在同一租户事务内推进 ShipOrder `CREATED→PAID`、写 `paid_at`、发 `ShipOrderPaid`。
- **可降级**：`PayChannel` 接口 + DI Token，业务代码只依赖接口；P4 注册 `WechatPayChannel` 实现并切配置开关，`PayService`/`ShippingService` 不改。回调路径预留 `verifyCallback`，mock 不用。

### 6.5 模拟轨迹生成可降级设计（LogisticsService + MockLogisticsProvider）
- 揽收（collect）时：
  1. `LogisticsProvider.createWaybill` 生成 `waybill_no`（mock：`MOCK + 时间戳 + 随机`）。
  2. 立即写首节点 `COLLECTED`（seq=1），状态 `PAID→COLLECTED`。
- **轨迹推进策略（两种，配置二选一）**：
  - **A. 即时合成（默认，e2e/演示友好）**：`MockLogisticsProvider` 一次生成预排程节点序列（揽收→运输中→到达→派送→签收），按相对时间偏移；`GET /tracks` 时按当前时间「显影」已到时间的节点，并据最新已显影节点同步 ShipOrder 状态（`COLLECTED/IN_TRANSIT/DELIVERED`）。无需后台任务即可演示。
  - **B. 定时推进（贴近真实）**：BullMQ repeatable job（依赖 P2-2 队列基础设施则复用，否则本期用简单 setInterval/手动触发）周期 `pollTracks` 落库新节点并同步状态。本期默认 A，B 作为开关 `LOGISTICS_TRACK_MODE=instant|scheduled`。
- 节点写入幂等：`@@unique([ship_order_id, seq])` 防重复；状态同步只前进不回退。
- **可降级**：`LogisticsProvider` 接口 + DI Token，P4 换 `KuaiDi100Provider`（真实下单 + 轨迹回调写 `logistics_tracks`，失败回落 mock），业务不改。

---

## 7. 业务流程（端到端）

```
下单：选/填寄收信息+重量
  └─POST /shipping/quote ─▶ CourierSelector 比价（Pricing 逐家计价）─▶ 候选排序返回
  └─用户选定快递 ─▶ POST /shipping/orders
        └─ ShippingService.createOrder：解析 zone → Pricing 复算 → 写报价快照(quote_snapshot_json)
           → ship_order(CREATED) → 发 ShipOrderCreated
报价确认 → 模拟支付：POST /shipping/orders/:id/pay (idempotencyKey)
        └─ PayService → MockPayChannel.pay → SUCCESS → payments
           → CREATED→PAID → 写 paid_at → 发 ShipOrderPaid（member 记积分 / analytics 统计）
揽收（店长）：POST /shipping/orders/:id/collect
        └─ LogisticsProvider.createWaybill → 回填 waybill_no
           → PAID→COLLECTED → 写首轨迹节点(COLLECTED)
模拟轨迹：MockLogisticsProvider 预排程/推进
        └─ COLLECTED→IN_TRANSIT→DELIVERED，逐节点写 logistics_tracks，同步 ship_order.status
追踪：GET /shipping/orders/:id/tracks（或 user-app 我的寄件 → 运单追踪）
        └─ 返回升序轨迹节点；状态到 DELIVERED 为终态
```

异常分支：支付失败 → 停留 CREATED，可重试（新幂等键）或取消；无定价规则 → 报价/下单报错；揽收前取消 → CANCELLED（PAID 取消标记退款 mock）。

---

## 8. 前端（页面对接）

> 遵循 MEMORY：前端改动前先对齐原型/UI 规范（《UI 设计规范》、`design/mockups/hifi/` 清爽蓝、全屏平铺、三主题可切换）。本期为新增页，需先确认是否已有对应高保真稿，无则按规范补设计稿再开发。

### 8.1 station-web 寄件管理（Element Plus）
- **寄件录单页**：寄/收件人表单（含省市区联动）、物品与重量 → 「比价」按钮调 `/shipping/quote` 展示候选快递（价格/时效/推荐标）→ 选定下单 `/shipping/orders` → 「收款」调 `/pay`（模拟即时成功）→ 单据状态条 `CREATED→PAID`。
- **寄件管理列表**：`GET /shipping/orders`，按状态/门店/日期筛选 + 分页；行内操作：详情、揽收（PAID）、取消（CREATED/PAID）、查看轨迹。
- **揽收**：列表/详情「揽收」按钮调 `/collect`，成功后展示运单号与首轨迹节点。
- 权限：`v-perm="shipping:*"` 控制按钮；门店 scope 由后端 RLS + scope 双重过滤。

### 8.2 user-app 在线寄件 + 物流追踪（uni-app → 小程序 + H5）
- **在线寄件页**：寄/收信息 + 重量 → 比价（`/shipping/quote`）→ 选快递下单（`consumer_id` 取自登录态）→ 模拟支付（`/pay`）。
- **我的寄件页**：`GET /shipping/my-orders`（按 consumer_id 跨门店聚合，只读通道），列表展示状态。
- **物流追踪页**：`GET /shipping/orders/:id/tracks` 渲染时间轴轨迹（节点状态/地点/时间/文案），顶部显运单号与当前状态。

---

## 9. 任务分解（有序，对齐 roadmap 10 步）

| # | 任务 | 产物 | 验收 |
|---|---|---|---|
| 1 | ship_order 模型与状态机 | `ship_orders/price_rules` Prisma 模型 + RLS 迁移 + `ship-order.aggregate` 流转表（含 CANCELLED） | 状态机单测绿（合法/非法流转） |
| 2 | 定价服务 | `pricing.service`（首重续重 + 区域系数） | 多档计价单测绿、进位/边界/无规则报错正确 |
| 3 | 智能选快递比价 | `courier-selector.service`（按价格/时效/可用性排序） | 给定条件返回预期排序与推荐位单测绿 |
| 4 | 下单服务 | `ship-order.service.createOrder` + controller + 报价快照 + `ShipOrderCreated` | 下单单测绿、`quote_snapshot_json` 写入 |
| 5 | pay 适配与模拟支付 | `PayChannel` + `MockPayChannel` + `payments` + 推进 PAID + `ShipOrderPaid` | 支付→PAID 单测绿、幂等键防重复支付 |
| 6 | logistics 适配与模拟轨迹 | `LogisticsProvider` + `MockLogisticsProvider` + `logistics_tracks` + 状态同步 | 轨迹推进与状态同步单测绿、节点幂等 |
| 7 | 揽收与追踪接口 | `/collect`（PAID→COLLECTED）+ `/tracks` | 揽收后产生首轨迹节点、追踪返回升序 |
| 8 | 前端寄件录单（station-web） | 录单/比价/支付/管理列表/揽收页 | 店内可完成一单至 PAID 并揽收 |
| 9 | 前端在线寄件与追踪（user-app） | 下单页 + 我的寄件 + 追踪页 | 用户可下单、支付、看轨迹 |
| 10 | P2-1 e2e 冒烟 | `test/shipping.e2e-spec.ts`（下单→支付→揽收→轨迹→DELIVERED） | 全链路 e2e 绿 |

---

## 10. 验收标准

- ShipOrder 状态机全流转可走通：`CREATED→PAID→COLLECTED→IN_TRANSIT→DELIVERED`，非法流转被拦截，`CANCELLED` 仅早期可达。
- 定价（首重续重 + 区域系数）与选快递比价规则单测覆盖，边界（进位/无规则/偏远系数）正确。
- 模拟支付幂等：同 `idempotency_key` 不重复扣款，唯一约束兜底并发。
- 轨迹随状态推进，`logistics_tracks` 节点幂等（`unique(ship_order_id, seq)`），状态只前进。
- 报价**价格快照**写入 `quote_snapshot_json`，可复算审计。
- 四张新表均带 `tenant_id` + RLS，跨租户隔离生效；`logistics_tracks` 支持按运单只读追踪通道。
- 事件 `ShipOrderCreated/ShipOrderPaid` 正确发出，订阅方幂等。
- 前后端可完成一单完整代寄（station-web 店内 + user-app 线上各一条链路）。

---

## 11. 依赖与风险

| 项 | 说明 | 缓解 |
|---|---|---|
| **依赖 P1 地基** | RLS / 事务注入 / 鉴权 / EventBus / ApiCode 复用 | 直接复用 `tenant-prisma`、`@RequirePermission`，不重造 |
| **轨迹推进机制** | 即时合成(A) vs 定时(B)；B 需 BullMQ（P2-2 才落地队列） | 本期默认 A（无队列依赖、e2e 友好），开关预留 B；P2-2 后切 B |
| **区域/偏远解析** | 省市区→zone 映射准确度影响计价 | mock 阶段用预置区域表 + 默认系数；P4 接真实计费 API 校准 |
| **幂等与并发** | 重复支付、并发揽收、轨迹重复写 | 幂等键唯一约束 + `version` 乐观锁 + 节点 `unique(seq)` |
| **金额精度** | 浮点导致对账误差 | 全程「分(int)」存储与计算，仅展示层转元 |
| **退款未实现** | PAID 取消的真实退款 | 本期 mock 标 `REFUNDED`，P4 随微信支付补真实退款 |
| **前端原型对齐** | 新增页可能无现成高保真稿 | 按 MEMORY 先对齐 UI 规范/补稿再开发，避免返工 |
| **适配层切真（P4）** | pay/logistics 换真实实现 | 接口 + DI Token + 配置开关锁定，本期保证业务代码不依赖具体实现 |
