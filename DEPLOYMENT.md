# 部署文档

## 架构概览

```
GitHub (main push)
    ↓
GitHub Actions
    ↓ (多阶段 Docker 构建)
GHCR (ghcr.io/scherlock07/ai:latest)
    ↓ (拉取镜像)
Sealos (Kubernetes)
    ↓
公网访问: https://rpupqofkadhk.cloud.sealos.io
```

## 当前部署配置

| 项目 | 值 |
|------|-----|
| 平台 | Sealos (Kubernetes) |
| 镜像 | `ghcr.io/scherlock07/ai:latest` |
| CPU | 0.5 核 |
| 内存 | 1 GB |
| 端口 | 8000 |
| 数据库 | SQLite（非持久化，Pod 重启后数据清空） |

## CI/CD 流水线

### 自动构建（`.github/workflows/docker-build.yml`）

- **触发条件**：推送到 `main` 分支
- **构建内容**：多阶段 Docker 镜像（Node.js 构建前端 + Python 运行后端）
- **推送目标**：GHCR，打 `latest` 和 commit SHA 两个标签

### CI 检查（`.github/workflows/ci.yml`）

- **触发条件**：所有 PR
- **检查内容**：TypeScript 类型检查 + 前端构建

## 部署步骤

### 首次部署

1. 确保 GitHub 仓库为 Public（Private 需要 GHCR Package 权限配置）
2. 在 Sealos 创建应用，镜像填 `ghcr.io/scherlock07/ai:latest`
3. 配置环境变量：
   - `LLM_API_KEY` - LLM API 密钥
   - `LLM_BASE_URL` - API 地址
   - `LLM_MODEL` - 模型名称
4. 设置端口为 8000
5. 启动应用

### 更新部署

代码合并到 `main` 分支后：

1. GitHub Actions 自动构建新镜像（约 3-5 分钟）
2. 去 Sealos 控制台，点击应用的「重启」按钮
3. Sealos 自动拉取最新镜像并重新部署

### 数据持久化（可选）

当前使用 SQLite，Pod 重启后数据清空。如需持久化：

1. 在 Sealos 控制台创建「存储卷」
2. 挂载到容器的 `/app/backend/data/` 目录
3. 修改后端配置使用该路径的 SQLite 文件

或切换到 PostgreSQL：

1. 在 Sealos 创建 PostgreSQL 实例
2. 设置环境变量 `DATABASE_URL=postgresql+psycopg2://user:password@host:5432/dbname`
3. 重启应用

## 本地 Docker 部署

```bash
# 构建镜像
docker build -t ai-language-platform .

# 运行
docker run -d \
  -p 8000:8000 \
  -e LLM_API_KEY=your-key \
  -e LLM_BASE_URL=https://api.deepseek.com/v1 \
  -e LLM_MODEL=deepseek-chat \
  --name ai-platform \
  ai-language-platform
```

## 回滚

GHCR 保留了每次部署的镜像标签（commit SHA），可回滚到任意版本：

1. 在 GitHub 仓库找到目标 commit SHA
2. 在 Sealos 控制台修改镜像标签为 `ghcr.io/scherlock07/ai:<commit-sha>`
3. 重启应用
