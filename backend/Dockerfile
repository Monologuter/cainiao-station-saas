# 菜鸟驿站 SaaS · backend (NestJS) 多阶段镜像
#
# 阶段：
#   builder  — node 22 上 npm ci → prisma generate → nest build
#   runner   — 仅装生产依赖 + 拷贝构建产物 + prisma 工件，
#              entrypoint 先跑 `prisma migrate deploy` 再 `node dist/apps/api/src/main.js`
#
# 构建：  docker build -t cainiao-station/api:latest .
# 运行：  由 deploy/docker-compose.yml 的 api 服务注入 env 后拉起

# ---------- 1. builder ----------
FROM node:22-slim AS builder
WORKDIR /app

# prisma engine 在 slim 基础上需要 openssl
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# 先拷依赖清单，命中 layer 缓存
COPY package.json package-lock.json ./
RUN npm ci

# 拷源码并生成 prisma client + 编译
COPY . .
RUN npx prisma generate \
    && npm run build

# 仅保留生产依赖，供 runner 拷贝
RUN npm prune --omit=dev

# ---------- 2. runner ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# 生产依赖（含已 generate 的 @prisma/client）
COPY --from=builder /app/node_modules ./node_modules
# 构建产物
COPY --from=builder /app/dist ./dist
# prisma schema + migrations，供 `migrate deploy` 使用
COPY --from=builder /app/prisma ./prisma
# package.json（npm/prisma 解析需要）
COPY --from=builder /app/package.json ./package.json

# entrypoint：迁移后再启动
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 与 main.ts 默认一致；compose 仍会显式注入 PORT
EXPOSE 3100

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/apps/api/src/main.js"]
