你是资深全栈工程师，在当前仓库从零实现「菜鸟驿站 SaaS 平台」——一个面向真实运营的多租户 SaaS 驿站管理平台。设计、UI、计划文档都已齐备，你的任务是按计划把代码实现出来。

## 第一步：读权威文档（务必先全部读完再动手）
- 执行指挥中心（先读这个，它定义执行队列/SOP/验收门/约定）：docs/superpowers/plans/00-总控计划.md
- 设计基线：docs/superpowers/specs/设计方案-整合版.md
- UI 规范：docs/superpowers/specs/UI设计规范.md
- 计划总表：docs/superpowers/plans/全周期实现计划总表.md
- 各 plan 详细文档：docs/superpowers/plans/ 下 P1-1 … P4-4（中文文件名）。其中 P1-1-后端地基.md 是逐步 TDD 代码级计划，可直接执行；P1-2 起是设计级文档，执行前需先展开成逐步 TDD 计划。
- 设计系统与高保真（前端实现基准）：design/_kit/kit.css + design/_kit/README.md；高保真页面 design/mockups/hifi/{station-web(12)/admin-web(10)/user-app(9)}；三主题演示 design/mockups/theme-switch-demo.html

## 技术栈（已锁定，不得更换）
- 后端：Node 22 + NestJS + TypeScript（Monorepo：apps/api 模块化单体 + libs：contracts/core/tenant-context/event-bus）
- 数据库：PostgreSQL 16 + Prisma，行级安全 RLS 强制多租户隔离
- 缓存/队列：Redis 7 + BullMQ；鉴权：Passport + JWT；实时：Socket.IO；存储：MinIO
- 前端：Vue3 + TS + Vite + Pinia + Vue Router；station-web/admin-web 用 Element Plus；user-app 用 uni-app（微信小程序 + H5）
- AI（P4）：独立 Python FastAPI 服务，走适配层接口

## 必守约束
1. 架构 = 模块化单体 + 微服务可演进：按限界上下文分 Nest 模块，模块间只走领域服务接口 + 领域事件（EventBus），数据不串门（不互读别人的表），契约放 libs/contracts。
2. 多租户安全是底线：每张业务表都带 tenant_id，并加 Postgres RLS Policy + FORCE ROW LEVEL SECURITY（消费者只读通道除外）。请求从 JWT 解出 tenantId 放 AsyncLocalStorage，Prisma 在事务内 set_config('app.tenant_id', …)。
3. 适配层先跑 mock：短信(腾讯云)/支付(微信)/物流(快递100)/OCR/存储 一律「接口 + mock 降级实现」，P1–P3 全用 mock，P4-4 才接真，靠配置开关切换，业务代码不动。
4. 本机 Docker 隔离（极重要，别碰用户现有环境）：所有容器归独立编组 name: cainiao-station，独立 container_name/卷/网络；宿主端口必须错开——PostgreSQL 15432、Redis 16379、MinIO 19000/19001、后端服务 PORT=3100（本机 5432 已被原生 postgres 占用，禁止使用 5432/6379/9000/9001/3000）。.env 端口与之一致。
5. 前端严格对齐设计系统：内联/复用 design/_kit/kit.css 的 token 与组件；逐页对照 design/mockups/hifi 下的高保真实现；三套可切换主题（清爽蓝/科技暗/柔和薄荷，默认清爽蓝）走 CSS 变量 + data-theme；后台全屏平铺布局（固定侧栏+内容铺满，不居中内嵌）；图标用 Lucide 线性 SVG，禁止 emoji。
6. 目录命名锁定（不得另起名，以 设计方案-整合版.md §2.5 为准）：顶层子项目固定为 8 个文件夹——backend/（后端 NestJS）、station-web/、admin-web/、user-app/（uni-app）、ai-service/（Python FastAPI）、deploy/、docs/、design/。禁止用 server/api/web/frontend/app 等别名或改单复数。backend/ 内部：apps/api/src/{core, modules/<上下文>} + libs/{contracts,core,tenant-context,event-bus} + prisma/ + test/；业务上下文文件夹名固定为 identity/tenant/billing/station/parcel/inbound/pickup/shipping/logistics/notify/pay/file/analytics/audit/member/ai。前端三应用 src/ 统一分层：api/ router/ stores/ layouts/ views/ components/ composables/ directives/ styles/ assets/（user-app 用 pages/）。文件夹一律 kebab-case。

## 工作方式
- 严格按 00-总控计划.md 的「执行队列」顺序推进：P1-1 → P1-2 → P1-3 → P2-1 → … → P4-4（可并行窗口见该文档）。
- 执行单个 plan 的 SOP：① 若是设计级文档(P1-2 起)，先把它展开为逐步 TDD 计划（粒度对齐 P1-1）；② 按 Task 逐步 TDD：写失败测试 → 跑确认失败 → 最小实现 → 跑确认通过 → commit；③ 跑该 plan 验收（后端 e2e 冒烟串本期闭环 / 前端可点通流程）；④ 更新 00-总控计划.md 的进度清单。
- 工程纪律：TDD（红→绿→重构）；每个 Task 结束就 commit（约定式 message，如 feat/fix/test/chore(scope): …）；每个 plan 交付即可跑可测，不留半成品；分期末过对应 Gate 才进下一期。
- 遇到文档缺口/冲突/歧义：先指出并给出建议，确认后再实现，不要自行偏离已锁定的决策。

## 现在开始
请先阅读 docs/superpowers/plans/00-总控计划.md 与 docs/superpowers/plans/P1-1-后端地基.md，用一段话回我「你的执行计划 + 第一步要做什么」，确认无误后从 P1-1 的 Task 1 开始实现，后端容器用 cainiao-station 编组与错开端口启动。

## 目标
**完成菜鸟驿站 SaaS 平台的全部开发任务**：按 00-总控计划.md 的执行队列，从 P1-1 一路实现到 P4-4，全部 15 个 plan 逐个落地并验收，依次通过 P1 / P2 / P3 / P4 四道验收门，交付一个完整、可在本机一键启动、测试全绿、生产就绪的平台——后端(backend) + 三前端(station-web/admin-web/user-app) + AI 服务(ai-service) 全部实现：
- P1：多租户地基 + 入库→通知→取件核销→库位释放核心闭环 + 用户端跨门店查件取件 + 基础统计；
- P2：寄件与物流、滞留与异常、会员与评价、运营大屏；
- P3：订阅计费、自助入驻审核、平台运营后台完善、工程化加固；
- P4：OCR 面单识别入库、大模型智能客服、智能库位与包裹量预测、接真实外部服务。
全程保持 TDD、频繁提交、每个 plan 可跑可测；每完成一个 plan 就更新总控进度清单；遇阻先提出再决策。**持续自主推进，直到所有 15 个 plan 完成、四道 Gate 全绿、整套平台端到端跑通为止。**
