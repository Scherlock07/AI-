const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, LevelFormat, PageNumber, PageBreak,
} = require("docx");

// ========== 通用样式 ==========
const FONT = "Microsoft YaHei";
const border = { style: BorderStyle.SINGLE, size: 1, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// 标题颜色
const COLOR_PRIMARY = "4338CA";
const COLOR_SECONDARY = "6B7280";
const COLOR_ACCENT = "059669";

// ========== 辅助函数 ==========
function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, font: FONT, bold: true })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
  });
}

function boldPara(label, value) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label, font: FONT, size: 22, bold: true }),
      new TextRun({ text: value, font: FONT, size: 22 }),
    ],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });
}

function bulletBold(label, value, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: label, font: FONT, size: 22, bold: true }),
      new TextRun({ text: value, font: FONT, size: 22 }),
    ],
  });
}

function makeCell(text, opts = {}) {
  const { width, bold, shading, color, align, fontSize } = opts;
  const cellOpts = {
    borders,
    margins: cellMargins,
    children: [
      new Paragraph({
        alignment: align || AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            font: FONT,
            size: fontSize || 20,
            bold: bold || false,
            color: color || "000000",
          }),
        ],
      }),
    ],
  };
  if (width) {
    cellOpts.width = { size: width, type: WidthType.DXA };
  }
  if (shading) {
    cellOpts.shading = { fill: shading, type: ShadingType.CLEAR };
  }
  return new TableCell(cellOpts);
}

function makeRow(cells, opts = {}) {
  const { isHeader, widths } = opts;
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map((c, i) => {
      const w = widths ? widths[i] : undefined;
      if (typeof c === "string") {
        return makeCell(c, { bold: isHeader, shading: isHeader ? "E0E7FF" : undefined, width: w });
      }
      return makeCell(c.text, { bold: c.bold, shading: c.shading, color: c.color, align: c.align, width: w || c.width });
    }),
  });
}

// ========== 文档内容 ==========
const children = [];

// ===== 封面 =====
children.push(
  new Paragraph({ spacing: { before: 2400 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: "AI 外语学习辅助平台", font: FONT, size: 52, bold: true, color: COLOR_PRIMARY }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({ text: "功能说明与运营预算报告", font: FONT, size: 36, color: COLOR_SECONDARY }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 100 },
    children: [new TextRun({ text: "公网访问地址", font: FONT, size: 22, color: COLOR_SECONDARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({ text: "https://rpupqofkadhk.cloud.sealos.io", font: FONT, size: 24, color: COLOR_PRIMARY, bold: true }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 100 },
    children: [new TextRun({ text: "编制日期：2026 年 8 月 8 日", font: FONT, size: 22, color: COLOR_SECONDARY })],
  }),
  new Paragraph({ children: [new PageBreak()] })
);

// ===== 一、项目概述 =====
children.push(
  heading("一、项目概述"),
  para("AI 外语学习辅助平台是一款面向高校外语教学的综合性在线学习系统，覆盖听力、口语、阅读、写作、翻译、词汇语法六大核心学习模块，并集成社区互动、教师后台管理和学习档案分析等辅助功能。平台以人工智能大语言模型（LLM）为核心引擎，为学习者提供实时、个性化的智能反馈，包括作文自动批改、口语智能评估、阅读深度分析、翻译质量评分、语法练习生成等。"),
  para("平台已部署上线，可通过公网地址访问，支持 24 小时不间断运行，无需本地服务器。"),
  boldPara("技术架构：", "前端 React 18 + TypeScript + Vite + Tailwind CSS；后端 FastAPI + SQLAlchemy + SQLite；AI 引擎 DeepSeek；部署平台 Sealos（容器化）。"),
  boldPara("当前状态：", "已上线运行，全部核心功能可用，AI 接口已接入真实大模型。"),
);

// ===== 二、平台功能清单 =====
children.push(
  heading("二、平台功能清单"),
  para("平台共包含 10 个功能模块、40+ 个 API 接口，具体如下："),
);

// 功能表格
const funcTableWidth = 9360;
const colW = [1800, 2800, 4760];

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: colW,
    rows: [
      makeRow(["模块", "功能", "说明"], { isHeader: true }),
      makeRow([
        { text: "听力模块", bold: true },
        "素材管理 / AI 生成 / 精听训练",
        "支持听力素材浏览与播放；AI 自动生成听力脚本与文本；精听训练支持逐句播放、语速控制、循环模式；词汇发音",
      ]),
      makeRow([
        { text: "口语模块", bold: true },
        "AI 评分 / 发音评估 / 讨论房间",
        "AI 多维度口语评估（流利度/语法/词汇/发音等）；Azure 发音评估；多人讨论房间（含 AI 讨论者）；话题推荐；Presentation 与复述练习",
      ]),
      makeRow([
        { text: "阅读模块", bold: true },
        "文本管理 / AI 深度分析",
        "阅读文本浏览与手动导入；AI 分析（摘要/逻辑结构/长难句解析/文化注释/翻译）；阅读理解练习",
      ]),
      makeRow([
        { text: "写作模块", bold: true },
        "AI 批改 / 同伴互评 / OCR",
        "AI 六维度评分（内容/结构/语法/词汇/连贯/语言质量）+ 逐句纠错 + 润色版 + 总体反馈；同伴互评；手写作文 OCR 识别",
      ]),
      makeRow([
        { text: "词汇与语法", bold: true },
        "智能词汇本 / 语法生成 / 错题本",
        "艾宾浩斯遗忘曲线复习调度；AI 语法练习自动生成；词根词缀分析；错题本与已掌握标记",
      ]),
      makeRow([
        { text: "翻译模块", bold: true },
        "AI 翻译评分",
        "四维度评估（准确性/流畅性/术语/风格）+ 参考译文生成；支持中英双向翻译",
      ]),
      makeRow([
        { text: "社区模块", bold: true },
        "学习小组 / 排行榜 / 成就",
        "创建与加入学习小组；学习积分排行榜；成就系统（学习徽章）；写作互评社区",
      ]),
      makeRow([
        { text: "教师后台", bold: true },
        "班级管理 / 作业 / 评分",
        "创建班级与邀请码管理；布置作业；课堂口语评分（教师权限）；学生成绩查看",
      ]),
      makeRow([
        { text: "学习档案", bold: true },
        "数据分析 / AI 助教 / 路径推荐",
        "学习数据统计与可视化；AI 助教对话（学习建议）；个性化学习路径推荐",
      ]),
      makeRow([
        { text: "认证系统", bold: true },
        "注册 / 登录 / 权限",
        "JWT Token 认证；学生/教师角色权限控制；密码 bcrypt 加密",
      ]),
    ],
  })
);

children.push(
  para(""),
  heading("AI 能力汇总", HeadingLevel.HEADING_2),
  para("平台后端 LLM 服务层集成了以下 9 项 AI 能力，全部通过大语言模型实现："),
);

const aiAbilities = [
  ["写作批改", "六维度评分 + 逐句纠错 + 润色版 + 总体反馈"],
  ["口语评估", "流利度/语法/词汇/发音/内容/交互六维度评分"],
  ["阅读分析", "摘要 + 逻辑结构 + 长难句解析 + 文化注释 + 翻译"],
  ["翻译评分", "准确性/流畅性/术语/风格四维度 + 参考译文"],
  ["语法生成", "根据语法点自动生成练习题与答案解析"],
  ["词根分析", "词根词缀拆解 + 同根词推荐"],
  ["听力脚本", "按主题/难度/口音生成听力素材文本"],
  ["学习路径", "基于学习数据推荐个性化学习路径"],
  ["AI 助教", "自然语言对话，提供学习建议与答疑"],
  ["讨论回复", "AI 讨论者根据对话上下文生成多角度回复"],
];

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: [2200, 7160],
    rows: [
      makeRow(["AI 功能", "实现内容"], { isHeader: true }),
      ...aiAbilities.map(([a, b]) => makeRow([{ text: a, bold: true }, b])),
    ],
  })
);

// ===== 三、部署方案与运维成本 =====
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  heading("三、部署方案与运维成本"),
  heading("3.1 当前部署架构", HeadingLevel.HEADING_2),
  para("平台采用容器化部署方案，整体架构如下："),
  bulletBold("代码托管：", "GitHub 仓库（Scherlock07/AI-）"),
  bulletBold("自动构建：", "GitHub Actions 自动检测代码推送，构建 Docker 镜像并推送到 GitHub Container Registry（GHCR）"),
  bulletBold("容器部署：", "Sealos 云平台拉取 Docker 镜像，运行容器化应用"),
  bulletBold("网络配置：", "Sealos 提供公网 HTTPS 域名，自动配置 SSL 证书"),
  bulletBold("前后端一体化：", "Docker 多阶段构建——Node.js 构建前端静态文件，Python 运行后端并托管前端"),

  heading("3.2 当前资源配置", HeadingLevel.HEADING_2),
);

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: [3120, 6240],
    rows: [
      makeRow(["配置项", "当前值"], { isHeader: true }),
      makeRow(["CPU", "0.5 核"]),
      makeRow(["内存", "1 GB"]),
      makeRow(["存储", "Sealos 默认（非持久）"]),
      makeRow(["端口", "8000"]),
      makeRow(["公网域名", "rpupqofkadhk.cloud.sealos.io"]),
      makeRow(["SSL 证书", "Sealos 自动配置"]),
      makeRow(["部署方式", "Docker 容器（GHCR 镜像）"]),
    ],
  })
);

children.push(
  para(""),
  heading("3.3 长期部署需要的调整", HeadingLevel.HEADING_2),
  para("为确保平台长期稳定运行，以下调整建议按优先级排列："),
  bulletBold("1. 数据持久化（高优先级）：", "当前使用 SQLite 且未挂载持久存储卷，Sealos 重启 Pod 后数据清空。建议在 Sealos 中挂载持久化存储卷，将数据库文件持久保存，确保用户数据不丢失。"),
  bulletBold("2. 数据库迁移（中优先级）：", "当用户量增长到 100+ 时，建议从 SQLite 迁移到 PostgreSQL 或 MySQL，提升并发性能。Sealos 支持一键创建数据库实例。"),
  bulletBold("3. 配置 Azure Speech Key（按需）：", "当前语音功能使用浏览器 Web Speech API 作为降级方案。如需更高质量的 TTS/STT/发音评估，可配置 Azure Speech Service 密钥。"),
  bulletBold("4. 自定义域名（可选）：", "可通过域名备案后绑定自定义域名，提升品牌形象与访问便利性。"),
  bulletBold("5. 资源扩容（按需）：", "当并发用户超过 50 人时，建议将 CPU 扩展至 1 核、内存扩展至 2 GB，确保响应速度。"),
  bulletBold("6. 自动更新流水线（已具备）：", "GitHub Actions 已配置自动构建，修改代码后 push 到 GitHub 即可自动重建镜像，Sealos 重启后自动更新。"),
);

// ===== 五、月度预算明细 =====
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  heading("四、月度预算明细"),
  para("以下预算按不同使用规模分三档估算，所有费用均为人民币："),
);

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [
      makeRow(["费用项目", "小规模（10-30人）", "中等规模（50-100人）", "大规模（200+人）"], { isHeader: true }),
      makeRow([
        { text: "Sealos 云服务器", bold: true },
        "约 10 元/月\n(0.5核/1G)",
        "约 20-30 元/月\n(1核/2G)",
        "约 50-80 元/月\n(2核/4G)",
      ]),
      makeRow([
        { text: "AI API (DeepSeek)", bold: true },
        "约 5-15 元/月",
        "约 30-80 元/月",
        "约 100-300 元/月",
      ]),
      makeRow([
        { text: "Azure Speech", bold: true },
        "0 元（使用浏览器降级）",
        "约 30-50 元/月（按需）",
        "约 50-100 元/月（按需）",
      ]),
      makeRow([
        { text: "域名（可选）", bold: true },
        "0 元（免费二级域名）",
        "约 5-10 元/月",
        "约 5-10 元/月",
      ]),
      makeRow([
        { text: "月度合计", bold: true, color: COLOR_ACCENT },
        { text: "约 15-25 元/月", bold: true, color: COLOR_ACCENT },
        { text: "约 80-170 元/月", bold: true, color: COLOR_ACCENT },
        { text: "约 200-490 元/月", bold: true, color: COLOR_ACCENT },
      ]),
    ],
  })
);

children.push(
  para(""),
  heading("AI API 费用估算依据", HeadingLevel.HEADING_2),
  para("当前使用 DeepSeek（deepseek-chat）模型，采用 OpenAI 兼容接口，按 Token 用量计费。DeepSeek 最新定价参考："),
  bulletBold("deepseek-v4-flash：", "输入 $0.14/百万 tokens，输出 $0.28/百万 tokens（约 1 元 / 2 元 人民币）"),
  bulletBold("deepseek-v4-pro：", "输入 $0.435/百万 tokens，输出 $0.87/百万 tokens（约 3.1 元 / 6.3 元 人民币）"),
  bulletBold("单次调用估算：", "每次 AI 交互平均消耗约 2,000-3,000 输入 tokens + 1,000-2,000 输出 tokens，单次费用约 0.005-0.02 元"),
  bulletBold("小规模（30人/天）：", "假设每人每天 5 次 AI 调用，日均 150 次，月均 4,500 次，AI 费用约 5-15 元/月"),
  bulletBold("中等规模（100人/天）：", "日均 500 次，月均 15,000 次，AI 费用约 30-80 元/月"),
  para("注：DeepSeek 官方已预告将调整 API 定价（引入峰谷定价），实际费用可能随模型版本和定价策略变化。"),
);

// ===== 六、AI API 可替换性说明 =====
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  heading("五、AI API 可替换性说明"),
  para("当前平台使用开发者个人的 DeepSeek API 账户。该 API 完全可以更换为其他服务商的 API，且代码层面无需任何修改。"),

  heading("5.1 技术实现", HeadingLevel.HEADING_2),
  para("平台后端 LLM 服务层采用 OpenAI 兼容接口标准（使用 openai Python 库），通过三个环境变量控制 AI 服务配置："),
);

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: [2340, 2340, 4680],
    rows: [
      makeRow(["环境变量", "当前值", "说明"], { isHeader: true }),
      makeRow(["LLM_API_KEY", "sk-xxxx（个人密钥）", "AI 服务商的 API 密钥"]),
      makeRow(["LLM_BASE_URL", "https://api.deepseek.com/v1", "AI 服务的 API 接口地址"]),
      makeRow(["LLM_MODEL", "deepseek-chat", "调用的模型名称"]),
    ],
  })
);

children.push(
  para(""),
  heading("5.2 可替换的 AI 服务商", HeadingLevel.HEADING_2),
  para("只需修改上述三个环境变量，即可切换到以下任意兼容 OpenAI 接口的 AI 服务商："),
);

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: [1800, 3000, 4560],
    rows: [
      makeRow(["服务商", "模型示例", "说明"], { isHeader: true }),
      makeRow(["DeepSeek", "deepseek-chat / v4-flash / v4-pro", "当前使用，国产模型，性价比高"]),
      makeRow(["阿里通义千问", "qwen-plus / qwen-turbo", "阿里云 DashOpenAI 兼容接口"]),
      makeRow(["百度文心一言", "ernie-bot-4 / ernie-speed", "百度千帆平台，需适配"]),
      makeRow(["OpenAI", "gpt-4o / gpt-4o-mini", "国际主流，需海外网络"]),
      makeRow(["Anthropic", "claude-3-5-sonnet", "需通过兼容层或 SDK 适配"]),
      makeRow(["月之暗面", "moonshot-v1-8k / v1-32k", "Kimi，OpenAI 兼容接口"]),
      makeRow(["智谱 AI", "glm-4 / glm-4-flash", "智谱开放平台，OpenAI 兼容"]),
    ],
  })
);

children.push(
  para(""),
  heading("5.3 更换步骤", HeadingLevel.HEADING_2),
  para("更换 AI 服务商的操作非常简单，无需修改代码，仅需在 Sealos 控制台修改环境变量："),
  bullet("1. 在目标 AI 服务商官网注册账号并获取 API Key"),
  bullet("2. 确认该服务商的 API 接口地址和模型名称"),
  bullet("3. 登录 Sealos 控制台，进入应用详情页"),
  bullet("4. 点击「变更」，修改以下三个环境变量："),
  bullet("   LLM_API_KEY = 新服务商的 API Key", 1),
  bullet("   LLM_BASE_URL = 新服务商的 API 地址", 1),
  bullet("   LLM_MODEL = 新模型名称", 1),
  bullet("5. 保存变更，Sealos 自动重启容器，新 AI 服务立即生效"),
  para(""),
  para("整个过程无需停机维护，用户无感知切换。建议选择 OpenAI 兼容接口的服务商（如通义千问、智谱 AI、月之暗面等），更换最为便捷。"),
);

// ===== 七、后续优化建议 =====
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  heading("六、后续优化建议"),
  para("基于当前平台运行状态，提出以下中长期优化建议："),

  heading("6.1 短期优化（1-3 个月）", HeadingLevel.HEADING_2),
  bulletBold("数据持久化：", "挂载 Sealos 持久存储卷，确保用户数据、学习记录不因容器重启而丢失。"),
  bulletBold("用户反馈收集：", "在平台内嵌入反馈入口，收集师生使用体验与功能需求。"),
  bulletBold("Azure Speech 接入：", "配置 Azure Speech Service 密钥，启用高质量的 TTS 语音合成、STT 语音转写和发音评估功能。"),

  heading("6.2 中期优化（3-6 个月）", HeadingLevel.HEADING_2),
  bulletBold("数据库迁移：", "当用户量超过 100 人时，从 SQLite 迁移到 PostgreSQL，提升并发处理能力。"),
  bulletBold("托福/雅思真题导入：", "开放手动导入端口，支持教师上传真题素材。"),
  bulletBold("移动端适配：", "优化响应式布局，确保手机和平板上的使用体验。"),
  bulletBold("AI 模型升级：", "跟进 DeepSeek V4 或其他更先进的模型，提升 AI 反馈质量。"),

  heading("6.3 长期规划（6-12 个月）", HeadingLevel.HEADING_2),
  bulletBold("多课程支持：", "扩展平台支持德语、法语等其他语种学习。"),
  bulletBold("学习数据分析：", "引入学习行为分析，生成更精准的学习者画像与推荐。"),
  bulletBold("API 成本优化：", "引入请求缓存与 Token 用量监控，优化 AI 调用成本。"),
  bulletBold("高可用部署：", "配置多副本部署与负载均衡，确保高并发下的稳定性。"),
);

// ===== 附录 =====
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  heading("附录：技术栈一览"),
);

children.push(
  new Table({
    width: { size: funcTableWidth, type: WidthType.DXA },
    columnWidths: [2340, 7020],
    rows: [
      makeRow(["类别", "技术 / 工具"], { isHeader: true }),
      makeRow(["前端框架", "React 18 + TypeScript"]),
      makeRow(["构建工具", "Vite 5"]),
      makeRow(["样式方案", "Tailwind CSS 3"],
      ),
      makeRow(["状态管理", "Zustand + React Context"]),
      makeRow(["路由", "React Router DOM 6"]),
      makeRow(["图表库", "Recharts"]),
      makeRow(["后端框架", "FastAPI（Python 3.12）"]),
      makeRow(["ORM", "SQLAlchemy 2.0"]),
      makeRow(["数据库", "SQLite（可迁移 PostgreSQL）"]),
      makeRow(["认证", "JWT + bcrypt"]),
      makeRow(["AI 引擎", "DeepSeek（OpenAI 兼容接口）"]),
      makeRow(["语音服务", "Azure Speech Service（TTS/STT/发音评估）"]),
      makeRow(["OCR 服务", "Tesseract（手写识别）"]),
      makeRow(["部署平台", "Sealos（Kubernetes 容器平台）"]),
      makeRow(["CI/CD", "GitHub Actions + GHCR"]),
      makeRow(["容器化", "Docker 多阶段构建"]),
    ],
  })
);

// ========== 创建文档 ==========
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: "3730A3" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "AI 外语学习辅助平台 — 功能与预算报告", font: FONT, size: 18, color: COLOR_SECONDARY }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "第 ", font: FONT, size: 18, color: COLOR_SECONDARY }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR_SECONDARY }),
                new TextRun({ text: " 页", font: FONT, size: 18, color: COLOR_SECONDARY }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outPath = process.argv[2] || "AI外语学习平台_功能与预算报告.docx";
  fs.writeFileSync(outPath, buffer);
  console.log("DOCX generated: " + outPath);
});
