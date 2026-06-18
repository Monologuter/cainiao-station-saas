# P4-1 OCR 面单识别入库 - 执行级 TDD 计划

> 来源：`P4-1-OCR面单识别入库.md`。本计划把 OCR 设计级任务展开为可提交的纵向 TDD 队列；每个 Task 按红灯测试、最小实现、验证、提交推进。

## 执行范围

- `ai-service/`：FastAPI 服务骨架、OCR provider 抽象、mock/real provider、健康检查。
- `backend/`：`ai`/`inbound` OCR 客户端、识别结果 mapper、`ocr_recognitions` 模型与 RLS、OCR 辅助入库 API、面单图 file 存储接入。
- `station-web/`：入库页拍照/上传识别、置信度回填、失败回落手动、批量复核。
- 验收：`backend/test/ocr-inbound.e2e-spec.ts`、ai-service API 测试、station-web 测试与构建。

## 约束补充

- ai-service 无数据库、无租户业务语义；租户隔离、文件留存、入库状态机全部在 backend。
- OCR 永不阻断入库；低置信/失败/熔断统一回落手动。
- OCR 只回传和落库手机后四位；面单图私有存储并保留 `fileId`。
- 新业务表 `ocr_recognitions` 必须带 `tenant_id`、RLS Policy、`FORCE ROW LEVEL SECURITY`。
- 后端调用 ai-service 必须带 trace/requestId、超时、熔断、降级。

## Task 1：ai-service OCR 骨架

### RED
- ai-service 测试覆盖：
  - `GET /healthz`、`GET /readyz` 返回 ok 与 provider。
  - `POST /ocr/waybill` 上传 mock 图片返回 `waybillNo/phoneTail/courier/overallConfidence/latencyMs`。
  - 缺少 `X-Service-Token` 时拒绝内部调用。

### GREEN
- 初始化 `ai-service/` FastAPI 项目结构：`app/main.py`、`routers/ocr.py`、`providers/ocr_provider.py`、`providers/mock_ocr.py`、测试配置。
- `MockOcrProvider` 从文件名/内容返回稳定字段，默认 provider=`mock`。
- Docker/环境占位：`SERVICE_TOKEN`、`OCR_PROVIDER`。

### 验收
- `cd ai-service && pytest` 绿。
- Commit：`feat(ai-service): add OCR mock API`

## Task 2：ai-service real provider 打桩与降级语义

### RED
- 测试覆盖：
  - `OCR_PROVIDER=tencent` 时 provider factory 选择 real provider。
  - real provider SDK 异常转换为可恢复错误结构或 5xx。
  - 不支持 provider 返回明确错误。

### GREEN
- 新增 `RealOcrProvider` 接口壳与云 OCR adapter seam（本期打桩，不提交真实密钥）。
- provider factory 与 env 切换。
- 统一错误码：`UNREADABLE`、`NO_WAYBILL_FOUND`、`PROVIDER_ERROR`。

### 验收
- `pytest` 绿；mock 默认不依赖真实云账号。
- Commit：`feat(ai-service): add OCR provider switching`

## Task 3：后端 OCR 数据模型与 mapper

### RED
- 迁移/RLS 测试覆盖：
  - `ocr_recognitions` 存在、含 `tenant_id`、RLS + FORCE。
  - tenant A/B 识别记录隔离。
- mapper 单测覆盖：
  - 高置信字段 `RECOGNIZED` + `needReview=false`。
  - 中低置信字段标记需核对。
  - 运单号缺失或 overall 低于阈值为 `LOW_CONFIDENCE`。
  - 失败响应映射为 `FAILED` + 空字段。

### GREEN
- Prisma model/migration：`OcrRecognition` 与 `OcrRecognitionStatus`。
- 新增 `backend/apps/api/src/modules/ai/ocr-result.mapper.ts`。
- RLS policy 与索引。

### 验收
- mapper unit + OCR RLS e2e 绿。
- Commit：`feat(backend): add OCR recognition model`

## Task 4：后端 OCR 客户端与 file 接入

### RED
- 单测覆盖：
  - `OcrClient` 调 ai-service 时带 `X-Service-Token`、requestId、超时。
  - 超时/5xx/熔断打开时返回失败降级结果，不向上抛死。
  - 面单图路径按 `waybills/{tenantId}/{yyyymmdd}/{uuid}` 生成。

### GREEN
- 新增 `modules/ai/ocr.client.ts`，复用 `CircuitBreakerService`。
- 扩展 `file` 存储服务支持面单图 mock 存储/对象 key。
- 配置：`AI_SERVICE_URL`、`AI_SERVICE_TOKEN`、`OCR_TIMEOUT_MS`。

### 验收
- OCR client/file unit 绿；backend build 绿。
- Commit：`feat(backend): add OCR client and waybill storage`

## Task 5：OCR 辅助入库 API

### RED
- e2e 覆盖：
  - `POST /inbound/ocr/recognize` 上传图后创建识别记录并返回预填字段。
  - `POST /inbound/ocr/confirm` 复用既有入库编排，生成 parcel/取件码/库位，识别记录变 `CONFIRMED`。
  - 低置信/失败识别可回落手动。
  - 重复 confirm 同一 `recognitionId` 幂等防重。

### GREEN
- 新增 `InboundOcrController`/`InboundOcrService`。
- 接入权限 `parcel:inbound`，门店 scope 沿用现有用户上下文。
- 批量识别先实现后端逐张循环版。

### 验收
- `backend/test/ocr-inbound.e2e-spec.ts` 绿。
- Commit：`feat(backend): add OCR inbound workflow`

## Task 6：station-web 拍照识别入库

### RED
- 前端测试覆盖：
  - OCR API client multipart 上传。
  - 入库页识别成功回填字段与置信度状态。
  - 失败响应切回手动录入。
  - confirm 成功复用现有入库成功展示。

### GREEN
- 扩展 station-web `inbound` API 与入库页。
- 新增拍照/上传入口、识别中状态、置信度徽标、低置信高亮、失败回落。
- 批量复核实现最小可用卡片列表。

### 验收
- `cd station-web && npm test && npm run build` 绿。
- Commit：`feat(station-web): add OCR inbound flow`

## Task 7：P4-1 联合验收与总控更新

### RED
- `ocr-inbound.e2e-spec.ts` 覆盖完整链路：
  - mock OCR 上传图 → 识别预填 → 人工确认 → parcel STORED。
  - provider 失败/熔断 → 返回手动回落，不阻断普通 `/inbound`。
  - `ocr_recognitions` RLS 隔离。

### GREEN
- 修复跨服务/跨端集成问题。
- 更新 `00-总控计划.md` P4-1 状态。

### 验收
- `cd ai-service && pytest`
- `cd backend && npm run format && npm test -- --runInBand && npm run build && npm run test:e2e -- --runInBand`
- `cd station-web && npm test && npm run build`
- Commit：`docs(plan): 标记 P4-1 OCR 面单识别入库完成`
