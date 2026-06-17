# P3-4 工程化加固 · 详细设计文档（Engineering Hardening）

> 版本 v1.0（2026-06-18）｜ 设计级别（不含完整实现代码）
> 配套《设计方案（整合版）v2.0》§2/§9/§12、《实现计划总表》P3-4
> 技术栈锁定：NestJS + TypeScript｜Redis 7（令牌桶限流 / 多级缓存 / 分布式锁）｜可观测（pino 结构化日志 + Prometheus 指标 + 健康检查）

---

## 1. 目标 · 周期 · 依赖

### 1.1 目标
把系统从「功能可用」提升到「可多实例水平扩展、可观测、可抗下游故障」的生产稳健度。交付五块横切能力，统一收口、对既有上下文**零业务改动接入**：

1. **接口限流与熔断**：登录/验证码/写接口（取件核销、入库、寄件支付）热点防刷与雪崩隔离。
2. **多级缓存**：本地 LRU + Redis 两级，统一键规范与 TTL，写时失效保证与 DB 一致。
3. **可观测性**：pino 结构化日志 + 请求链路 ID（traceId）贯穿、`/health` 健康检查、`/metrics` Prometheus 指标、错误监控。
4. **定时任务多实例防重**：分布式锁（ShedLock 等价物）包裹滞留扫描/出账/报表，多实例只执行一次。
5. **并发与幂等收口**：分布式锁规范、幂等键规范、乐观锁约定的统一化与文档化（既有零散实现归一）。
6. **安全加固**：密码哈希、JWT access+refresh 刷新与吊销、越权三道防线复核、敏感脱敏、审计覆盖。

### 1.2 周期定位
P3 商业化阶段收尾期（建议顺序第 11）。属上线前的稳健度门槛，是 P4 接真外部服务（P4-4 熔断/降级、P4-1 OCR）的前置基础设施。

### 1.3 依赖
| 依赖项 | 来源 | 说明 |
|---|---|---|
| 定时任务已存在 | P2-2（滞留扫描）、P3-1（出账）、P2-4（报表） | 本期为其加分布式锁防重，不新建任务 |
| 适配层接口 + 降级实现 | P2-1（notify/pay/logistics）、设计 §7 | 熔断器包裹外呼，打开时回落既有降级实现 |
| 取件码 Redis 缓存 | P1-2 `pickup-code.service` | 纳入多级缓存抽象统一管理 |
| RBAC 权限明细 | P1-1 identity（§5） | 权限/数据范围查询纳入缓存热点 |
| 系统配置/字典/渠道开关 | P3-3 `config.service` | 字典与开关纳入缓存热点，配置变更触发失效 |
| EventBus / AsyncLocalStorage 租户上下文 | P1-1 core | traceId 与 tenantId 同存于 ALS，贯穿日志与缓存键 |
| Redis 7 + BullMQ | 基础设施（§2.2） | 限流后端、缓存后端、锁后端、队列调度 |

### 1.4 非目标（YAGNI 边界）
- 不引入 Service Mesh / Sidecar；不引入 Kafka（EventBus 仍进程内，演进期再换）。
- 不做全链路分布式追踪后端（Jaeger/Tempo）落地，仅做 traceId 贯穿日志 + 预留 W3C `traceparent` 透传；后续可对接。
- 不做 API 网关层独立限流（§2.3 网关为预留）；限流在 Nest 应用层做。

---

## 2. 涉及范围（横切，作用于哪些模块）

本期产物落在 `backend/src/core/`（或 `libs/core`）的横切基础设施层，通过全局 Module / 全局拦截器 / 守卫 / 装饰器接入，作用面如下：

| 横切能力 | 落点目录（建议） | 作用于的既有上下文 |
|---|---|---|
| 限流 | `core/rate-limit/` | identity(登录/验证码)、pickup(核销)、inbound(入库)、shipping+pay(下单/支付)、全局兜底 |
| 熔断 | `core/circuit-breaker/` | notify / pay / logistics / ocr 适配器外呼 |
| 多级缓存 | `core/cache/` | pickup(取件码)、identity(权限/数据范围)、config(字典/渠道开关)、analytics(统计计数/排行榜) |
| 分布式锁 | `core/lock/` | pickup(核销)、station(库位分配)、parcel(状态流转)、所有定时任务 |
| 定时任务防重 | `core/scheduler-lock/`（基于 `core/lock`） | parcel(滞留扫描)、billing(出账)、analytics(报表) |
| 幂等 | `core/idempotency/` | 对外写入口、EventBus 订阅方 |
| 可观测 | `core/observability/`（logger / trace / health / metrics） | 全应用（拦截器 + 全局 Module） |
| 安全加固 | `identity/`（password/jwt）+ `core/security/`（脱敏/审计接入） | identity、audit、全局响应 |

> 接入原则：横切能力以**装饰器 + 拦截器 + 注入式服务**暴露，业务上下文只「贴标注」或「注入调用」，不改业务逻辑。新接入项是各上下文 plan 的隐性验收延伸。

---

## 3. 限流与熔断设计

### 3.1 限流

#### 3.1.1 维度
限流键 = 维度组合，按热点分级配置：

| 维度 | 取值来源 | 用途 |
|---|---|---|
| `ip` | 反代真实 IP（信任 `X-Forwarded-For`，nginx 收口） | 匿名接口防刷（登录、验证码、查件） |
| `account` | 登录手机号/用户名（登录失败计数） | 撞库防护、登录锁定 |
| `tenant` | ALS `tenantId` | 单租户配额，防单租户拖垮全局 |
| `user` | ALS `userId` | 登录后写接口（核销/入库/寄件）按人限速 |
| `route` | controller+handler 元数据 | 按接口独立桶 |

实际键：`rl:{scope}:{route}:{dimValue}`，多维叠加时取**最严命中**（任一桶耗尽即拒）。

#### 3.1.2 算法选型
- **主算法：令牌桶（Redis + Lua 原子脚本）**。`capacity`（桶容量=突发上限）+ `refillRate`（每秒补充）。Lua 内一次性完成「读令牌数 + 按时间差补充 + 扣减 + 写回 + 设 TTL」，避免竞态；返回剩余令牌与重试等待秒数。选令牌桶因其**允许合理突发**（核销高峰、批量入库）又限平均速率。
- **辅助：滑动窗口计数（Redis ZSET 或固定窗口+Lua）**，用于「N 分钟内最多 M 次」的硬性安全策略（如验证码发送频次、登录失败次数），语义更贴近安全阈值，不允许突发借支。
- 取舍：通用接口令牌桶；安全敏感的「次数硬上限」用滑动窗口。**不用纯固定窗口**（临界双倍问题）。

#### 3.1.3 分级策略（建议初值，配置化可调）
| 接口类 | 维度 | 算法 | 参考阈值 | 超限动作 |
|---|---|---|---|---|
| 登录 | ip + account | 滑动窗口 | 5 次/分；账号连续失败 5 次锁 15 分 | 拒绝 + 锁定计时 |
| 验证码发送 | ip + phone | 滑动窗口 | 1 次/60s、5 次/小时/手机号 | 拒绝 |
| 取件核销 | user + tenant | 令牌桶 | 桶 20、补 5/s | 拒绝（带 Retry-After） |
| 入库录入 | user | 令牌桶 | 桶 30、补 10/s | 拒绝 |
| 寄件支付 | user + 幂等键 | 令牌桶 | 桶 10、补 2/s | 拒绝 |
| 全局兜底 | ip | 令牌桶 | 桶 200、补 100/s | 拒绝 |

#### 3.1.4 实现接入
- 全局 `RateLimitGuard` + `@RateLimit({ scope, points, duration, dims })` 方法装饰器覆盖默认；无装饰器走全局兜底策略。
- 后端为 Redis（多实例共享计数）；本地内存仅作 Redis 不可用时的降级开关（fail-open 还是 fail-closed 按接口配：安全接口 fail-closed，业务接口 fail-open 并告警）。
- 与 `@nestjs/throttler` 关系：可用其作为装饰器/守卫骨架，但**存储后端替换为自研 Redis 令牌桶 Lua**（throttler 默认固定窗口不满足突发语义）；或不用 throttler，直接自研守卫。设计上以自研 Redis 令牌桶为准。

#### 3.1.5 降级响应
- 统一走 `{code,message,data}`：限流业务码（如 `RATE_LIMITED` / HTTP 429），`message` 含可读提示，响应头带 `Retry-After` 与 `X-RateLimit-Remaining`。
- 前端识别限流码做「稍后重试」提示，不弹通用错误。

### 3.2 熔断

#### 3.2.1 适用面
仅包裹**外呼适配器**（notify/pay/logistics/ocr），保护应用线程不被下游慢/挂拖垮。内部领域服务不熔断（用锁与幂等治理）。

#### 3.2.2 熔断器状态机
```
CLOSED ──失败率/超时超阈──▶ OPEN ──冷却窗口到──▶ HALF_OPEN
  ▲                                                  │
  └────────── 探活成功达标 ──────────────────────────┘
            （探活失败 → 回到 OPEN）
```
- **CLOSED**：正常放行，滑动统计窗口内记成功/失败/超时。
- **OPEN**：直接短路，不发起外呼，立即走降级；持续 `coolDownMs`。
- **HALF_OPEN**：放行少量试探请求，连续成功达 `successThreshold` 回 CLOSED，任一失败回 OPEN。

#### 3.2.3 触发参数（每适配器独立配置）
| 参数 | 含义 | 参考 |
|---|---|---|
| `timeoutMs` | 单次外呼超时（计为失败） | notify 3s / pay 8s / logistics 5s / ocr 10s |
| `errorThresholdPct` | 滑动窗口失败率阈值 | 50% |
| `volumeThreshold` | 触发判定的最小样本量 | 20 |
| `rollingWindowMs` | 统计窗口 | 10s |
| `coolDownMs` | OPEN 持续 | 30s |
| `successThreshold` | HALF_OPEN 恢复所需连续成功 | 5 |

#### 3.2.4 降级策略（打开时回落，复用 §7 既有降级实现）
| 适配器 | 熔断打开时降级 |
|---|---|
| notify | 短信→站内消息 + 入 BullMQ 延迟重试队列；记 `notify_degraded` 指标 |
| pay | 拒绝并返回「支付通道暂不可用」业务码，订单留 CREATED 可重试（不丢单、不重复扣款） |
| logistics | 返回缓存中最近一次轨迹 + 标记「轨迹延迟」，后台补偿拉取 |
| ocr | 回落人工录入（与 P4-1 一致）|

#### 3.2.5 实现接入
- `CircuitBreaker` 服务（每命名通道一个实例，状态可存进程内即可——按实例隔离更安全；跨实例不共享熔断状态，避免误同步）。
- 适配器外呼统一经 `breaker.execute(channelKey, () => realCall(), () => fallback())`，超时用 `Promise.race` + AbortController。
- 熔断状态变化发结构化日志 + 指标（`circuit_state{channel}`），并发错误监控告警。

---

## 4. 缓存策略（多级 + 写时失效）

### 4.1 分层
两级缓存（L1 进程内 + L2 Redis），读路径 L1→L2→DB，回填逐级写回：

```
读：L1(LRU 命中?) ─miss─▶ L2(Redis 命中?) ─miss─▶ DB ─▶ 回填 L2(+TTL) ─▶ 回填 L1(+短 TTL)
写：DB 提交成功 ─▶ 删 L2 ─▶ 发失效广播 ─▶ 各实例删 L1
```
- **L1 本地 LRU**：极热点（取件码校验、权限点、字典），容量上限 + 短 TTL（如 5~30s），抗瞬时高并发、省 Redis 往返。
- **L2 Redis**：跨实例共享，主缓存层，TTL 较长（分钟级），命中即权威。
- L1 的代价是**跨实例短暂不一致窗口**（≤L1 TTL），仅用于可容忍短不一致的只读热点；强一致需求（如取件码核销）以 DB 行锁 + 乐观锁为准，缓存仅加速查询不作为核销唯一依据。

### 4.2 键设计规范
统一前缀与版本，便于批量失效与灰度：
```
{app}:{ver}:{tenantId}:{domain}:{entity}:{id}
例：cn:v1:t_123:auth:perms:u_456
    cn:v1:t_123:dict:channel_switch:notify_sms
    cn:v1:_global:pickupcode:9F3K2     # 取件码平台级查码
```
- **租户隔离**：键内嵌 `tenantId`，杜绝跨租户串读；平台级数据用 `_global`。
- **版本位 `ver`**：缓存结构变更或需全量失效时递增，老键自然过期。
- **类型清单**：`auth:perms` / `auth:menus` / `auth:datascope` / `dict:*` / `pickupcode` / `stat:counter` / `stat:rank`。

### 4.3 失效策略（写时失效，保证与 DB 一致）
- **Cache-Aside + 写时失效（删除而非更新）**：写操作在 **DB 事务提交成功后** 删除 L2 键并广播失效 L1。删除优于改写，避免并发写覆盖出脏值。
- **失效广播**：Redis Pub/Sub（或 BullMQ 广播）通知所有实例删除对应 L1 键，缩短 L1 不一致窗口。
- **事务一致性**：失效动作挂在事务提交后（`afterCommit` 钩子 / outbox），事务回滚则不失效；若失效广播失败，L1/L2 仍有 TTL 兜底最终一致。
- **延迟双删（可选，针对读多写并发）**：写后立即删一次，延迟 `TTL_L1` 后再删一次，消除「失效与回填竞态」回灌旧值。

### 4.4 缓存问题防护
| 问题 | 防护 |
|---|---|
| 穿透（查不存在） | 空值缓存（短 TTL，如 30s）+ 关键查询布隆过滤器（取件码）|
| 击穿（热点 key 失效瞬间高并发） | 重建加分布式锁（`core/lock` 单飞，仅一个请求回源，其余等待/读旧值）|
| 雪崩（大量 key 同时过期） | TTL 加随机抖动（±10%）；分级 TTL |

### 4.5 热点对象处理
| 热点 | 级别 | TTL | 失效触发 |
|---|---|---|---|
| 取件码（查码/校验） | L1+L2 | L2 = 取件码业务 TTL（如 3 天）；L1 5s | 核销成功 / 退回 / 改派立即失效 |
| 权限点（`module:action` 集合） | L1+L2 | L2 10min；L1 10s | 角色权限变更、用户角色变更、用户禁用 |
| 数据范围（`staff_stations`） | L1+L2 | L2 10min | 门店分配变更 |
| 数据字典 / 渠道开关 | L1+L2 | L2 5min；L1 30s | `config.service` 写入即广播失效（热生效，对齐 P3-3）|
| 统计计数 / 排行榜 | L2 | 秒~分钟级 | 事件驱动增量更新（analytics 既有），缓存仅读侧 |

> 取件码强一致：缓存命中只用于「快速定位包裹候选」，最终核销必须在 `core/lock` 锁内 + DB 乐观锁校验状态，缓存不充当核销权威。

---

## 5. 可观测性

### 5.1 结构化日志（pino）
- **统一 logger**：基于 pino 封装 Nest `LoggerService`，全应用 JSON 结构化输出（生产 JSON、本地 `pino-pretty`）。
- **固定字段**：`time / level / msg / traceId / tenantId / userId / context(模块) / req(method,url,statusCode,latencyMs)`；从 ALS 取 `traceId/tenantId/userId`，业务无需手传。
- **分级**：`error`（异常+告警）/`warn`（限流命中、熔断打开、缓存降级）/`info`（关键业务动作、请求出入）/`debug`（开发）。生产默认 info。
- **采样**：高频健康检查/metrics 抓取日志降级或丢弃，避免噪声。

### 5.2 请求链路 ID（traceId）
- 入站拦截/中间件：读取 `X-Request-Id`（或 W3C `traceparent`）复用，缺失则生成（UUID/ULID）。
- 存入 `AsyncLocalStorage`（与 tenantId 同一 store），贯穿同步调用、EventBus 投递、BullMQ 任务（入队时把 traceId 写进 job data，worker 取出还原 ALS）。
- 响应头回写 `X-Request-Id`，便于前端/排障关联。
- 预留下游透传 `traceparent`，为后续接 OpenTelemetry 留口（本期不落后端）。

### 5.3 健康检查（`/health`）
基于 `@nestjs/terminus`，分两端点：
- `GET /health/live`（存活）：进程在即 200，供容器存活探针。
- `GET /health/ready`（就绪）：检查依赖——PostgreSQL（`SELECT 1`）、Redis（`PING`）、MinIO（可选）、BullMQ 队列连通、AI-service（可选、降级不阻断就绪）。任一关键依赖不通返回 503，供 LB/就绪探针摘流。
- 返回结构含各依赖状态明细，纳入运维看板。

### 5.4 Prometheus 指标（`/metrics`）
基于 `prom-client`，暴露 `/metrics`（仅内网/带 token）：
| 指标 | 类型 | 标签 |
|---|---|---|
| `http_request_duration_seconds` | Histogram | method,route,status,tenant |
| `http_requests_total` | Counter | method,route,status |
| `rate_limit_rejected_total` | Counter | route,scope |
| `circuit_breaker_state` | Gauge | channel（0/1/2）|
| `circuit_breaker_calls_total` | Counter | channel,result（success/fail/timeout/short）|
| `cache_ops_total` | Counter | layer(l1/l2),domain,result(hit/miss) |
| `scheduler_job_runs_total` | Counter | job,result(executed/skipped-lock) |
| `domain_event_processed_total` | Counter | event,result |
| `bullmq_jobs` | Gauge/Counter | queue,state |
| Node 进程默认指标 | — | （内存/GC/句柄，`collectDefaultMetrics`）|

### 5.5 错误监控与告警
- 全局异常过滤器统一捕获 → 结构化 error 日志（含 traceId）+ `errors_total{type}` 指标。
- 预留 Sentry/对接口（DSN 配置化，本期可仅日志+指标）。
- 告警规则（Prometheus Alert / 看板阈值）：限流拒绝率突增、熔断 OPEN、就绪探针失败、5xx 率、缓存命中率骤降、定时任务连续 skip（疑似锁泄漏）。

---

## 6. 并发与幂等收口

### 6.1 分布式锁规范（`core/lock`，Redis）
- **实现**：Redis `SET key val NX PX ttl` 获取，value = 唯一持有者 token（实例ID+随机）；释放用 Lua「比对 token 再 del」防误删他人锁。
- **键规范**：`lock:{domain}:{resource}`，例 `lock:pickup:parcel:{parcelId}`、`lock:slot:assign:{stationId}`。
- **TTL + 看门狗**：TTL 取「最坏执行时长 × 安全系数」；长任务用看门狗自动续期（持有期内定时延长），任务结束停续期并释放。
- **失败语义**：抢锁失败按场景——核销并发返回「正在处理」业务码（不重试覆盖）；缓存重建单飞等待短超时后读旧值。
- **不可重入**：同一逻辑不嵌套抢同键；锁粒度尽量细（按 parcelId/slotId 而非全局）。
- **降级**：Redis 不可用时，强一致写路径 fail-closed（拒绝）而非裸放行。

### 6.2 幂等键规范（`core/idempotency`）
- **对外写入口**（支付、寄件下单、对外回调）：客户端/上游传 `Idempotency-Key`（或服务端按业务唯一键派生，如 `pay:{orderId}`）。
- **机制**：Redis 记 `idem:{scope}:{key}` → 首次处理中（占位）/ 已完成（存结果）；重复请求命中则直接返回首次结果，不重复执行副作用。`idem` 记录 TTL 覆盖重试窗口。
- **EventBus 订阅方幂等**：每订阅方对 `(eventId, handlerName)` 去重（DB 唯一约束或 Redis SETNX），重复投递只生效一次（对齐 §9、各 plan 隐性验收）。
- **DB 唯一约束兜底**：关键业务（支付流水、积分记录）加唯一索引，幂等 + 约束双保险。

### 6.3 乐观锁约定
- 聚合根（`parcels`、`slots`、`subscriptions`）带 `version` 字段；写 `WHERE id=? AND version=?` + `version+1`，影响 0 行即并发冲突，按业务重读重试或返回冲突码。
- 与分布式锁配合：锁缩小并发窗口、乐观锁兜底正确性；核销/库位分配走「锁 + 乐观锁 + 状态机校验」三层。

### 6.4 定时任务多实例防重（ShedLock 等价物）
- **目标**：滞留扫描（P2-2）、出账（P3-1）、报表（P2-4）等 cron 任务，多实例部署时**同一触发只执行一次**。
- **方案 A（首选，DB 锁，ShedLock 原生思路）**：建 `scheduled_locks(name, locked_at, locked_until, locked_by)` 表（或 Postgres `pg_try_advisory_lock`）。任务启动前 `INSERT ... ON CONFLICT` 抢「`name` 当前未被锁且 `now > locked_until`」，抢到才执行，结束写 `locked_until`。优点：与业务库同一事务域、可审计、崩溃后按 `locked_until` 自动释放。
- **方案 B（Redis 锁）**：复用 §6.1 `core/lock`，键 `lock:cron:{jobName}`，TTL = 任务周期上限，看门狗续期。优点：实现轻。缺点：依赖 Redis 可用性。
- **选型**：定时任务用 **方案 A（DB scheduled_locks，ShedLock 思路）** 为主——锁状态持久、可观测、无看门狗复杂度；与 BullMQ repeatable job 配合时，repeatable 保证「单调度入队」，scheduled-lock 保证「执行幂等」双保险。
- **接入**：`@DistributedCron({ name, lockAtMost, lockAtLeast })` 装饰器包裹任务方法；`lockAtLeast` 防止任务过快释放导致同周期重抢，`lockAtMost` 防死锁。
- **任务自身幂等**：即便锁失效双跑，任务内部副作用（发账单、催取通知）仍按 §6.2 幂等，做到「锁防重 + 业务幂等」纵深防御。

---

## 7. 安全加固

| 项 | 设计 |
|---|---|
| 密码 | argon2id（优先）或 bcrypt(cost≥12) 哈希加盐；禁明文/可逆；登录失败计数 + 账号锁定（§3.1.3）|
| JWT access+refresh | access 短期（如 15min，仅含 `userId/type/tenantId/roleCodes`，§5）；refresh 长期（如 7d）单独存储；刷新接口换发 access |
| Refresh 吊销/轮换 | refresh token 存 Redis（`rt:{userId}:{jti}`）支持吊销；**刷新即轮换**（旧 jti 失效），检测复用（同 jti 二次使用）则吊销该用户全部会话 |
| 登出/改密 | 登出删 refresh；改密/禁用用户吊销其全部 refresh + 失效权限缓存（§4.5）|
| 越权（三道防线） | RLS 租户隔离（§3）+ 功能权限 `@RequirePermission`（`module:action`）+ 门店数据范围 `staff_stations` scope；本期复核所有写接口三防线齐全，权限/范围查询走缓存（§4.5）但写后立即失效 |
| 输入校验 | 全局 `ValidationPipe`（whitelist + forbidNonWhitelisted），DTO 强类型；防注入（Prisma 参数化）|
| 敏感脱敏 | 日志/响应统一脱敏：手机号（138****5678）、取件码、身份证、token；pino 序列化器 redact 路径 + 响应拦截器脱敏白名单 |
| 限流防刷 | §3.1：登录/验证码/写接口限流，撞库与短信轰炸防护 |
| 审计 | audit AOP（§5）覆盖关键写操作（核销、权限变更、租户状态、退款/出账）；审计日志带 traceId、操作前后值；审计写入不阻断主流程（异步/失败降级日志）|
| 传输/配置 | nginx 终止 TLS；密钥/JWT secret/DSN 经环境变量与 secret 管理，不入库不入日志 |

---

## 8. 任务分解（有序 Task + 产物 + 验收）

> 执行时每 Task 展开为逐步 TDD（红→绿→重构），频繁提交，约定式 commit。推荐 `subagent-driven-development`。

| # | Task | 关键产物 | 验收 |
|---|---|---|---|
| 1 | **可观测性地基**（先做，后续 Task 复用日志/指标） | `core/observability`：pino logger、traceId 中间件 + ALS 注入、全局异常过滤器接错误指标、`/health(live/ready)`、`/metrics`、HTTP 指标拦截器 | 日志含 traceId/tenantId；`/health/ready` 反映 PG/Redis 状态；`/metrics` 可被 prom 抓取；单测 + 拦截器集成测绿 |
| 2 | **分布式锁工具** | `core/lock`：Redis NX 锁 + token 释放 Lua + 看门狗续期；键规范 | 并发抢锁单测：仅一个持有；TTL 到自动释放；误删防护单测绿 |
| 3 | **定时任务多实例防重** | `scheduled_locks` 表迁移（+RLS 豁免说明）、`@DistributedCron` 装饰器（ShedLock 思路）、接入滞留扫描/出账/报表 | 模拟双实例并发同一 cron：只执行一次的集成测绿；`scheduler_job_runs_total{result=skipped-lock}` 计数正确 |
| 4 | **接口限流** | `core/rate-limit`：Redis 令牌桶 Lua + 滑动窗口、`RateLimitGuard` + `@RateLimit`、分级配置、429 业务码响应 | 超阈值返回限流码 + Retry-After 的集成测绿；登录/验证码滑窗、核销令牌桶各覆盖 |
| 5 | **适配层熔断** | `core/circuit-breaker`：状态机 + 超时 + 滑窗统计 + 降级回调；接入 notify/pay/logistics/ocr 适配器 | 模拟下游失败/超时触发 OPEN + 走降级、冷却后 HALF_OPEN 恢复的单测绿；状态指标/日志正确 |
| 6 | **多级缓存** | `core/cache`：L1 LRU + L2 Redis、键规范、TTL 抖动、空值缓存、单飞重建、Pub/Sub 失效广播、`afterCommit` 写时失效；接入取件码/权限/数据范围/字典/统计 | 命中/失效/穿透防护/写后失效一致性单测绿；缓存指标 hit/miss 正确 |
| 7 | **并发与幂等收口** | `core/idempotency`（幂等键 + 订阅方去重）、乐观锁 `version` 约定文档化、核销/库位/支付接「锁+乐观锁+幂等」 | 重复幂等键只执行一次、并发核销只成功一次、重复事件只生效一次的单测绿 |
| 8 | **安全加固** | argon2 密码、JWT refresh 轮换/吊销/复用检测、三道防线复核、脱敏序列化器、审计接入复核 | 刷新轮换/复用吊销、脱敏、越权拦截单测绿；改密吊销会话 + 失效权限缓存集成测绿 |
| 9 | **P3-4 验证冒烟** | `test/hardening.e2e-spec.ts`：限流触发、熔断降级、双实例定时只跑一次、`/health` 与 `/metrics` 返回、缓存写时失效 | 加固项 e2e/集成全绿；冒烟覆盖五块能力关键路径 |

---

## 9. 验收标准（含压测 / 故障注入要点）

### 9.1 功能验收
- 热点接口限流生效（登录/验证码/核销/支付），超限返回限流业务码 + Retry-After。
- 下游故障：模拟 notify/pay/logistics/ocr 失败/超时，熔断 OPEN → 走降级 → 冷却恢复，核心闭环不中断、不丢单不重复扣款。
- 缓存两级且写时失效：写后读立即一致（≤L1 TTL 窗口外严格一致）；穿透/击穿/雪崩防护生效。
- 定时任务多实例：双实例并发同一 cron 只执行一次。
- 可观测：日志带 traceId/tenantId、`/metrics` 可抓取、`/health/ready` 反映依赖状态、错误进指标与告警。
- 安全：密码哈希、refresh 轮换吊销、三道防线、脱敏、审计齐全。

### 9.2 压测要点（k6 / autocannon）
- **限流准确性**：固定速率打超阈流量，验证拒绝率与阈值吻合、令牌桶突发后回稳；多实例下 Redis 共享计数全局一致（非各实例独立）。
- **缓存效果**：热点读压测对比开/关缓存的 P95 延迟与 DB QPS 下降；缓存命中率 ≥ 目标（如权限/字典 ≥ 95%）。
- **锁开销**：核销/库位分配高并发下，锁正确性（无超卖/重复核销）与吞吐回归，P95 在阈内。
- **稳态**：持续负载下无内存泄漏（GC/句柄指标平稳）、无锁泄漏（`skipped-lock` 不异常增长）。

### 9.3 故障注入要点（混沌）
- 杀 Redis：限流按配置 fail-open/closed、缓存回源 DB 不雪崩、分布式锁强一致路径 fail-closed、就绪探针转 503 摘流。
- 杀/拖慢下游适配器：熔断按阈打开、降级生效、恢复正常。
- 杀 DB 连接：就绪探针 503、错误监控告警、恢复后自愈。
- 注入网络延迟/超时：熔断超时计数与 OPEN 触发正确。
- 多实例滚动重启：定时任务无重复执行、refresh 会话不串、traceId 不串。

---

## 10. 依赖与风险

### 10.1 依赖
- 既有定时任务（P2-2/P3-1/P2-4）、适配层降级实现（P2-1/§7）、取件码缓存（P1-2）、RBAC（P1-1）、config/字典（P3-3）、EventBus + ALS 租户上下文（P1-1）、Redis 7 + BullMQ（§2.2）。
- 运维侧：Prometheus 抓取配置、容器存活/就绪探针接 `/health`、nginx 真实 IP 透传（限流 IP 维度依赖）。

### 10.2 风险与缓解
| 风险 | 影响 | 缓解 |
|---|---|---|
| L1 本地缓存跨实例不一致窗口 | 短暂读到旧权限/字典 | 仅用于可容忍短不一致只读热点；强一致走 DB+锁；Pub/Sub 广播 + 短 L1 TTL 收窄窗口 |
| 限流误伤（NAT 大量用户共享 IP） | 正常用户被限 | IP 维度阈值放宽 + 叠加 account/user 维度精准识别；可加白名单 |
| 熔断状态不跨实例共享 | 各实例独立判断、收敛稍慢 | 接受（按实例隔离更安全），靠指标聚合观测整体；不强行跨实例同步避免误联动 |
| 分布式锁因 GC/STW 误判持有（看门狗失效边界） | 极端下双跑 | 任务内部业务幂等兜底（锁 + 幂等纵深）；`lockAtMost` 限上界 |
| Redis 单点 | 限流/缓存/锁全依赖 | Redis 高可用（哨兵/集群）规划；各路径明确 fail-open/closed 降级策略 |
| 缓存击穿/雪崩配置不当 | DB 抖动 | 单飞重建 + TTL 抖动 + 空值缓存，压测验证 |
| 脱敏遗漏 | 敏感信息泄漏日志 | 统一 pino redact + 响应脱敏白名单，code-review + 测试覆盖关键字段 |
| `/metrics` `/health` 暴露 | 信息泄漏 | 内网/带 token，nginx 限制来源 |
| 安全加固改 JWT 结构 | 既有会话失效 | 灰度兼容旧 token 一个过期周期；改密吊销有明确告知前端 |

---

> 落地提醒：本期所有产物落在 `core` 横切层，以装饰器/拦截器/注入服务暴露，业务上下文零逻辑改动接入；新表（`scheduled_locks`）按约定处理 RLS（平台级锁表豁免租户 RLS，单独说明）；收尾必有 `hardening.e2e-spec.ts` 冒烟，测试全绿，频繁提交。
