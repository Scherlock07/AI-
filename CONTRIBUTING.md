# 贡献指南

感谢你参与本项目！请阅读以下内容了解开发流程和规范。

## 开发流程

### 1. Fork & Clone

```bash
# 在 GitHub 上 Fork 本仓库到你自己的账号
# 然后克隆到本地
git clone https://github.com/<你的用户名>/AI-.git
cd AI-

# 添加上游仓库（用于同步更新）
git remote add upstream https://github.com/Scherlock07/AI-.git
```

### 2. 创建分支

**永远不要直接在 `main` 分支上开发。** 每次开发新功能前创建新分支：

```bash
# 同步最新代码
git checkout main
git pull upstream main

# 创建功能分支（命名规范见下方）
git checkout -b feature/口语模块新增录音功能
```

### 分支命名规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feature/` | 新功能 | `feature/add-listening-quiz` |
| `fix/` | Bug 修复 | `fix/login-redirect-error` |
| `refactor/` | 重构 | `refactor/speaking-component` |
| `docs/` | 文档 | `docs/update-readme` |
| `style/` | 样式调整 | `style/mobile-responsive` |
| `chore/` | 构建/配置 | `chore/update-dependencies` |

### 3. 开发 & 提交

```bash
# 提交代码（提交信息规范见下方）
git add .
git commit -m "feat(speaking): 新增录音播放功能"
```

#### Commit 信息规范

格式：`<类型>(<范围>): <描述>`

**类型：**

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `style` | 样式/UI 调整 |
| `docs` | 文档变更 |
| `test` | 测试相关 |
| `chore` | 构建/依赖/配置 |
| `perf` | 性能优化 |

**范围（可选）：** 模块名称，如 `speaking`、`listening`、`auth`、`ui` 等

**示例：**
```
feat(writing): 新增写作互评功能
fix(auth): 修复注册后未自动登录的问题
style(dashboard): 优化移动端响应式布局
refactor(vocabulary): 重构词汇复习逻辑
```

### 4. 推送 & 创建 PR

```bash
# 推送到你的 Fork
git push origin feature/口语模块新增录音功能
```

然后在 GitHub 上创建 Pull Request：

- **目标分支**：`Scherlock07/AI-` 的 `main` 分支
- **PR 标题**：与 commit 信息格式一致
- **PR 描述**：填写模板（见 `.github/pull_request_template.md`）

### 5. Code Review

- 至少需要 1 人 Review 通过后才能合并
- Review 时关注：功能正确性、代码规范、性能、安全性
- 提出修改意见时使用 GitHub 的 `Suggestion` 功能

### 6. 合并 & 清理

```bash
# PR 合并后，同步上游并删除本地分支
git checkout main
git pull upstream main
git branch -d feature/口语模块新增录音功能
```

---

## 代码规范

### 前端 (React + TypeScript)

#### 文件组织

```
src/
├── components/         # 可复用组件
│   ├── ui/            # 基础 UI 组件 (Button, Card, Input 等)
│   └── layout/        # 布局组件 (Layout, Sidebar, Header)
├── pages/             # 页面级组件
├── api/               # API 调用层
├── store/             # 全局状态 (Zustand)
├── contexts/          # React Context
├── lib/               # 工具函数
└── types/             # TypeScript 类型定义
```

#### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `SpeakingModule.tsx` |
| 工具函数 | camelCase | `formatDate.ts` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| CSS 类名 | Tailwind 优先 | `className="flex items-center"` |
| 事件处理 | handle + 动作 | `handleSubmit`, `handleClick` |
| 布尔状态 | is/has + 名词 | `isLoading`, `hasError` |

#### React 规范

```tsx
// ✅ 函数组件 + TypeScript 类型
function SpeakingModule({ moduleId }: SpeakingModuleProps) {
  const [isLoading, setIsLoading] = useState(false)

  // ✅ 事件处理函数以 handle 开头
  const handleSubmit = async () => { ... }

  return <div>...</div>
}

// ❌ 不要用 export default（保持命名导入一致性）
export { SpeakingModule }
```

#### Tailwind CSS 规范

- 优先使用 Tailwind 工具类，不写自定义 CSS
- 响应式断点：`sm:` (640px), `md:` (768px), `lg:` (1024px)
- 移动端优先：先写移动端样式，再用 `sm:`/`lg:` 覆盖

```tsx
// ✅ 移动端优先
<div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3">

// ❌ 不要桌面端优先
<div className="p-6 grid grid-cols-3">
```

### 后端 (FastAPI + Python)

#### 文件组织

```
backend/app/
├── routers/           # API 路由（按模块拆分）
├── services/          # 业务逻辑
├── models/            # SQLAlchemy 数据模型
├── schemas/           # Pydantic 请求/响应模型
└── config.py          # 配置
```

#### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | snake_case | `speaking_service.py` |
| 类名 | PascalCase | `SpeakingService` |
| 函数/变量 | snake_case | `get_speaking_records` |
| 常量 | UPPER_SNAKE | `MAX_TOKENS` |
| API 路径 | kebab-case | `/api/speaking/evaluate` |

#### FastAPI 规范

```python
# ✅ 路由定义
@router.post("/evaluate", response_model=SpeakingEvaluationResult)
async def evaluate_speaking(
    request: SpeakingEvaluationRequest,
    current_user: User = Depends(get_current_user),
):
    """评估口语表达"""
    result = await speaking_service.evaluate(request, current_user)
    return result

# ✅ Service 层处理业务逻辑，Router 层只做参数校验和调用
```

---

## 开发环境检查清单

在提交 PR 前，请确认：

- [ ] 前端 `tsc --noEmit` 无类型错误
- [ ] 前端 `npm run build` 构建成功
- [ ] 后端 Python 代码无语法错误
- [ ] 新增功能在移动端和桌面端均正常显示
- [ ] 没有提交 `.env` 文件或敏感信息
- [ ] commit 信息符合规范
- [ ] PR 描述清晰，关联了相关 Issue

---

## 常见问题

### Q: 没有配置 API Key 怎么开发？

后端在未配置 `LLM_API_KEY` 时会自动返回 Mock 数据，前端可以正常开发 UI 和交互逻辑。

### Q: 如何运行测试？

```bash
# 后端测试
cd backend
python -m pytest

# 前端类型检查
npx tsc --noEmit
```

### Q: 如何更新依赖？

新增前端依赖时，在项目根目录运行 `npm install <package>` 并提交 `package.json` 和 `package-lock.json`。

新增后端依赖时，在 `backend/` 目录运行 `pip install <package>` 并更新 `requirements.txt`：
```bash
pip freeze > requirements.txt
```

### Q: 部署流程是什么？

1. PR 合并到 `main` 分支后，GitHub Actions 自动构建 Docker 镜像
2. 镜像推送到 GHCR (`ghcr.io/scherlock07/ai:latest`)
3. 在 Sealos 控制台点击「重启」拉取最新镜像

详见 [部署文档](./DEPLOYMENT.md)。
