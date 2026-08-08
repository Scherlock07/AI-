# AI 外语学习辅助平台

基于 AI 的外语学习辅助平台，涵盖听力、口语、阅读、写作、词汇语法、翻译、社区等全场景学习模块。

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Vite + Tailwind CSS + Recharts + Zustand |
| **后端** | FastAPI + SQLAlchemy 2.0 + Pydantic v2 + JWT 认证 |
| **AI 服务** | DeepSeek (OpenAI 兼容接口) + Azure Speech (TTS/STT) |
| **数据库** | SQLite (开发) / PostgreSQL (生产) |
| **部署** | Docker 多阶段构建 + GitHub Actions + Sealos |

## 快速开始

### 方式一：Docker Compose（推荐，一键启动）

```bash
# 1. 克隆仓库
git clone https://github.com/Scherlock07/AI-.git
cd AI-

# 2. 复制环境变量模板
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入你的 API Key

# 3. 一键启动
docker-compose up -d

# 前端: http://localhost:5174
# 后端: http://localhost:8000
# Swagger 文档: http://localhost:8000/docs
```

### 方式二：本地开发（前后端分别启动）

#### 前端

```bash
npm install
npm run dev
# 前端运行在 http://localhost:5174
```

#### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate    # Linux/Mac
# venv\Scripts\activate     # Windows

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key

# 启动服务
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Swagger 文档: http://localhost:8000/docs
```

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|:----:|
| `LLM_API_KEY` | LLM API 密钥（兼容 OpenAI 接口） | 是 |
| `LLM_BASE_URL` | LLM API 地址 | 是 |
| `LLM_MODEL` | 使用的模型名称 | 是 |
| `AZURE_SPEECH_KEY` | Azure 语音服务密钥 | 否（未配置时使用浏览器 TTS 降级） |
| `AZURE_SPEECH_REGION` | Azure 区域 | 否 |
| `DATABASE_URL` | PostgreSQL 连接串（生产环境） | 否 |

> 未配置 `LLM_API_KEY` 时，后端自动返回 Mock 数据，不影响前端开发调试。

## 测试账户

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | student | 123456 |
| 教师 | teacher | 123456 |

## 项目结构

```
AI-/
├── src/                        # 前端源码
│   ├── components/             # 通用组件 (ui/, layout/)
│   ├── pages/                  # 页面组件
│   │   ├── Dashboard.tsx       # 仪表盘
│   │   ├── listening/          # 听力模块
│   │   ├── speaking/           # 口语模块
│   │   ├── reading/            # 阅读模块
│   │   ├── writing/            # 写作模块
│   │   ├── vocabulary/         # 词汇与语法模块
│   │   ├── translation/        # 翻译模块
│   │   ├── community/          # 社区模块
│   │   ├── teacher/            # 教师后台
│   │   └── profile/            # 学习档案
│   ├── api/                    # API 客户端
│   ├── store/                  # Zustand 状态管理
│   ├── contexts/               # React Context (Auth, Toast)
│   └── lib/                    # 工具函数
├── backend/                    # 后端源码
│   ├── app/
│   │   ├── main.py             # FastAPI 入口
│   │   ├── config.py           # 配置管理
│   │   ├── database.py         # 数据库连接
│   │   ├── models/             # SQLAlchemy 数据模型
│   │   ├── routers/            # API 路由 (10 个模块)
│   │   ├── services/           # 业务逻辑 (LLM, Speech, OCR)
│   │   └── schemas/            # Pydantic 数据模型
│   ├── requirements.txt
│   └── .env.example
├── Dockerfile                  # 多阶段构建
├── docker-compose.yml          # 本地开发编排
├── .github/workflows/          # CI/CD
└── package.json
```

## 功能模块

| 模块 | 主要功能 |
|------|---------|
| 听力练习 | 素材库、AI 生成听力材料、精听训练（逐句播放+语速控制） |
| 口语练习 | 课堂评分、Presentation 训练、多人讨论房间、人机对话、复述练习 |
| 阅读练习 | 文章导入、AI 阅读分析（7 项分析维度） |
| 写作练习 | AI 作文批改（6 维度评分+逐句纠错+润色）、写作互评 |
| 词汇语法 | 艾宾浩斯复习、语法练习生成器、词根词缀分析、错题本 |
| 翻译练习 | AI 翻译评分（4 维度） |
| 社区 | 学习小组、讨论广场、排行榜、成就系统 |
| 教师后台 | 学生管理、作业布置、学情分析 |
| 学习档案 | 学习者画像、学习路径推荐、AI 助教 |

## 部署

项目通过 GitHub Actions 自动构建 Docker 镜像并推送到 GHCR，Sealos 拉取部署。

- 公网地址：`https://rpupqofkadhk.cloud.sealos.io`
- 镜像地址：`ghcr.io/scherlock07/ai:latest`

详细部署说明见 [部署文档](./DEPLOYMENT.md)。

## 参与贡献

请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解开发流程、代码规范和提交约定。

## License

MIT
