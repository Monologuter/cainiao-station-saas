# 菜鸟驿站 SaaS

多租户驿站管理 SaaS。后端 NestJS（多租户、入库/出库、计费、通知、对账），AI 服务以 FastAPI 独立部署（面单 OCR、智能助手、货架选格、量预测），前端三端分离（驿站工作台、平台管理后台、用户 H5）。

## 架构概览

```
                         ┌──────────────────────────────┐
   用户 H5 (user-app)    │                              │
   驿站工作台 (station-web)│   nginx (18080) 反向代理      │
   平台后台 (admin-web)   │                              │
                         └───────────────┬──────────────┘
                                         │
                         ┌───────────────┴──────────────┐
                         │                              │
                ┌────────▼────────┐          ┌──────────▼─────────┐
                │  backend (api)   │  HTTP    │   ai-service        │
                │  NestJS :3100    ├─────────▶│   FastAPI :8000     │
                │  /api 前缀       │  X-Service-Token            │
                └───┬────┬────┬────┘          └────────────────────┘
                    │    │    │
          ┌─────────▼┐ ┌─▼───┐ ┌▼────────┐
          │ postgres │ │redis│ │ minio   │
          │  :5432   │ │:6379│ │ :9000   │
          └──────────┘ └─────┘ └─────────┘
```

backend 通过 `AI_SERVICE_URL` 调用 ai-service，二者用共享令牌（backend `AI_SERVICE_TOKEN` ↔ ai-service `SERVICE_TOKEN`）做服务间鉴权。

## 子项目清单

| 目录          | 技术栈                                   | 角色                         | 本地 dev 端口 |
| ------------- | ---------------------------------------- | ---------------------------- | ------------- |
| `backend`     | NestJS 10 · Prisma 5 · PostgreSQL · Redis(BullMQ) · MinIO | 业务 API（全局前缀 `/api`）  | 3100          |
| `ai-service`  | FastAPI · uvicorn · Python 3.12          | AI 能力（OCR/助手/选格/预测） | 8000          |
| `station-web` | Vue 3 · Vite 5 · Element Plus · TS       | 驿站工作台                   | 5173          |
| `admin-web`   | Vue 3 · Vite 5 · Element Plus · TS       | 平台管理后台                 | 5174          |
| `user-app`    | uni-app(Vue 3) · Vite · TS               | 用户端 H5                    | 由 uni 分配   |
| `deploy`      | Docker Compose · nginx                   | 生产/单机部署编排            | 见下表        |

## 前置依赖

- Node.js 22（backend / 前端）
- Python 3.12（ai-service）
- Docker + Docker Compose v2（基础设施与一键部署）
- 本机端口 15432 / 16379 / 19000 / 19001 空闲（基础设施宿主映射，已错开默认端口）

## 本地起步顺序

> 所有 `.env.example` 中的密钥均为占位（`CHANGE_ME_*`），首次使用请复制为 `.env` 并填入真实值。

1. **基础设施**（postgres / redis / minio）：

   ```bash
   docker compose -f backend/docker-compose.yml up -d
   ```

2. **backend**：

   ```bash
   cd backend
   cp .env.example .env          # 按需修改密钥
   npm ci
   npx prisma generate
   npx prisma migrate deploy     # 首次建表（或 npx prisma migrate dev）
   npm run start:dev             # 监听 http://localhost:3100/api
   ```

3. **ai-service**：

   ```bash
   cd ai-service
   cp .env.example .env          # mock 模式无需外部密钥
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

4. **前端**（任选其一）：

   ```bash
   cd station-web && npm ci && npm run dev    # :5173
   cd admin-web   && npm ci && npm run dev    # :5174
   cd user-app    && npm ci && npm run dev:h5 # uni-app H5
   ```

## 端口总表

| 服务           | 容器内端口 | 宿主映射（dev compose / 直跑） | deploy compose 宿主映射 |
| -------------- | ---------- | ------------------------------ | ----------------------- |
| backend (api)  | 3100       | 3100（直跑）                   | 13100                   |
| ai-service     | 8000       | 8000（直跑）                   | 18000                   |
| nginx 网关     | 80         | —                              | 18080                   |
| PostgreSQL     | 5432       | 15432                          | 15432                   |
| Redis          | 6379       | 16379                          | 16379                   |
| MinIO S3 API   | 9000       | 19000                          | 19000                   |
| MinIO 控制台   | 9001       | 19001                          | 19001                   |
| station-web    | —          | 5173（vite dev）               | —                       |
| admin-web      | —          | 5174（vite dev）               | —                       |

健康检查端点：backend `GET /api/health/ready`（探 postgres + redis）与 `/api/health/live`；ai-service `GET /readyz` 与 `/healthz`。

## 测试

```bash
cd backend     && npm test          # Jest 单测；npm run test:e2e 跑端到端
cd ai-service  && pytest            # FastAPI / 提供方契约测试
cd station-web && npm test          # Vitest
cd admin-web   && npm test          # Vitest
cd user-app    && npm test          # Vitest
```

## 一键起（Docker Compose）

`deploy/docker-compose.yml` 统一编排基础设施与应用，编组名 `cainiao-station`，宿主端口全部错开。应用服务（api / ai-service / nginx）归在 `app` profile 下，依赖各自 Dockerfile。

```bash
# 1) 准备根级 .env（compose 读取），至少提供必填密钥：
#    JWT_SECRET / AI_SERVICE_TOKEN（缺失会因 ${VAR:?required} 直接报错）
#    建议同时覆盖 MINIO_ROOT_PASSWORD 等弱默认值。

# 2) 仅起基础设施：
docker compose -f deploy/docker-compose.yml up -d

# 3) 起全套（含 api / ai-service / nginx，需先 build 镜像）：
docker compose -f deploy/docker-compose.yml --profile app up -d --build
```

启动顺序由 `healthcheck` + `depends_on: condition: service_healthy` 保证：基础设施 → api（入口先 `prisma migrate deploy` 再启动）/ ai-service 就绪 → nginx。

校验编排文件：

```bash
docker compose -f deploy/docker-compose.yml config -q
docker compose -f backend/docker-compose.yml config -q
```
