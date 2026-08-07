"""Vercel Serverless Function 入口 — 将 FastAPI 应用暴露为 Vercel 函数"""

import sys
import os

# 将 backend 目录加入 Python 路径
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# 导入 FastAPI 应用（Vercel 会自动检测 ASGI 应用）
from app.main import app
