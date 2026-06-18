#!/bin/sh
# 容器入口：先把数据库结构对齐到最新 migration，再启动传入的进程（默认 node dist/apps/api/src/main.js）。
# 任一步失败即退出，避免在结构未对齐的库上跑服务。
set -e

echo "[entrypoint] running prisma migrate deploy ..."
npx prisma migrate deploy

echo "[entrypoint] starting: $*"
exec "$@"
