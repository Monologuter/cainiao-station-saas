# P4-1 OCR 面单识别入库 · 详细设计文档

> 版本 v1.0（2026-06-18）｜ 设计级别（设计为主，不写完整实现代码）
> 配套《设计方案（整合版）v2.0》§5(ocr/ai · inbound) / §7(适配层) / §2.5(ai-service 独立进程)
> 上游计划：《实现计划总表》P4-1（roadmap 第 366–385 行）。本文把该 plan 展开为**设计级**详档；进入执行时再据此切逐步 TDD 任务。

---

## 1. 目标 · 周期 · 依赖

### 1.1 目标
入库提速：店员在 `station-web` 扫码入库页对面单**拍照/上传图片**，由独立的 **ai-service（Python FastAPI）** 调云 OCR 识别出**运单号 / 手机号后四位 / 快递公司**，回填后端 `inbound` 录入表单，店员核对后一键入库；支持连拍批量。`OcrProvider` 走适配层（**降级=手动录入，真实=云 OCR**），由配置开关切换，OCR 不可用或低置信度时**无缝回落人工录入**，核心入库闭环不被 OCR 卡住。

**一句话价值**：把「逐字段手敲运单号+手机号」变成「拍一张照、核对、确认」，单件录入时间显著下降，批量场景吞吐提升。

### 1.2 周期
P4（智能化），plan 序号 12（在 P4-2/P4-3 之前，是 ai-service 的第一个落地能力，验证「OCR 适配 + 独立服务 + 降级回落」模式）。

### 1.3 依赖
| 依赖 | 用途 | 必须就绪项 |
|---|---|---|
| **P1-2 驿站核心闭环** | 复用既有 `inbound.service` 入库编排（建 parcel → 分配库位 → 取件码 → STORED → `ParcelStored`） | `POST /inbound` 已可用 |
| **P3-4 工程化加固** | 适配层熔断/降级、`file`(MinIO) 稳健、配置渠道开关热切换、可观测性 | 熔断器 + 渠道开关 + file 存取 |
| **file 上下文** | 面单图存 MinIO（私有桶、签名 URL） | `FileStorage` 接口可用 |
| **基础设施** | ai-service 已规划为独立进程（spec §2.5），Docker Compose 已含 `ai-service` 占位 | 进程可起、可被后端内网调用 |

> 非阻塞：P4-1 可在 mock OcrProvider 上完整跑通并交付；real 云 OCR 接入是开关项，缺资质不影响交付。

---

## 2. 涉及上下文与模块

```
station-web(扫码入库页)
   │ ① 选图/拍照 multipart 上传
   ▼
backend · inbound 上下文 ──② 存面单图──▶ file(FileStorage→MinIO)
   │  ocr.client（HTTP 调 ai-service，含熔断+超时+降级）
   │  ocr-result.mapper（字段映射、置信度阈值判定、回落标记）
   ▼ ③ recognizeWaybill(image)
ai-service（独立进程 · Python FastAPI）
   POST /ocr/waybill
   OcrProvider 抽象 ── mock（规则/假数据） / real（云 OCR SDK）
   │
   ▼ ④ 结构化字段 + 置信度回传
inbound 复用 P1-2 入库编排 ──▶ parcel(状态机) / station(库位) / notify
```

| 上下文/模块 | 本期职责 | 改动性质 |
|---|---|---|
| **inbound**（backend） | 新增 OCR 辅助入库端点；调 ai-service；结果映射与置信度判定；面单图落库；**复用** P1-2 既有入库编排做最终入库 | 扩展（不改既有 `POST /inbound`） |
| **ai-service**（Python FastAPI，独立进程） | 新增 `/ocr/waybill` 端点；`OcrProvider` 抽象 + mock/real 实现；图片预处理；字段抽取与置信度归一 | 新建（ai-service 的首个业务能力） |
| **file**（backend） | 面单图上传到 MinIO 私有桶、返回 `fileId`/签名 URL；生命周期（留存/清理）策略 | 复用 P1 `FileStorage`，补面单图桶约定 |
| **OcrProvider**（ai-service 内适配层） | 接口 + 降级(mock) + 真实(云 OCR) + env 开关 + 失败降级，对齐 spec §7 统一适配模式 | 新建（ai-service 侧适配层） |
| parcel / station / notify | 不直接改；经 inbound 复用其既有能力 | 无改动 |

**边界约束**：后端 `inbound` 只通过 `ocr.client`（HTTP 契约）与 ai-service 通信，不依赖 ai-service 内部实现；ai-service 不碰数据库、不知道 `tenant_id` 业务语义，是**无状态识别服务**，租户/落库/状态机全在后端。

---

## 3. 数据模型

> 约定沿用 spec §6：业务表含 `id(uuid)`、`tenant_id`、`created_at/updated_at/deleted_at`、`created_by`；新表迁移内同步加 RLS Policy + `FORCE ROW LEVEL SECURITY`。ai-service 无自有持久化（本期无状态）。

### 3.1 面单图（复用 file，不新建表）
面单图走既有 `file` 上下文存 MinIO；后端仅持有 `fileId`/对象 key。约定：
- 桶/前缀：`waybills/{tenantId}/{yyyymmdd}/{uuid}.jpg`，**私有**，访问走短时签名 URL。
- 留存策略：识别记录引用其 `fileId`；保留期（建议 30~90 天，配置项 `OCR_WAYBILL_IMAGE_TTL_DAYS`）后由清理任务（复用 P2-2/P3-4 定时设施）软删/移除对象，规避面单 PII 长期堆积。

### 3.2 识别记录表 `ocr_recognitions`（新增，可审计/可复盘）
记录每次 OCR 识别的输入图与输出字段+置信度，用于：人工确认追溯、识别质量统计、real 上线后的准确率回归、问题面单复查。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | uuid | 租户（RLS） |
| `station_id` | uuid | 操作门店（数据范围） |
| `file_id` | uuid | 面单图（→ file） |
| `provider` | text | `mock` / 云厂商标识（如 `tencent`） |
| `waybill_no` | text? | 识别出的运单号 |
| `phone_tail` | text? | 手机号后四位 |
| `courier_code` | text? | 快递公司标准编码（见 §3.3） |
| `confidence` | jsonb | 各字段置信度 `{waybillNo,phoneTail,courier,overall}`（0~1） |
| `status` | text | `RECOGNIZED`(已识别) / `LOW_CONFIDENCE`(需人工) / `FAILED`(识别失败) / `CONFIRMED`(已确认入库) / `FALLBACK_MANUAL`(回落手动) |
| `parcel_id` | uuid? | 确认入库后回填，关联 parcel |
| `latency_ms` | int? | 识别耗时（观测/SLO） |
| `error_code` | text? | 失败原因码（超时/熔断/下游错误/不可读） |
| `created_by` | uuid | 操作店员 |
| 审计/软删字段 | — | 同 §6 约定 |

**索引**：`(tenant_id, created_at)`、`(tenant_id, station_id, status)`、`(tenant_id, waybill_no)`。
**RLS**：按 `tenant_id` 隔离 + 门店 scope（店员只见所属门店）。

### 3.3 快递公司编码字典（复用/约定，不一定建新表）
识别出的「快递公司」需归一到系统标准编码（顺丰`SF`/中通`ZTO`/圆通`YTO`/韵达`YD`/申通`STO`/京东`JD`/邮政`EMS`/极兔`JT` 等）。
- 若 P3-3 `dictionaries` 已落地：作为字典项 `courier_company` 复用。
- 否则：ai-service 内置「识别文本/Logo→标准编码」映射表（常量），后端做二次校验。识别置信度低或不在字典内时 `courier_code=null`，交人工选。

### 3.4 置信度阈值（配置，不入表结构）
- `OCR_CONF_AUTO_FILL`（默认 0.80）：≥ 该值字段直接预填且标记「高可信」。
- `OCR_CONF_NEED_REVIEW`（默认 0.50）：[0.50,0.80) 预填但**高亮提示核对**。
- `< 0.50` 或缺失：该字段置空，要求人工补录。
- `overall < OCR_CONF_NEED_REVIEW` 或关键字段（运单号）缺失：整单记 `LOW_CONFIDENCE`。

---

## 4. 接口与 API

### 4.1 ai-service ↔ 后端 内部契约：`POST /ocr/waybill`
> 内网 HTTP（后端 → ai-service）；JSON 或 multipart；ai-service 无状态、不鉴业务权限（由后端在内网调用 + 共享 service token 简单鉴权）。

**Request**（二选一，推荐 A 省一次中转）
- A. multipart：`image`(file) + `meta`(json: `requestId`, `hint?`)
- B. json：`{ imageUrl: <ai-service 可取的签名URL>, requestId, hint? }`

**Response（200，识别成功/部分成功）**
```jsonc
{
  "requestId": "uuid",
  "provider": "mock | tencent",
  "fields": {
    "waybillNo":  { "value": "SF1234567890123", "confidence": 0.93 },
    "phoneTail":  { "value": "8765",            "confidence": 0.88 },
    "courier":    { "value": "SF", "raw": "顺丰速运", "confidence": 0.81 }
  },
  "overallConfidence": 0.87,
  "latencyMs": 420,
  "warnings": []           // 如 ["image_blurry","multiple_waybills"]
}
```
**Response（业务可恢复失败，HTTP 200 + status，便于后端统一降级）**
```jsonc
{ "requestId":"uuid", "provider":"tencent", "fields":{}, "overallConfidence":0,
  "errorCode":"UNREADABLE | NO_WAYBILL_FOUND", "warnings":["..."] }
```
**Response（不可用，HTTP 5xx / 超时）**：后端 `ocr.client` 捕获 → 熔断器计数 → 降级（见 §5）。

**契约语义（recognizeWaybill(image) → {运单号, 手机尾号, 快递, 置信度}）**
| 输出字段 | 含义 | 缺失/不确定时 |
|---|---|---|
| `waybillNo` | 运单号（关键字段，缺则整单 LOW） | 置 null + 低 confidence |
| `phoneTail` | 手机号后四位（合规：只取尾号，不存完整号） | 置 null，人工补 |
| `courier` | 快递公司标准编码 + 原始文本 | 置 null，人工选 |
| `*.confidence` / `overallConfidence` | 0~1 置信度 | — |

> 合规要点：面单含完整手机号，但本契约**只回传后四位**（`phoneTail`）。完整手机号在入库时由店员/绑定流程补全，OCR 不沉淀完整 PII。

### 4.2 后端对外：OCR 辅助入库端点
挂在 `inbound` 上下文，受 `inbound:create`（或新 `inbound:ocr`）功能权限 + 门店 scope。

| 方法 路径 | 用途 | 入参 | 出参（`{code,message,data}`） |
|---|---|---|---|
| `POST /inbound/ocr/recognize` | 上传面单图 → 存图 → 调 ai-service 识别 → 返回预填字段+置信度+记录 | multipart `image`，`stationId` | `{ recognitionId, fileId, fields, confidence, status, needReview }` |
| `POST /inbound/ocr/confirm` | 店员核对/修正后确认入库（**复用 P1-2 入库编排**） | `{ recognitionId, waybillNo, phone, courierCode, slotPref? }` | `{ parcelId, pickupCode, slotCode }`（同 `POST /inbound`） |
| `POST /inbound/ocr/recognize-batch` | 批量连拍：多图一次提交，逐图识别返回列表 | multipart `images[]`，`stationId` | `{ items: [{recognitionId, fields, confidence, status}...] }` |
| `GET /inbound/ocr/recognitions` | 识别记录查询（复盘/质量） | 分页+筛选 | 记录列表 |

**复用而非重写**：`/inbound/ocr/confirm` 内部直接调既有 `inbound.service.create(...)`（与 `POST /inbound` 同一编排），仅在成功后回填 `ocr_recognitions.parcel_id` + `status=CONFIRMED`。识别端点失败/低置信不阻断——前端可直接走原 `POST /inbound` 手动入库（即 `FALLBACK_MANUAL`）。

---

## 5. 关键逻辑

### 5.1 OCR 识别流程（后端 `inbound`）
1. 接图 → 基础校验（大小/格式/张数）→ `FileStorage` 存 MinIO 私有桶，得 `fileId`。
2. 建 `ocr_recognitions`（`status=RECOGNIZED` 暂态，含 `file_id`、`provider`、`station_id`、`created_by`）。
3. `ocr.client.recognizeWaybill(image|url, requestId)` 调 ai-service（带超时 `OCR_TIMEOUT_MS`，默认 5s；经熔断器）。
4. 结果交 `ocr-result.mapper`：字段映射 + 快递编码归一 + 按 §3.4 阈值判定每字段与整单 `status`。
5. 更新记录（字段、置信度、latency、status）→ 返回预填给前端。

### 5.2 置信度分级与人工确认
- **高可信**（字段 ≥ AUTO_FILL）：直接预填、绿色标记，店员扫一眼即确认。
- **需核对**（[NEED_REVIEW, AUTO_FILL)）：预填但黄色高亮 + 「请核对」，光标默认落该字段。
- **缺失/极低**（< NEED_REVIEW 或 null）：该字段空，必填校验拦住，强制人工补。
- 关键字段（运单号）不可信 → 整单 `LOW_CONFIDENCE`，前端顶部提示「识别不完整，请补全后入库」。
- **确认即入库**：店员任何修改都覆盖识别值；`confirm` 以**店员最终值**为准入库，识别值仅作初值与审计留痕（对比修正可用于 real 准确率统计）。

### 5.3 批量入库
- 连拍 N 张 → `recognize-batch` 逐图识别（ai-service 侧可并发，受 `OCR_BATCH_CONCURRENCY` 限）→ 返回卡片列表。
- 前端「批量复核」视图：每张一卡，高可信卡可批量「全部确认」，含低置信卡需逐张补全后才纳入批量入库。
- 每张走独立 `confirm`（独立 parcel/库位/取件码），互不影响；单张失败不回滚其它（各自幂等，带 `recognitionId` 防重复确认）。

### 5.4 降级回落手动（三层降级）
| 触发 | 行为 |
|---|---|
| 开关 `OCR_PROVIDER=mock` | ai-service 走 mock：返回规则化/假识别字段（用于无资质环境与测试），前端流程不变 |
| real 调用超时/5xx/熔断打开 | `ocr.client` 不抛死，返回 `status=FAILED` + 空字段；前端提示「识别暂不可用，请手动录入」，**自动切到原手动入库表单**（图已留存） |
| real 返回 `UNREADABLE/NO_WAYBILL`（业务失败） | 同上回落手动；记录 `error_code` 供质量复盘 |

核心不变量：**任何 OCR 失败都不阻断入库**——面单图已存、表单可手填、`POST /inbound` 原路可用，OCR 只是「加速器」不是「必经路」。熔断与降级复用 P3-4 适配层熔断器（失败率/超时打开→打开期直接走降级→半开探测恢复）。

### 5.5 与既有 inbound 录入复用
- `confirm` 不重写入库，调 `inbound.service.create`：建 parcel(PENDING)→分配库位→生成取件码→STORED→发 `ParcelStored`（通知/统计照常触发）。
- OCR 路径与扫码枪/手动路径**共用同一入库领域服务与同一校验**（运单号去重、手机号格式、库位分配），保证一致性；OCR 仅多产出 `ocr_recognitions` 审计行。

---

## 6. 业务流程（拍照 → 识别 → 确认 → 入库）

```
店员(station-web 扫码入库页)
  │ 点「拍照识别」→ 调摄像头/选图（单张或连拍）
  ▼
POST /inbound/ocr/recognize ─① 存面单图(MinIO) ─② 建识别记录
  │ ③ ocr.client → ai-service /ocr/waybill（熔断/超时保护）
  │ ④ 云OCR(real) 或 mock → {运单号, 手机尾号, 快递, 置信度}
  │ ⑤ 阈值判定 → 预填字段 + needReview 标记
  ▼
前端回填录入表单
  ├─ 高可信：绿标，一键确认
  ├─ 需核对：黄标，店员核对/改
  └─ 失败/低置信：自动回落手动录入（图已留存）
  ▼
店员核对/补全 → 点「确认入库」
  ▼
POST /inbound/ocr/confirm ─复用→ inbound.service.create
  → parcel PENDING→分配库位→取件码→STORED→ParcelStored
  → 回填 ocr_recognitions.parcel_id, status=CONFIRMED
  ▼
入库成功：展示取件码 + 库位（与现有入库一致）
```

批量分支：`recognize-batch` → 复核列表 → 逐卡 `confirm`（高可信卡支持批量确认）。

---

## 7. 前端设计（station-web 扫码入库页 `inbound.html` 增强）

> 遵循 MEMORY/项目约定：前端改动前对齐原型；本页基线为 `design/mockups/hifi/station-web/inbound.html`（扫码输入区 + 录入表单 + 库位分配 + 待入库列表），全屏平铺、默认清爽蓝、`v-perm` 控按钮。

### 7.1 入口与交互
- 录入区在既有「扫码枪输入框 + 手动表单」旁，新增主操作 **「拍照识别」**（`.btn-primary`）与 **「上传面单图」**。
- 触发后：H5 调 `getUserMedia`/`<input capture>` 拍照或选图 → 预览 → 上传 `recognize`。
- **识别中**：表单区骨架/转圈 + 「识别中…」，可取消。
- **回填**：字段（运单号/手机号/快递公司）按置信度着色——高可信绿、需核对黄、缺失留空必填红框；顶部状态条显示 `overallConfidence` 与「请核对 N 项」。
- **失败/不可用**：toast「识别暂不可用，已切换手动录入」，自动聚焦运单号输入框，图缩略图挂在表单旁（留证）。
- **确认**：「确认入库」走 `confirm`，成功复用现有「取件码+库位」结果展示与待入库列表刷新。

### 7.2 批量复核视图
- 连拍模式 → 进入「批量复核」抽屉/页：每图一卡（缩略图 + 三字段 + 置信度徽标）。
- 顶部「全部确认（仅高可信 N 张）」批量提交；低置信卡标红需逐张补全；逐卡「确认 / 跳过 / 重拍」。

### 7.3 降级与权限
- 渠道开关为 mock 或熔断打开时，前端仍展示「拍照识别」（mock 可演示），或由后端返回 `ocrEnabled=false` 时隐藏入口、仅留手动（配置驱动）。
- 「拍照识别」按钮受 `inbound:create`/`inbound:ocr` 权限 `v-perm` 控制；门店 scope 由后端兜底。

---

## 8. ai-service 设计（独立进程）

### 8.1 进程定位
spec §2.5 已规划 `ai-service/`（Python 3.12 + FastAPI）为「拆出的第一个服务」。P4-1 落地其首个能力 `/ocr/waybill`，验证「独立服务 + 适配层 + 降级」模式，后续 P4-2/P4-3 复用同一骨架。**无状态、无数据库**。

### 8.2 FastAPI 端点
| 端点 | 说明 |
|---|---|
| `POST /ocr/waybill` | 单图识别（契约见 §4.1） |
| `POST /ocr/waybill/batch` | 多图识别（可选；否则后端循环单图） |
| `GET /healthz` | 健康检查（含当前 provider、依赖云 OCR 可达性探测） |
| `GET /readyz` | 就绪检查（被 Compose/网关用） |

鉴权：内网调用 + `X-Service-Token` 共享密钥校验（后端注入），不接公网。

### 8.3 `OcrProvider` 适配层（ai-service 内）
```
OcrProvider (抽象)
  recognize_waybill(image_bytes, hint) -> WaybillResult{fields, confidences, warnings, error?}
  ├─ MockOcrProvider   # 降级：规则/假数据；从文件名或固定样本产出可预测字段，供测试与无资质环境
  └─ RealOcrProvider   # 真实：调云 OCR SDK；图片预处理(旋转/裁剪/二值化) → 抽取 → 归一 → 置信度
```
- 切换：`OCR_PROVIDER=mock|tencent`（env / 配置中心）。对齐 spec §7 适配模式。
- `RealOcrProvider` 失败（SDK 异常/超时/限额）：捕获 → 返回 `errorCode`（HTTP 200 业务失败）或抛 5xx（由后端熔断兜底），**provider 内不自行回落 mock**（降级决策归后端，保持单一降级出口）。

### 8.4 云 OCR 选型（可降级，不锁死单一厂商）
- 抽象隔离厂商：`RealOcrProvider` 下可挂多实现（腾讯云 OCR / 阿里云 / 百度），由 `OCR_PROVIDER` 值选择；首选与短信一致的**腾讯云**（与 spec 短信选型生态一致，运维统一）。
- 通用 OCR（通用印刷体/表格）+ 自定义后处理（运单号正则按快递商前缀、手机尾号定位、快递公司 Logo/文本匹配）抽取目标字段并给置信度。
- **可降级**：任一厂商不可用/无资质 → 切 `mock` 即恢复全流程（仅丢自动识别，不丢入库）。

### 8.5 部署
- Docker Compose 新增/启用 `ai-service`：`python:3.12-slim` + FastAPI + uvicorn；env：`OCR_PROVIDER`、云厂商密钥（密钥管理复用 P3-4 约定，不入仓）、`SERVICE_TOKEN`。
- 后端经内网 service 名（如 `http://ai-service:8000`）访问；nginx 不暴露 ai-service 公网。
- 资源：CPU 起步（通用 OCR 走云端，无需本地 GPU）；横向可多副本（无状态）。
- 可观测：`/healthz`/`/readyz` + 结构化日志（`requestId` 贯穿，与后端 trace 关联）+ 识别耗时指标。

---

## 9. 任务分解

> 对齐 roadmap P4-1 六任务，补设计要点与产物；执行时每 Task 展开为逐步 TDD（红→绿→重构）。

1. **ai-service OCR 接口骨架** — FastAPI `/ocr/waybill` + `/healthz`/`/readyz` + `OcrProvider` 抽象 + `MockOcrProvider`（固定/规则字段+置信度）。产物：服务可起、mock 返回稳定结构。验收：接口契约测绿（mock 返回固定字段+置信度）。
2. **接真 OCR Provider** — `RealOcrProvider`（云 OCR SDK + 图片预处理 + 字段抽取 + 归一 + 置信度）；`OCR_PROVIDER` 开关；厂商失败语义（业务失败 vs 5xx）。产物：real 实现（真服务可打桩）。验收：切 real 走真识别、失败返回正确错误语义（集成测打桩）。
3. **后端 OCR 客户端与映射** — `ocr.client`（HTTP + 超时 + 熔断 + 降级）、`ocr-result.mapper`（字段映射/快递归一/置信度分级）、`ocr_recognitions` 表 + RLS、面单图存 `file`。产物：识别记录落库、高/低置信分支。验收：高/低/失败三分支单测绿，跨租户 RLS 隔离。
4. **OCR 辅助入库接口** — `POST /inbound/ocr/recognize`、`/confirm`（复用 `inbound.service.create`）、`/recognize-batch`、`GET .../recognitions`；确认回填 `parcel_id`/`status`。产物：识别→预填→确认入库链路。验收：识别预填 + 人工确认入库链路绿、`confirm` 幂等防重。
5. **前端拍照识别入库** — 入库页「拍照/上传识别」入口、置信度着色回填、可改、确认入库、失败自动回落手动、批量复核视图、`v-perm`。产物：可点通的拍照入库交互。验收：店员可拍照识别后一键入库、低置信高亮核对、失败回落手动可用。
6. **P4-1 e2e 冒烟** — `test/ocr-inbound.e2e-spec.ts`（上传图→识别→入库 STORED；mock/real 开关；失败降级）。验收：OCR 入库链路绿、降级可用、面单图留存可查。

> 隐性验收（贯穿）：新表 `ocr_recognitions` 带 RLS；`confirm` 幂等；OCR 调用经熔断；收尾 e2e；面单图 PII 留存期与私有访问。

---

## 10. 验收标准

- **功能**：拍照/上传面单 → 识别出运单号/手机尾号/快递并预填 → 核对确认 → 入库至 STORED（取件码+库位与既有入库一致）。
- **置信度**：高可信直填、需核对高亮、缺失强制人工；运单号不可信整单标 `LOW_CONFIDENCE`。
- **降级回落**：`OCR_PROVIDER=mock|real` 可切；real 超时/5xx/熔断/不可读时**自动回落手动**，入库不被阻断（核心不变量）。
- **复用一致性**：OCR 入库与手动/扫码入库共用同一入库领域服务，结果（parcel/库位/取件码/`ParcelStored`）一致。
- **留存与合规**：面单图存 MinIO 私有桶、签名访问、有留存期；OCR 只回传/落库手机**后四位**，不沉淀完整号。
- **隔离与权限**：`ocr_recognitions` 经 RLS + 门店 scope；端点受 `inbound:create`/`inbound:ocr` 权限。
- **服务**：ai-service 独立进程可起、`/healthz`/`/readyz` 正常、被后端内网调用、不暴露公网。
- **批量**：连拍可批量识别与复核，高可信卡支持批量确认，逐卡幂等独立入库。
- **测试**：`test/ocr-inbound.e2e-spec.ts` 绿；mapper/置信度分级/降级路径有单测。

---

## 11. 依赖与风险

### 11.1 依赖
- **P1-2**（入库编排复用）、**P3-4**（熔断/降级、file 稳健、配置开关、可观测）、**file**（MinIO 面单图）、ai-service 进程（spec §2.5 已规划）。

### 11.2 风险与缓解
| 风险 | 影响 | 缓解 |
|---|---|---|
| 云 OCR 资质/账号未就绪 | real 无法接入 | mock 全程可交付，real 为开关项；首选与短信同生态厂商降低运维成本 |
| 识别准确率不足（模糊/反光/手写） | 误填、返工 | 置信度分级 + 人工确认兜底 + `ocr_recognitions` 留痕做准确率回归；warnings 提示重拍 |
| 面单 PII 合规（完整手机号/姓名/地址） | 隐私风险 | 只回传/存手机后四位；面单图私有桶+签名访问+留存期清理；识别字段最小化 |
| ai-service 不可用/超时拖慢入库 | 体验下降甚至阻断 | 超时 + 熔断 + 立即回落手动；OCR 永不在入库关键路径上成为强依赖 |
| 跨服务调用一致性/重复确认 | 重复入库 | `recognitionId` 幂等键、`status` 状态约束、`confirm` 防重；ai-service 无状态 |
| 快递公司编码不统一 | 字段脏数据 | 归一到标准编码字典，不在字典内置空交人工选 |
| 厂商锁定 | 迁移成本 | `OcrProvider` 抽象隔离厂商，real 下可挂多实现，开关切换 |
| 批量并发压垮云 OCR 限额 | 限流/失败 | `OCR_BATCH_CONCURRENCY` 限并发 + 熔断 + 失败逐卡回落手动 |
