# 菜鸟驿站 SaaS · ai-service (FastAPI) 镜像
#
# 构建：  docker build -t cainiao-station/ai-service:latest .
# 运行：  uvicorn app.main:app --host 0.0.0.0 --port 8000
#         env 由 deploy/docker-compose.yml 的 ai-service 服务注入

FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# 先装依赖，命中 layer 缓存
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 拷应用代码
COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
