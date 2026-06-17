# P4-2 大模型智能客服（AI Assistant）· 详细设计

> 周期 P4 智能化 ｜ 配套《设计方案（整合版）v2.0》§5 ocr/ai、§2 AI 独立服务 ｜ 配套《实现计划总表》P4-2
> 本文为**设计级别**文档：定义目标、模块、数据模型、接口契约、关键逻辑、流程、任务分解与验收，**不写完整实现代码**（仅给接口签名/契约/伪逻辑骨架）。

---

## 1. 目标 · 周期 · 依赖

### 1.1 目标
收件人在 `user-app` 用自然语言提问——「我的包裹到了吗 / 怎么寄件 / 取件码在哪 / 取件时间」——由 `ai-service` 接大模型 + 知识库（FAQ + 用户上下文如本人包裹/物流状态）生成回答；助手可**受控工具调用**查本人包裹与物流。提供 `AiAssistant` 接口抽象：降级实现 = FAQ 知识库关键词/向量匹配直答，真实实现 = 大模型（Claude 最新模型）RAG + 工具编排。前端在 `user-app`（及 `station-web`）提供客服会话入口。

核心价值：把「查件靠翻列表、寄件靠问店员、流程靠猜」升级为「一句话问答 + 含本人真实数据的精准回复」，同时严守租户/权限隔离，杜绝越权取数与幻觉乱答。

### 1.2 周期与定位
- 期：**P4 智能化**，建议顺序第 13（见总表 B 表）。
- 与 P4-3（智能库位/预测）在 P4-1 之后**可并行**。

### 1.3 依赖
| 依赖项 | 说明 |
|---|---|
| **P4-1（OCR 入库）** | `ai-service`（Python 3.12 + FastAPI）工程已就绪：FastAPI 骨架、`Provider 抽象 + mock/real + env 开关切换`、与 NestJS 后端的调用约定、容器编排（docker-compose 已含 `ai-service`）。P4-2 在同一服务内新增 `/assistant/*` 路由与知识库子系统。 |
| **P1-3（前端）** | `user-app`（uni-app）已可登录、查件、走「消费者只读通道」；客服入口挂在已有用户端框架内。 |
| **P1-2** | `parcel` 聚合 + 状态机、取件码、库位；提供「查本人包裹」的权威数据源。 |
| **P2-1（可选增强）** | 若已上线，物流轨迹（`logistics_tracks`）可作为「查物流」工具的数据源；未上线时该工具降级为「暂无物流信息」。 |
| **P3-4（建议）** | 适配层熔断/降级、限流、可观测性收口；`ai-service` 外呼大模型挂熔断器，LLM 故障时自动降级到 FAQ。 |

> 隐性验收（贯穿）：新表带 `tenant_id` + RLS（会话/消息表）；外呼大模型幂等+熔断；客服链路收尾有 e2e 冒烟；测试全绿。

---

## 2. 涉及上下文与模块

总体链路：`user-app（前端会话 UI）` → `NestJS ai 上下文（assistant 编排 + 受控查询工具 + 会话存储）` → `ai-service（FastAPI：RAG + 大模型 + 知识库 + 可降级）`。**前端永不直连 `ai-service`**；`ai-service` 不直连业务库，只通过 NestJS 暴露的受控工具回取数据（防越权的单一收口点）。

```
┌──────────────┐   HTTPS(JWT)   ┌───────────────────────────────┐   内网 HTTP(服务令牌)   ┌──────────────────────────┐
│  user-app    │ ─────────────▶ │  NestJS · ai 上下文            │ ─────────────────────▶ │  ai-service (FastAPI)     │
│  客服会话 UI │                │  AiAssistantController        │                        │  /assistant/chat (RAG)    │
│  (流式渲染)  │ ◀───────────── │  assistant.service(编排)      │ ◀───────────────────── │  LlmProvider(mock/real)   │
└──────────────┘   SSE 流式回包 │  conversation.service(存储)   │   工具调用回调(同步)    │  KnowledgeBase(检索)      │
                                │  tool-registry(受控只读工具)  │ ◀─── tool_call ───┐    │  Llm 工具编排循环         │
                                │  ├ query_my_parcels           │ ──── tool_result ─┘    └──────────────────────────┘
                                │  └ query_logistics            │  (工具执行始终在 NestJS 侧，带租户/权限/脱敏)
                                └───────────────────────────────┘
```

### 2.1 ai-service（Python 3.12 + FastAPI）—— 已拆出的独立服务
职责：RAG 编排（知识库检索 + 上下文注入 + 大模型生成 + 工具调用循环）、知识库构建与检索、`LlmProvider` 抽象（mock/real）、降级到 FAQ 直答。**不持有业务数据库连接**，需要业务数据时通过「工具调用回调」请求 NestJS 执行（见 §4.3）。新增模块：
- `app/routers/assistant.py`：`POST /assistant/chat`、`POST /assistant/kb/reindex`、`GET /assistant/healthz`。
- `app/llm/provider.py`：`LlmProvider` 抽象 + `MockLlmProvider` + `ClaudeLlmProvider`（真实，调 Claude `claude-opus-4-8`）。
- `app/kb/`：知识库导入、切分、向量化/索引、检索（`mock`=关键词 BM25-lite，`real`=向量库）。
- `app/rag/orchestrator.py`：RAG 主编排（检索→拼 prompt→生成→工具循环→收口）。
- `app/tools/spec.py`：工具 schema 定义（与 NestJS 工具契约对齐）。

### 2.2 NestJS · `ai` 上下文
职责：**面向前端的唯一入口 + 防越权收口 + 会话持久化**。`ai-service` 是「大脑」，NestJS 是「带门禁的手」。
- `assistant.controller.ts`：`POST /api/assistant/chat`（鉴权，流式 SSE）、`GET /api/assistant/conversations`、`GET /api/assistant/conversations/:id/messages`。
- `assistant.service.ts`：编排——组装 `ConsumerContext`、调 `assistant.client` 转发到 `ai-service`、把 `ai-service` 回吐的 `tool_call` 派给 `tool-registry` 执行、流式回传前端、落库会话/消息。
- `assistant.client.ts`：调 `ai-service`（内网，带服务间令牌；SSE/分块流转）。
- `conversation.service.ts`：会话与消息读写（表 `ai_conversations / ai_messages`，带 RLS）。
- `tools/tool-registry.ts` + 各只读工具（`query-my-parcels.tool.ts`、`query-logistics.tool.ts`）：**强制带 Consumer 身份与租户上下文，结果脱敏后返回**。
- `assistant.config.ts`：开关（`AI_ASSISTANT_MODE=mock|real`、`AI_SERVICE_URL`、`AI_SERVICE_TOKEN`、模型名、超时/重试/熔断阈值）。

### 2.3 user-app（uni-app → 小程序 + H5）
职责：客服会话界面——入口、对话窗口、流式回复渲染、引用来源展示、快捷问题、降级提示。复用 P1-3 的登录态与「消费者只读通道」身份（手机号/openid → 平台级 `Consumer`）。

### 2.4 station-web（次要）
店员侧客服入口（操作指引/FAQ 为主），复用同一 `AiAssistant` 接口但身份为 StaffUser、工具集换为「店内只读工具」（本期可仅接 FAQ，工具留待后续）。本文以 `user-app` 收件人侧为主。

---

## 3. 数据模型

> 约定：业务表含 `id(uuid)`、`tenant_id`、`created_at/updated_at/deleted_at`、`created_by`；`tenant_id` 建 RLS Policy + `FORCE ROW LEVEL SECURITY` + 联合索引。会话/消息表按租户隔离。知识库 FAQ 表可平台级或租户级（见下）。

### 3.1 知识库 FAQ 表 `faq_entries`
存「问题—答案—分类—关键词/向量」，支撑降级直答与 RAG 检索召回。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | uuid? | 租户级 FAQ；为 `NULL` 表示**平台级通用 FAQ**（所有租户可见，如「怎么寄件」通用流程）。检索时合并「平台级 + 本租户级」。 |
| `category` | enum | `PICKUP`(取件) / `SHIPPING`(寄件) / `PARCEL_STATUS`(包裹状态) / `MEMBER`(会员) / `GENERAL`(通用) |
| `question` | text | 标准问法 |
| `answer` | text | 标准答案（可含占位符如 `{pickup_code}` 提示需工具补全） |
| `keywords` | text[] | 关键词（降级模式关键词匹配用） |
| `embedding` | vector? | 向量（real 模式；mock 模式可空，用 pgvector 或外部向量库） |
| `priority` | int | 同分时排序权重 |
| `enabled` | bool | 上下线开关 |
| `source` | varchar | 来源（人工/文档导入批次号），便于回溯与重建索引 |

索引：`(tenant_id, category, enabled)`；`keywords` GIN；`embedding` 向量索引（real）。
RLS：`tenant_id IS NULL OR tenant_id = current_tenant`（读）；写仅平台/店长。

> 知识库物理存储：FAQ 结构化条目存 Postgres `faq_entries`；操作指引类长文档（如完整寄件流程）可作为「文档片段」一并向量化（real 模式存向量库，mock 模式只用 `keywords`/全文）。本期 real 向量库默认 **pgvector**（复用 Postgres，最省运维），抽象层允许后续换独立向量库。

### 3.2 会话记录 `ai_conversations`
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 会话 ID |
| `tenant_id` | uuid | 租户 |
| `consumer_id` | uuid | 提问者（平台级 Consumer；店员侧则 `staff_user_id`，二选一，用 `actor_type` 区分） |
| `actor_type` | enum | `CONSUMER` / `STAFF` |
| `channel` | enum | `USER_APP` / `STATION_WEB` |
| `mode` | enum | 本次会话生效模式 `MOCK`/`REAL`（落库便于复盘降级率） |
| `title` | varchar | 首问摘要 |
| `status` | enum | `ACTIVE` / `CLOSED` |
| `last_active_at` | timestamptz | 最近活跃 |

索引：`(tenant_id, consumer_id, last_active_at desc)`。RLS：按 `tenant_id`，且消费者只读通道额外限 `consumer_id = 当前已验证消费者`。

### 3.3 会话消息 `ai_messages`
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 消息 ID |
| `tenant_id` | uuid | 租户 |
| `conversation_id` | uuid | 所属会话 |
| `role` | enum | `USER` / `ASSISTANT` / `TOOL`（工具调用与结果记录） |
| `content` | text | 文本内容（USER=问句；ASSISTANT=回答；TOOL=结构化调用/结果 JSON 串） |
| `tool_name` | varchar? | role=TOOL 时填，如 `query_my_parcels` |
| `tool_payload` | jsonb? | 工具入参（已脱敏，**不存原始敏感值**）/出参摘要 |
| `citations` | jsonb? | role=ASSISTANT 时：引用的 FAQ/文档 id 列表 + 命中片段摘要 |
| `degraded` | bool | 该回答是否走降级（用于前端标记「基础应答」与统计） |
| `latency_ms` | int? | 生成耗时 |
| `seq` | int | 会话内有序序号 |

索引：`(conversation_id, seq)`。RLS：按 `tenant_id`。
> 隐私：`ai_messages.content` 可能含本人包裹信息——属本人会话、RLS+消费者通道双重隔离；工具入参不落明文敏感字段（如完整手机号），仅存掩码或引用 id。

---

## 4. 接口与 API

### 4.1 链路总览（user-app ↔ NestJS ↔ ai-service）
1. 前端 `POST /api/assistant/chat`（JWT；body 含 `conversationId?`、`question`），建立 **SSE** 连接。
2. NestJS `assistant.service` 组装 `ConsumerContext`（见 §4.2），落 USER 消息，转发到 `ai-service POST /assistant/chat`（内网，SSE 流式）。
3. `ai-service` 做 RAG：知识库检索 → 拼 prompt（注入上下文）→ 调大模型流式生成。
4. 当大模型决定调工具，`ai-service` 暂停生成，**通过工具调用回调**把 `tool_call` 事件回吐给 NestJS；NestJS 在 `tool-registry` 执行（带鉴权+脱敏），把 `tool_result` 送回 `ai-service`，大模型据此继续生成。
5. 文本增量与最终答案（含 `citations`、`degraded` 标记）流式回到前端；NestJS 落 ASSISTANT/TOOL 消息。

> 工具调用回调实现方式（二选一，本期取 A，简单且无需双向长连）：
> - **A. 单连内编排（推荐）**：NestJS 与 `ai-service` 之间用一条请求承载整轮；`ai-service` 在 SSE 流里发 `event: tool_call`，NestJS 收到后**同步**回调 `ai-service` 的续传端点 `POST /assistant/chat/{turnId}/tool_result` 提交结果，`ai-service` 续写。等价于「Claude 工具循环」由 NestJS 托管执行、`ai-service` 托管大模型循环。
> - B. 让 NestJS 完整托管大模型工具循环、`ai-service` 仅做「单步生成 + 知识库检索」无状态服务（更彻底的防越权，但 `ai-service` 退化为薄封装）。作为演进选项记录。

### 4.2 AiAssistant 接口（核心抽象）

`AiAssistant.ask(question, consumerContext) -> Answer`（NestJS 侧抽象，屏蔽 mock/real）：

```
interface ConsumerContext {              // 由 NestJS 从 JWT/会话装配，禁止前端传敏感身份
  tenantId: string;
  actorType: 'CONSUMER' | 'STAFF';
  consumerId?: string;                   // 已验证消费者（消费者只读通道）
  staffUserId?: string;
  verifiedPhone?: string;                // 仅服务端持有，用于工具查本人包裹；不下发前端
  channel: 'USER_APP' | 'STATION_WEB';
  conversationId?: string;
  locale?: string;
}

interface Answer {
  conversationId: string;
  text: string;                          // 最终回答
  citations: Citation[];                 // 引用来源（FAQ/文档 id + 片段）
  toolCalls: ToolCallTrace[];            // 本轮调用过的工具（名+脱敏入参+结果摘要）
  degraded: boolean;                     // true=走降级 FAQ
  mode: 'MOCK' | 'REAL';
}

interface AiAssistant {
  ask(question: string, ctx: ConsumerContext): Promise<Answer>;        // 非流式
  askStream(question: string, ctx: ConsumerContext): AsyncIterable<ChatEvent>; // 流式(默认)
}
```

两实现：
- `FaqAssistant`（降级）：纯知识库匹配（关键词/向量），不调大模型；命中→返回 FAQ 答案（必要时调工具补全 `{pickup_code}` 等占位）；未命中→兜底话术 + 转人工提示。`degraded=true`。
- `LlmAssistant`（真实）：转发 `ai-service /assistant/chat`，走 RAG + 工具编排 + 大模型生成。LLM 不可用时由 `assistant.service` 捕获并回落 `FaqAssistant`。

### 4.3 NestJS 对前端 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/assistant/chat` | 提问（SSE 流式）。Body `{ conversationId?, question }`；身份由 JWT 解析。返回 SSE：`event: delta`（文本增量）/ `event: citation` / `event: tool`（脱敏轨迹）/ `event: done`（含 `degraded`,`mode`,`conversationId`）/ `event: error`。 |
| GET | `/api/assistant/conversations` | 本人会话列表（分页）。 |
| GET | `/api/assistant/conversations/:id/messages` | 会话历史消息（仅本人，RLS+consumer 双限）。 |

统一响应仍走 `{code,message,data}`（SSE 除外，错误以 `event: error` 帧承载并落 `error` 业务码）。鉴权：消费者只读通道 + JWT；限流（每消费者 QPS/分钟问答数）走 P3-4 限流器。

### 4.4 受控查询工具契约（NestJS 暴露给 ai-service 的「手」）

工具在 `ai-service` 侧仅有 **schema 声明**（供大模型选择与填参），**执行体在 NestJS**（保证鉴权与脱敏）。`ai-service` 通过 §4.1-A 的回调把 `tool_call` 交回 NestJS 执行。

#### 工具 1：`query_my_parcels`（查本人包裹）
- 语义：查询**当前已验证消费者本人**在各门店的包裹（在库/历史），返回状态、取件码、库位、所属门店、入库时间。
- 入参 schema（大模型可填）：
  ```
  { status?: 'STORED'|'PICKED_UP'|'ALL',   // 默认 STORED（在库待取）
    stationName?: string,                  // 可选门店名模糊
    limit?: int (<=20, 默认 10) }
  ```
- **服务端强制注入**（大模型不可见、不可改）：`tenantId`、`verifiedPhone`/`consumerId`——**只查本人，跨人/跨租户参数被忽略或拒绝**。
- 数据源：`parcel` 上下文（经消费者只读通道按 `verifiedPhone` 聚合跨门店）。
- 出参（脱敏后）：
  ```
  { items: [{ parcelId, stationName, status, pickupCode, slotLabel,
              storedAt, phoneMasked }],   // phoneMasked='138****1234'
    total }
  ```
- 权限/脱敏规则见 §4.5。

#### 工具 2：`query_logistics`（查物流）
- 语义：查询本人某寄件订单/包裹的物流轨迹（依赖 P2-1 `logistics_tracks`；未上线则返回「暂无」）。
- 入参 schema：`{ parcelId?: string, shipOrderId?: string, limit?: int(<=20) }`（至少一个 id；id 必须经服务端校验**属于本人**）。
- 服务端强制注入：`tenantId`、本人身份；**校验该 id 归属本人，否则拒绝**。
- 出参：`{ tracks: [{ time, node, desc }], status }`。

#### 工具调用回调端点（NestJS ↔ ai-service 内部）
- `ai-service` → NestJS：SSE 帧 `event: tool_call { turnId, toolName, args }`（args 仅含大模型可填字段）。
- NestJS → `ai-service`：`POST {AI_SERVICE_URL}/assistant/chat/{turnId}/tool_result`，body `{ toolName, result | error }`（result 已脱敏）。
- 服务间鉴权：`AI_SERVICE_TOKEN`（双向校验，内网）。

### 4.5 权限与脱敏（防越权的硬规则）
1. **身份只服务端装配**：`ConsumerContext.tenantId/consumerId/verifiedPhone` 全部由 NestJS 从 JWT/消费者验证态解析，**前端与大模型都无法注入或篡改**。
2. **工具强制本人作用域**：所有只读工具在执行前由 `tool-registry` 注入 `tenantId + 本人身份`，并**剔除/拒绝**入参里任何指向他人/他租户的字段（如 `phone`、`consumerId`、`tenantId` 一律忽略大模型所填，以服务端值为准）。
3. **id 归属校验**：`query_logistics` 等按 id 查询的工具，先校验 id 属于本人，否则返回 `is_error` 工具结果（不抛业务数据）。
4. **RLS 兜底**：即便工具实现疏漏，Postgres RLS 仍按 `tenant_id` 隔离；消费者通道额外限本人。三道防线：RLS + 工具作用域注入 + id 归属校验。
5. **结果脱敏**：手机号掩码（`138****1234`）、不外泄他人信息、不返回内部主键以外的敏感字段（地址等按需掩码）。落库 `ai_messages.tool_payload` 仅存掩码值/引用 id。
6. **大模型不接触原始凭据**：`verifiedPhone` 等绝不进入发给大模型的 prompt 文本与工具入参 schema；大模型只看到「查本人包裹」这一意图与脱敏后的结果。

---

## 5. 关键逻辑

### 5.1 RAG / 知识库检索
- **检索**：对用户问句做归一化 → 在 `faq_entries`（平台级 ∪ 本租户级，`enabled=true`）检索 Top-K：
  - mock：关键词命中 + 简单打分（关键词重合度 + `priority`）。
  - real：向量相似度（pgvector）+ 关键词混合召回（向量为主，关键词补召回）。
- **拼 prompt**：System 指令（角色=菜鸟驿站客服、只答驿站相关、不知就说不知、可调工具查本人数据、回答附引用）+ 检索到的 FAQ/文档片段（带 id 便于回引）+ 注入的用户上下文摘要（见 §5.2）+ 历史若干轮 + 当前问句。
- **引用**：回答须带 `citations`（命中条目 id + 片段），前端展示「依据」。

### 5.2 上下文注入（本人包裹）
- 轻量上下文**预取**：会话开始/每问前，NestJS 可预取本人「在库包裹数 + 最近 N 条状态摘要（脱敏）」注入 prompt，减少一次工具往返、提升「我的包裹到了吗」类直答率。
- 重/精确查询**走工具**：需要取件码、具体某门店、物流轨迹时由大模型显式调工具（避免把全部数据塞 prompt，且工具路径鉴权更严）。
- 注入内容一律**脱敏 + 限本人**，与工具同源同规则。

### 5.3 工具调用编排
- 采用 Claude 工具使用循环（`stop_reason: tool_use` → 执行 → 回灌 `tool_result` → 续生成），循环在 §4.1-A 下由「ai-service 托管大模型循环、NestJS 托管工具执行」协作完成。
- 设最大工具轮数（如 ≤4）防失控；超限则用已有信息收口作答并提示「如需更多请补充」。
- 工具失败（下游错误/越权拒绝）→ 以 `is_error` tool_result 回灌，大模型据此礼貌说明而非泄露错误细节。

### 5.4 降级 FAQ
触发降级的情形：`AI_ASSISTANT_MODE=mock`，或 real 模式下大模型外呼失败/超时/熔断打开/成本闸限流。降级逻辑：
- 走 `FaqAssistant`：知识库匹配命中→返回 FAQ 答案（若答案含占位且能安全用工具补全则补全，否则给通用答案）；未命中→兜底话术「您可以问『我的包裹到了吗 / 怎么寄件 / 取件码在哪』，或联系门店」。
- 标记 `degraded=true`、`mode=MOCK`，前端显示「基础应答」徽标；落库统计降级率。
- **降级也守越权**：FAQ 补全占位若需本人数据，仍走同一受控工具与脱敏规则。

### 5.5 防越权（汇总，见 §4.5 硬规则）
单一收口：所有取数经 NestJS `tool-registry`，强制本人+租户作用域、id 归属校验、结果脱敏；RLS 兜底。`ai-service`/大模型/前端均无法绕过。

### 5.6 大模型选型
- **真实实现选用 Claude 最新模型 `claude-opus-4-8`**（Anthropic 官方 SDK，Python `anthropic`），客服问答与工具编排均由其完成。
- 请求参数遵循当前最佳实践：默认开启自适应思考 `thinking: {type: "adaptive"}`（适合需检索+工具编排的多步任务）；对长输入/长输出/高 `max_tokens` 默认**流式**（用 SDK `.get_final_message()` 取完整结果），契合前端 SSE 流式渲染。
- 工具按 Claude 工具使用规范声明（`tools` + JSON schema，见 §4.4）；解析工具入参一律 `json.loads`，不做原始串匹配。
- 成本与稳健：自适应思考 + 合理 `max_tokens` + 知识库压缩上下文（只塞 Top-K 片段，不塞全量数据）控制 token；外呼挂熔断（P3-4），故障降级 FAQ。
- 选型经 `LlmProvider` 抽象封装，env `AI_LLM_MODEL` 可覆盖，便于后续切换/灰度。

---

## 6. 业务流程

「提问 → 意图/检索 → 工具取数 → 生成 → 回答」：

```
收件人在 user-app 输入问句
  └▶ NestJS /assistant/chat：JWT 鉴权 → 装配 ConsumerContext(本人/租户/verifiedPhone)
        → 落 USER 消息 → (real?) 转发 ai-service : (mock?) 直接 FaqAssistant
              │ real 分支:
              ├▶ ai-service RAG: 知识库检索 Top-K(平台∪本租户)
              ├▶ 注入轻量本人上下文(脱敏) + 拼 prompt
              ├▶ Claude(claude-opus-4-8) 流式生成
              │     └─ 需取数? 发 tool_call ─▶ NestJS tool-registry 执行
              │              (注入本人+租户作用域 → 查 parcel/logistics → 脱敏)
              │              └─ tool_result 回灌 ─▶ Claude 续写
              ├▶ 文本增量/citation/tool 轨迹 SSE 流式回前端
              └▶ 落 ASSISTANT/TOOL 消息(含 citations、degraded、latency)
        └─ 任一步 LLM 故障/超时/熔断 → 捕获 → 回落 FaqAssistant(degraded=true)
  └◀ user-app 渲染：流式回答 + 引用「依据」+(降级时)「基础应答」徽标
```

典型问答映射：
- 「我的包裹到了吗」→ 检索 PARCEL_STATUS FAQ + 注入本人在库摘要/调 `query_my_parcels(status=STORED)` → 「您有 2 件在库，取件码…」。
- 「取件码在哪」→ `query_my_parcels` 取 `pickupCode` + 库位 → 直答（脱敏手机）。
- 「怎么寄件」→ 命中 SHIPPING FAQ/文档片段 → 流程指引（多为纯 FAQ，不必调工具）。

---

## 7. 前端（user-app 客服会话界面）

> 遵循用户记忆约束：云盘类前端需对齐原型；本项目 `user-app` 遵循 P1-3 已定主题（默认清爽蓝）、uni-app（小程序+H5）、全屏平铺规范。新增页面对齐既有 31 页高保真风格。

- **入口**：首页/我的页「在线客服」浮标或菜单项；可带未读/欢迎语。
- **会话页**：
  - 消息气泡列表（用户右、助手左），助手消息**流式逐字渲染**（消费 SSE `delta`）。
  - **引用「依据」**：助手回答下方可展开命中的 FAQ 条目（来自 `citations`）。
  - **降级徽标**：`degraded=true` 时显示「基础应答」灰标，提示当前为知识库应答。
  - **工具轨迹（轻量）**：可选「正在为您查询包裹…」过程提示（来自 `tool` 帧，仅展示动作名，不展示敏感入参）。
  - **快捷问题**：预置「我的包裹到了吗 / 怎么寄件 / 取件码在哪 / 取件时间」按钮，点按即发。
  - **错误态**：`event: error` 显示「服务繁忙，请稍后重试或联系门店」。
- **状态管理**：会话 id 持久化，可拉历史（`/conversations/:id/messages`）；身份走 P1-3 消费者通道，敏感身份不在前端持有。
- **可访问性/性能**：流式节流渲染、长会话懒加载、断流重连（重连后拉历史去重）。

---

## 8. ai-service 设计（FastAPI / 大模型集成 / 知识库 / 可降级）

### 8.1 工程与路由
- 复用 P4-1 的 FastAPI 工程；新增 `assistant` 路由组与 `kb`、`llm`、`rag`、`tools` 子模块。
- 健康检查 `/assistant/healthz` 暴露：当前 `mode`、LLM 可达性、知识库索引就绪。
- 服务间鉴权中间件校验 `AI_SERVICE_TOKEN`，仅允许 NestJS 内网调用。

### 8.2 大模型集成（LlmProvider 抽象）
```
class LlmProvider(Protocol):
    def generate_stream(self, system, messages, tools) -> Iterable[LlmEvent]: ...
    # LlmEvent: TextDelta | ToolCall | Done

class MockLlmProvider:   # 不调外部，按模板/FAQ 命中拼回答；用于测试与降级演示
    ...
class ClaudeLlmProvider: # 真实：Anthropic SDK，model=claude-opus-4-8
    # thinking=adaptive；流式 .get_final_message()；tools=工具 schema；json.loads 解析入参
    ...
```
- env 开关：`AI_ASSISTANT_MODE=mock|real`、`AI_LLM_MODEL=claude-opus-4-8`、`ANTHROPIC_API_KEY`、超时/重试。
- 外呼失败/超时 → 抛 `LlmUnavailable`，由 orchestrator 触发降级（或交回 NestJS 由 `assistant.service` 回落 FAQ）。

### 8.3 知识库（KnowledgeBase 抽象）
```
class KnowledgeBase(Protocol):
    def search(self, query, tenant_id, k) -> list[KbHit]: ...   # KbHit: id, text, score, category
    def reindex(self, entries) -> None: ...                     # 重建索引

class KeywordKB:  # mock：关键词/BM25-lite，依赖 faq_entries.keywords + 全文
class VectorKB:   # real：pgvector 向量检索 + 关键词混合召回
```
- 索引数据来自 NestJS 同步的 `faq_entries`（或 ai-service 只读访问只读副本/通过 NestJS 拉取条目重建）；`POST /assistant/kb/reindex` 触发重建。
- 检索始终带 `tenant_id`，返回平台级 ∪ 本租户级条目。

### 8.4 RAG 编排（orchestrator）
- 串联：检索 → 拼 prompt（System+片段+本人上下文摘要+历史+问句）→ `LlmProvider.generate_stream` → 遇 `ToolCall` 经 SSE 交 NestJS 执行并回灌 → 收口（附 citations）。
- 设最大工具轮数与总超时；任一异常 → 降级路径（mock provider 或返回可降级信号给 NestJS）。

### 8.5 可降级
- 维度一（部署/配置）：`AI_ASSISTANT_MODE=mock` → 全程 `MockLlmProvider + KeywordKB`，不外呼。
- 维度二（运行时故障）：real 模式下 LLM 不可用/超时/熔断 → orchestrator 或 NestJS 回落 FAQ 直答。
- 两条降级路径均保持工具受控与脱敏规则；降级结果标 `degraded=true`。

---

## 9. 任务分解

> 进入执行时按本表展开为逐步 TDD 计划（粒度对齐 P1-1）。建议 subagent-driven（每 Task 派子代理、Task 间评审）。

1. **知识库数据模型与导入** → 产物：`faq_entries` Prisma 模型 + RLS（含平台级 `tenant_id IS NULL`）+ 种子 FAQ（取件/寄件/状态/会员/通用）+ 导入脚本；验收：建表/RLS 单测绿，种子可查（平台∪租户合并）。
2. **会话/消息模型** → 产物：`ai_conversations / ai_messages` 模型 + RLS + `conversation.service` 读写 + 序号/分页；验收：会话与消息 CRUD、RLS+消费者双限单测绿。
3. **ai-service 知识库检索** → 产物：`KnowledgeBase` 抽象 + `KeywordKB`(mock) + `VectorKB`(real, pgvector) + `/assistant/kb/reindex`；验收：给定问题检索到相关条目（mock 关键词、real 向量）的测绿。
4. **ai-service LlmProvider** → 产物：`LlmProvider` 抽象 + `MockLlmProvider` + `ClaudeLlmProvider`(claude-opus-4-8, 自适应思考, 流式)；验收：mock 回模板、real 走大模型（可打桩）的接口测绿。
5. **ai-service RAG 编排 + /assistant/chat** → 产物：`orchestrator`（检索→拼 prompt→生成→工具循环 SSE→收口+citations）+ 路由 + 服务间令牌中间件 + `/assistant/chat/{turnId}/tool_result` 续传端点；验收：mock 端到端回答带 citations；real 走大模型（打桩）测绿。
6. **NestJS AiAssistant 抽象 + 两实现** → 产物：`AiAssistant` 接口、`FaqAssistant`(降级)、`LlmAssistant`(转发 ai-service)、`assistant.client`、`assistant.service`(编排+落库+回落)；验收：mock/real 切换、LLM 故障回落 FAQ 单测绿。
7. **受控查询工具** → 产物：`tool-registry` + `query_my_parcels` + `query_logistics`（强制本人+租户作用域、id 归属校验、脱敏）；验收：越权/跨租户被拒、合法查询返回脱敏结果、id 不属本人被拒的单测绿。
8. **前端对前端 API + SSE** → 产物：`assistant.controller`（`/chat` SSE、`/conversations*`）+ 鉴权/限流 + SSE 帧规范（delta/citation/tool/done/error）；验收：流式回包、会话历史、错误帧的接口测绿。
9. **user-app 客服会话界面** → 产物：入口 + 会话页（流式渲染、引用展示、降级徽标、快捷问题、错误/重连）；验收：用户能问「我的包裹在哪/怎么取件/取件码」拿到含真实数据的流式回答，降级时显示「基础应答」。
10. **P4-2 e2e 冒烟** → 产物：`test/assistant.e2e-spec.ts`（提问→检索→工具→回答；越权被拒；LLM 故障降级 FAQ；引用存在）；验收：客服链路 e2e 绿、降级可用、越权用例全绿。

---

## 10. 验收标准

- **RAG 问答可用且带来源**：real 模式问「我的包裹到了吗/取件码在哪/怎么寄件」返回正确回答，含 `citations` 可溯源。
- **工具受租户/权限约束**：`query_my_parcels`/`query_logistics` 强制本人+租户作用域；越权（他人手机号/跨租户/非本人 id）被拒，不泄露他人数据；结果脱敏（手机号掩码）。
- **LLM 故障降级到 FAQ**：模拟大模型不可用/超时/熔断，仍返回 FAQ 答案且 `degraded=true`；`mock` 模式全程不外呼可用。
- **大模型选型正确**：真实实现使用 `claude-opus-4-8`，自适应思考 + 流式，工具入参 JSON 解析无误。
- **前端可对话**：`user-app` 客服入口可进、流式回复、展示引用、降级徽标、断流重连去重。
- **数据隔离**：`faq_entries`（平台∪租户）、`ai_conversations/ai_messages` 经 RLS + 消费者通道双重隔离；跨租户/跨人不可见。
- **可观测**：会话/消息落库含 `degraded`、`latency_ms`、`mode`，可统计降级率与时延。
- 单测覆盖：检索召回、工具作用域/脱敏/越权拒绝、降级回落、状态隔离；e2e 跑通客服闭环。测试全绿。

---

## 11. 依赖与风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| **幻觉**（编造取件码/状态/流程） | 大模型可能臆造本人数据或驿站流程。 | 事实类一律走**受控工具取真实数据**，不让模型凭空作答；System 强约束「只答驿站相关、不知就说不知、数据以工具结果为准」；回答带 `citations` 可溯源；关键事实（取件码/状态）只来自 `query_my_parcels` 结果。 |
| **越权取数**（查到他人/他租户） | prompt 注入诱导、入参伪造他人身份。 | 身份只服务端装配；工具强制注入本人+租户作用域并剔除模型所填身份字段；id 归属校验；RLS 兜底；`verifiedPhone` 绝不进 prompt/工具 schema。三道防线 + e2e 越权用例。 |
| **成本**（token/调用费用失控） | 长上下文、频繁工具轮、高并发。 | 知识库只塞 Top-K 片段不塞全量；自适应思考 + 合理 `max_tokens`；最大工具轮数限制；每消费者限流；熔断+降级 FAQ；落库 `latency_ms`/`mode` 监控成本与降级率；可按租户/套餐计费（P3-1 用量计量挂钩，记客服问答用量）。 |
| **LLM 可用性/延迟** | 外呼大模型抖动、超时。 | 外呼挂熔断（P3-4）；超时即降级 FAQ；流式提升体感；`/assistant/healthz` 暴露可达性。 |
| **知识库质量/时效** | FAQ 过期或召回不准导致答非所问。 | FAQ `enabled`/`priority`/`source` 可治理；`reindex` 重建；平台级∪租户级分层维护；后续可加点赞/纠错回流（留扩展位）。 |
| **隐私合规** | 会话含本人包裹信息。 | 本人会话 + RLS + 消费者通道隔离；工具入参不落明文敏感字段（掩码/引用 id）；脱敏输出；审计可挂 P3-3 audit。 |
| **依赖 P2-1 未上线** | `query_logistics` 无数据源。 | 工具优雅降级返回「暂无物流信息」，不报错；待 P2-1 上线自动可用。 |
