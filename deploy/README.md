# deploy/ — 部署编排

菜鸟驿站 SaaS 平台的部署用 Docker Compose 编排。设计基线见
`docs/superpowers/specs/设计方案-整合版.md` §12。

## 目录

```
deploy/
├── docker-compose.yml   # 完整部署编排（基础设施 + 应用编排）
├── nginx/nginx.conf     # Nginx 反代占位配置（profile: app）
└── README.md            # 本文件
```

## 编组与端口约定

统一归入独立编组 `name: cainiao-station`，容器名/卷/网络独立，宿主端口全部错开，
**不占用本机 5432 / 6379 / 9000 / 3000**：

| 服务 | 镜像/构建 | 宿主端口 | 容器端口 | profile |
|---|---|---|---|---|
| postgres | postgres:16 | 15432 | 5432 | 默认 |
| redis | redis:7 | 16379 | 6379 | 默认 |
| minio | minio/minio | 19000 / 19001 | 9000 / 9001 | 默认 |
| api | build ../backend | 13100 | 3100 | `app` |
| ai-service | build ../ai-service | 18000 | 8000 | `app` |
| nginx | nginx:1.27-alpine | 18080 | 80 | `app` |

- MinIO 独立 `container_name: cainiao-station-minio` + 独立卷 `cainiao-minio`。
- 与 `backend/docker-compose.yml`（开发栈）共用同一编组名/卷名，端口一致，可平滑切换。

## 启动方式

只起基础设施（可直接运行，应用编排默认不拉起）：

```bash
docker compose -f deploy/docker-compose.yml up -d
```

包含应用编排（api / ai-service / nginx，需各自 Dockerfile 已落地）：

```bash
docker compose -f deploy/docker-compose.yml --profile app up -d --build
```

校验编排语法：

```bash
docker compose -f deploy/docker-compose.yml config -q
```

## 说明

- `api` / `ai-service` / `nginx` 归入 profile `app`，并以 `build context` 指向
  `../backend`、`../ai-service`。这两处的 Dockerfile 尚未落地，故默认 `up` 不会
  拉起它们，避免 build 失败；待 Dockerfile 就绪后用 `--profile app` 启用。
- 环境变量（DB / Redis / MinIO 凭据与 bucket）见 `backend/.env.example`，部署时
  可在 deploy 目录放置同名 `.env` 覆盖默认值。
