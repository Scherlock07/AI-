# ========== Stage 1: 构建前端 ==========
FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json index.html vite.config.ts tailwind.config.js postcss.config.js ./
COPY src/ ./src/
RUN npm run build

# ========== Stage 2: Python 后端 ==========
FROM python:3.12-slim

WORKDIR /app

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./backend/

# 从 Stage 1 复制构建好的前端
COPY --from=frontend-builder /build/dist ./dist

# 切换到后端目录
WORKDIR /app/backend

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
