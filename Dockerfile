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

# 系统依赖：ffmpeg
# 口语模块的录音转写链路依赖它 —— 浏览器 MediaRecorder 产出的是
# audio/webm;codecs=opus（Chrome/Edge/Firefox）或 audio/mp4（Safari），
# 而 Azure Speech SDK 读文件时依赖 GStreamer 解码这些容器，基础镜像里并不具备。
# 统一用 ffmpeg 转成 16kHz 单声道 PCM WAV 再送识别，链路最短也最稳。
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

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
