"""LLM 服务层 — 对接 OpenAI 兼容接口

覆盖功能：
- 写作批改（六维度评分 + 逐句纠错 + 润色）
- 口语评分（基于转写文本的多维度评估）
- 阅读分析（摘要 / 逻辑结构 / 长难句 / 文化注释 / 翻译）
- 翻译评分（四维度 + 参考译文）
- 语法练习生成
- 词根词缀分析
- 听力素材脚本生成
- AI助教对话
"""

import json
import inspect
import httpx
from datetime import datetime
from typing import Any
from app.config import settings
from app.services.llm_cache import cached_json

# 单次 prompt 字符数硬上限（约 15K tokens）。
# 平台所有业务接口正常情况下单次输入都不应超过这个量级，超过即为异常调用，直接拒绝。
MAX_PROMPT_CHARS = 60_000


# 调用链上的包装层函数名，向上追溯业务函数时需要跳过
_WRAPPER_FRAMES = {
    "call_llm", "call_llm_json", "_caller_tag", "safe_json_call",
    "cached_json", "<lambda>", "_generate_listening",
}


def _caller_tag() -> str:
    """向上找到真正调用大模型的业务函数名（跳过缓存/降级等包装层）

    用 f_back 逐层回溯而不是 inspect.stack()，避免每次调用都构建完整调用栈。
    """
    try:
        frame = inspect.currentframe()
        for _ in range(12):
            if frame is None:
                break
            frame = frame.f_back
            if frame is None:
                break
            name = frame.f_code.co_name
            if name not in _WRAPPER_FRAMES:
                return name
    except Exception:
        pass
    return "unknown"


def _log_usage(tag: str, model: str, prompt_chars: int, usage: dict) -> None:
    """记录本次 LLM 调用的 tokens 用量（日志 + SQLite），失败不影响业务"""
    pt = usage.get("prompt_tokens", 0) or 0
    ct = usage.get("completion_tokens", 0) or 0
    hit = usage.get("prompt_cache_hit_tokens", 0) or 0
    miss = usage.get("prompt_cache_miss_tokens", 0) or 0
    print(
        f"[LLM] {tag} | prompt {pt} tok (hit {hit} / miss {miss}) "
        f"| completion {ct} tok | {prompt_chars} chars | model={model}"
    )
    try:
        from app.models.llm_usage import LLMUsageLog
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            db.add(LLMUsageLog(
                tag=tag, model=model, prompt_chars=prompt_chars,
                prompt_tokens=pt, completion_tokens=ct,
                cache_hit_tokens=hit, cache_miss_tokens=miss,
            ))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"[LLM] usage log save failed: {e}")


def _log_failure(tag: str, reason: str) -> None:
    """记录失败的 LLM 调用（tokens 记 0，model 记为 ERROR:原因）

    之前失败的调用不会落库，导致"额度耗尽 / key 失效"这类问题在用量表里完全不可见。
    现在失败同样入库，便于排查与成本归因。
    """
    try:
        from app.models.llm_usage import LLMUsageLog
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            db.add(LLMUsageLog(
                tag=tag, model=f"ERROR:{reason[:40]}", prompt_chars=0,
                prompt_tokens=0, completion_tokens=0,
                cache_hit_tokens=0, cache_miss_tokens=0,
            ))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"[LLM] failure log save failed: {e}")


class LLMBudgetExceeded(RuntimeError):
    """当日 token 预算已用尽（用于触发功能降级，而非直接报错）"""


def _daily_used_tokens() -> int:
    """当日已消耗的 tokens（含输入+输出）"""
    try:
        from app.database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            row = db.execute(text(
                "SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM llm_usage_logs "
                "WHERE created_at >= :start"
            ), {"start": datetime.utcnow().strftime("%Y-%m-%d 00:00:00")}).fetchone()
            return int(row[0]) if row else 0
        finally:
            db.close()
    except Exception as e:
        print(f"[LLM] budget query failed: {e}")
        return 0


def budget_status() -> dict:
    """当前预算使用情况（供运维接口/前端提示使用）"""
    used = _daily_used_tokens()
    budget = settings.DAILY_TOKEN_BUDGET
    return {
        "used_today": used,
        "daily_budget": budget,
        "remaining": max(0, budget - used),
        "percent": round(used / budget * 100, 1) if budget > 0 else 0,
    }


def _budget_ok() -> bool:
    if settings.DAILY_TOKEN_BUDGET <= 0:  # <=0 表示不限
        return True
    return _daily_used_tokens() < settings.DAILY_TOKEN_BUDGET


async def call_llm(messages: list[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
    """调用 LLM (OpenAI 兼容接口)"""
    if not settings.LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY not configured")

    # 防超长 prompt：所有业务接口的正常输入远小于该上限
    prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
    if prompt_chars > MAX_PROMPT_CHARS:
        raise RuntimeError(
            f"AI 请求内容异常（{prompt_chars} 字符，超过 {MAX_PROMPT_CHARS} 上限），已拦截。"
            "如需处理长文本请分段提交。"
        )

    tag = _caller_tag()

    # 预算护栏：超出当日预算时抛出专用异常，由业务层降级为示例结果（功能不中断）
    if not _budget_ok():
        _log_failure(tag, "budget_exceeded")
        raise LLMBudgetExceeded("今日 AI 用量已达预算上限，已切换为示例模式")

    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(f"{settings.LLM_BASE_URL}/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            _log_failure(tag, f"http_{code}")
            if code == 402:
                raise RuntimeError("AI 服务额度已用尽，请联系管理员充值后重试") from e
            if code == 401:
                raise RuntimeError("AI 服务密钥无效，请联系管理员检查配置") from e
            if code == 429:
                raise RuntimeError("AI 服务请求过于频繁，请稍等几秒后重试") from e
            raise RuntimeError(f"AI 服务暂时不可用（HTTP {code}），请稍后重试") from e
        except httpx.RequestError as e:
            _log_failure(tag, "network_error")
            raise RuntimeError("AI 服务网络连接失败，请稍后重试") from e
        data = resp.json()
        _log_usage(tag, str(settings.LLM_MODEL), prompt_chars, data.get("usage", {}))
        return data["choices"][0]["message"]["content"]


async def safe_json_call(
    messages: list[dict],
    mock_factory,
    temperature: float = 0.3,
    max_tokens: int = 4096,
):
    """调用 LLM 并解析 JSON；预算用尽时自动降级为示例结果

    保证在额度耗尽的情况下功能依然可用（返回结构完整的示例数据），
    而不是整站报错。
    """
    try:
        return await call_llm_json(messages, temperature=temperature, max_tokens=max_tokens)
    except LLMBudgetExceeded as e:
        print(f"[LLM] budget exceeded, degrade to mock: {e}")
        return mock_factory()


async def call_llm_json(messages: list[dict], temperature: float = 0.3, max_tokens: int = 4096) -> dict | list:
    """调用 LLM 并解析为 JSON"""
    raw = await call_llm(messages, temperature=temperature, max_tokens=max_tokens)
    # 尝试提取 JSON
    try:
        # 尝试直接解析
        return json.loads(raw)
    except json.JSONDecodeError:
        # 尝试从 markdown 代码块中提取
        if "```json" in raw:
            start = raw.index("```json") + 7
            end = raw.index("```", start)
            return json.loads(raw[start:end])
        elif "```" in raw:
            start = raw.index("```") + 3
            end = raw.index("```", start)
            return json.loads(raw[start:end])
        else:
            # 找第一个 { 或 [ 到最后一个 } 或 ]
            first_brace = raw.find("{")
            first_bracket = raw.find("[")
            if first_brace == -1 and first_bracket == -1:
                raise ValueError(f"LLM 返回内容无法解析为 JSON: {raw[:200]}")
            start = min(x for x in [first_brace, first_bracket] if x != -1)
            if raw[start] == "{":
                end = raw.rfind("}")
            else:
                end = raw.rfind("]")
            return json.loads(raw[start:end+1])


# ========== 写作批改 ==========

_WRITING_SYSTEM = (
    "你是一位资深英语写作教师，拥有丰富的托福/雅思/学术写作教学经验。"
    "请对学生作文进行专业批改，严格按照要求的 JSON 格式输出。"
)


async def _grade_writing_full(content: str, writing_type: str, prompt: str, title: str = "") -> dict:
    """一次性生成全部内容（评分+纠错+润色+拓展词汇）——保留为可回退的完整版"""
    system_msg = _WRITING_SYSTEM
    user_msg = f"""请批改以下{writing_type}类型英语作文。

题目/要求: {prompt}
标题: {title}

作文内容:
{content}

请从以下六个维度评分（每项满分100），并给出详细反馈：
1. Task Achievement (任务完成度)
2. Coherence & Cohesion (连贯与衔接)
3. Lexical Resource (词汇丰富度)
4. Grammatical Range & Accuracy (语法多样性)
5. Content Depth (内容深度)
6. Organization (组织结构)

【反馈质量硬性要求】每个维度的 feedback 禁止空泛套话（如"内容深度不足，建议深化论述"）。
必须做到：①引用学生原文的具体位置（第几段/哪个论点）；②指出具体缺什么（论据？反例？数据？因果链？）；
③给出可直接操作的改法，例如"第二段的论点X缺少支撑，可以补充一个Y方面的例子，写成…"。

同时提供：
- overall_feedback: 总体评价
- revised_version: 润色后的完整作文（【重要】不能只改语言错误，必须实质性提升内容深度：
  补充论证、例子、因果分析或细节，让润色版与原文形成"语言+深度"的对比示范）
- error_details: 逐句错误标注数组 [{{original, corrected, error_type, explanation}}]
- topic_vocabulary: 针对本文主题的拓展词汇板块，8-12个高级词汇/短语
  （学生作文中未使用、但该主题下地道写作者会用的），每项含词汇、中文释义、用法示例

请严格按以下 JSON 格式输出：
{{
  "scores": [
    {{"name": "Task Achievement", "score": 85, "maxScore": 100, "feedback": "..."}},
    {{"name": "Coherence & Cohesion", "score": 80, "maxScore": 100, "feedback": "..."}},
    {{"name": "Lexical Resource", "score": 75, "maxScore": 100, "feedback": "..."}},
    {{"name": "Grammatical Range & Accuracy", "score": 82, "maxScore": 100, "feedback": "..."}},
    {{"name": "Content Depth", "score": 78, "maxScore": 100, "feedback": "..."}},
    {{"name": "Organization", "score": 80, "maxScore": 100, "feedback": "..."}}
  ],
  "overall_score": 80,
  "ai_feedback": "总体评价文本...",
  "revised_version": "润色后的完整作文...",
  "error_details": [
    {{"original": "原句", "corrected": "修改后", "error_type": "grammar", "explanation": "错误说明"}}
  ],
  "topic_vocabulary": [
    {{"term": "词汇或短语", "definition": "中文释义", "example": "地道用法示例句"}}
  ]
}}"""

    return await safe_json_call([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ], lambda: _mock_writing_grade(content))


# ---- 第一段：主批改（评分 + 纠错，不含润色与词汇） ----

_WRITING_CORE_SYSTEM = (
    "你是一位资深英语写作教师，拥有丰富的托福/雅思/学术写作教学经验。"
    "你输出的每一条反馈都必须落到学生作文的具体位置上，禁止空泛套话。"
    "严格按照要求的 JSON 格式输出，不要输出 JSON 之外的任何内容。"
)


async def grade_writing_core(content: str, writing_type: str, prompt: str, title: str = "") -> dict:
    """主批改：六维度评分 + 总体评价 + 逐句纠错

    刻意不含"润色全文"与"拓展词汇"——这两项占了写作批改 60% 以上的输出 token，
    但对"知道哪里错、怎么改"的教学目标边际贡献有限，改为学生按需触发。
    相同作文再次批改时直接复用缓存结果。
    """
    if not settings.LLM_API_KEY:
        return _mock_writing_grade(content)

    user_msg = f"""【任务】批改以下作文
【类型】{writing_type}
【题目】{prompt}
【标题】{title}

【作文原文】
{content}

【评分维度】每项满分 100，必须全部输出且顺序一致：
Task Achievement / Coherence & Cohesion / Lexical Resource / Grammatical Range & Accuracy / Content Depth / Organization

【反馈硬性要求】每个维度的 feedback 必须做到：
① 引用学生原文的具体位置（第几段、哪个论点）；
② 指出具体缺什么（论据？反例？数据？因果链？）；
③ 给出可直接操作的改法（例如"第二段论点X缺少支撑，可补充Y方面的例子，写成…"）。

【输出 JSON】
{{"scores":[{{"name":"Task Achievement","score":85,"maxScore":100,"feedback":"..."}}],"overall_score":82,"ai_feedback":"总体评价文本","error_details":[{{"original":"原句","corrected":"修改后","error_type":"grammar","explanation":"错误说明"}}]}}"""

    result, _hit = await cached_json(
        "grade_writing",
        [writing_type, prompt, title, content],
        lambda: safe_json_call(
            [
                {"role": "system", "content": _WRITING_CORE_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_writing_grade(content),
            max_tokens=2200,
        ),
    )
    return result


# ---- 第二段：按需生成（润色范文 + 拓展词汇） ----

_WRITING_ENHANCE_SYSTEM = (
    "你是一位英语写作润色与词汇教学专家。"
    "你的润色不是修语法，而是示范如何在内容深度与表达质量上提升一个层级。"
    "严格按照要求的 JSON 格式输出，不要输出 JSON 之外的任何内容。"
)


async def generate_writing_enhancement(
    content: str, writing_type: str, prompt: str, weak_dimensions: list[str] | None = None
) -> dict:
    """按需生成"润色范文 + 拓展词汇"（学生点击按钮时才调用，相同作文复用缓存）"""
    if not settings.LLM_API_KEY:
        return _mock_enhance(content)

    word_count = len(content.split())
    weak = "、".join(weak_dimensions) if weak_dimensions else "整体表达"

    user_msg = f"""【任务】为下面这篇作文生成"润色范文"与"拓展词汇"
【类型】{writing_type}
【题目】{prompt}
【本次薄弱维度】{weak}

【作文原文】
{content}

【润色要求】
- 不能只修语言错误，必须实质性提升内容深度：补充论证、例子、因果分析或细节
- 与原文形成"语言 + 深度"的对比示范
- 篇幅与原文相当或略多（原文约 {word_count} 词）

【拓展词汇要求】
- 8-12 个该主题下地道写作者会使用、但原文未使用的高级词汇/短语
- 每项含词汇、中文释义、地道用法示例句

【输出 JSON】
{{"revised_version":"润色后的完整作文","topic_vocabulary":[{{"term":"词汇或短语","definition":"中文释义","example":"地道用法示例句"}}]}}"""

    est_out = int(word_count * 1.7) + 700
    result, _hit = await cached_json(
        "writing_enhance",
        [writing_type, prompt, content],
        lambda: safe_json_call(
            [
                {"role": "system", "content": _WRITING_ENHANCE_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_enhance(content),
            max_tokens=max(1200, min(4000, est_out)),
        ),
        ttl_days=3650,
    )
    return result


async def grade_writing(content: str, writing_type: str, prompt: str, title: str = "") -> dict:
    """写作批改统一入口

    默认（WRITING_LAZY_ENHANCE=true）走两段式：先返回评分与纠错，润色版与拓展词汇按需生成；
    把开关置 false 即恢复为一次性生成全部内容。
    """
    if not settings.WRITING_LAZY_ENHANCE:
        result, _hit = await cached_json(
            "grade_writing",
            [writing_type, prompt, title, content],
            lambda: _grade_writing_full(content, writing_type, prompt, title),
        )
        return result

    core = await grade_writing_core(content, writing_type, prompt, title)
    core.setdefault("revised_version", "")
    core.setdefault("topic_vocabulary", [])
    core["enhance_pending"] = not (core.get("revised_version") or core.get("topic_vocabulary"))
    return core


# ========== 口语评分 ==========

async def evaluate_speaking(transcript: str, topic: str, speaking_type: str, reference_text: str = "") -> dict:
    """AI 口语评估（基于转写文本）"""
    if not settings.LLM_API_KEY:
        return _mock_speaking_eval(topic)
    # 转写过短/为空时直接给出明确反馈，避免"占位文本被当真实作答打超低分"的困惑
    if not transcript or not transcript.strip():
        return {
            "scores": [],
            "overall_score": 0,
            "feedback": "未捕获到有效的语音内容，无法评分。请检查麦克风权限，或尝试在安静环境中更清晰地朗读后再试。",
            "reference_answer": "",
            "transcript_warning": "empty",
        }
    if len(transcript.split()) < 10:
        return {
            "scores": [],
            "overall_score": 0,
            "feedback": f"捕获到的语音内容过短（仅 {len(transcript.split())} 个词）：\"{transcript.strip()[:100]}\"。请重新录制一段更完整的回答（建议不少于 5 句）。",
            "reference_answer": "",
            "transcript_warning": "too_short",
        }
    system_msg = (
        "你是一位资深英语口语考官，擅长评估托福/雅思口语表现。"
        "请基于学生的口语转写文本进行多维度评估。"
    )
    user_msg = f"""请评估以下{speaking_type}类型口语表达。

话题: {topic}
参考文本(如有): {reference_text}

学生口语转写:
{transcript}

请从以下维度评分（每项满分100）：
1. Fluency (流利度) — 语速、停顿、连贯性
2. Pronunciation (发音) — 基于文本推断的音准、重音、语调
3. Vocabulary (词汇) — 用词丰富度与准确性
4. Grammar (语法) — 句式多样性与准确性
5. Content (内容) — 话题展开、逻辑性、论据支撑
6. Interactive Communication (互动交流) — 话题回应能力

【评分要求】每个维度的 feedback 必须包含"扣分点具体说明"：
- 引用学生转写中的原文词句作为证据（如：第三句 "I very like it" 存在副词误用）
- 说明具体失分原因（如：发音维度指出哪些单词可能有重音/元音问题、内容维度指出哪里论据不足）
- 给出可直接执行的改进动作；禁止只写"有待提高"这类空泛评语

请严格按以下 JSON 格式输出：
{{
  "scores": [
    {{"name": "Fluency", "score": 75, "maxScore": 100, "feedback": "具体扣分说明+原文证据+改进动作"}},
    {{"name": "Pronunciation", "score": 70, "maxScore": 100, "feedback": "指出哪些词的发音可能有问题"}},
    {{"name": "Vocabulary", "score": 80, "maxScore": 100, "feedback": "..."}},
    {{"name": "Grammar", "score": 72, "maxScore": 100, "feedback": "引用原文错误句子"}},
    {{"name": "Content", "score": 78, "maxScore": 100, "feedback": "指出哪里展开不足"}},
    {{"name": "Interactive Communication", "score": 75, "maxScore": 100, "feedback": "..."}}
  ],
  "overall_score": 75,
  "feedback": "总体评价（含学生实际说到的内容回顾）...",
  "reference_answer": "参考示范回答..."
}}"""

    result, _hit = await cached_json(
        "evaluate_speaking",
        [speaking_type, topic, reference_text, transcript],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_speaking_eval(topic),
            max_tokens=1800,
        ),
    )
    return result


# ========== 单词分析（阅读上下文） ==========

async def analyze_single_word(word: str, context: str = "") -> dict:
    """AI 分析单个单词（释义、用法、搭配、例句）"""
    if not settings.LLM_API_KEY:
        return _mock_single_word(word)
    system_msg = "你是一位英语词汇教学专家，擅长在阅读上下文中分析单词的含义和用法。"

    user_msg = f"""请分析单词 "{word}"。

{"该单词出现在以下上下文中：" + context[:500] if context else ""}

请严格按 JSON 格式输出：
{{
  "word": "{word}",
  "phonetic": "/fəˈnetɪk/",
  "partOfSpeech": "n./v./adj./adv. 等",
  "definition": "中文释义",
  "definition_en": "English definition",
  "synonyms": ["同义词1", "同义词2"],
  "antonyms": ["反义词1"],
  "collocations": ["常见搭配1", "常见搭配2"],
  "examples": ["英文例句1", "英文例句2"],
  "etymology": "词源简要说明（如有）",
  "difficulty": "CEFR级别 A1-C2",
  "note": "在当前上下文中的特殊含义或用法说明（如有）"
}}"""

    result, _hit = await cached_json(
        "analyze_single_word",
        [word.lower(), context],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_single_word(word),
            max_tokens=1200,
        ),
    )
    return result


# ========== 句子分析（长难句） ==========

async def analyze_single_sentence(sentence: str, difficulty: str = "intermediate") -> dict:
    """AI 分析单个句子（语法结构、翻译、重点词汇）"""
    if not settings.LLM_API_KEY:
        return _mock_single_sentence(sentence)
    system_msg = (
        "你是一位英语语法和阅读教学专家，擅长分析长难句的句法结构并提供翻译。"
        "你对语法术语的区分极为严谨：状语从句必须有从属连词（when/although/because/if等）引导且内含完整主谓结构；"
        "而非谓语结构（现在分词短语、过去分词短语、不定式短语、动名词短语）没有自己的主语和完整谓语。"
        "绝对不能把非谓语结构误判为状语从句。"
    )

    user_msg = f"""请分析以下英语句子（难度: {difficulty}）：

{sentence}

分析时的语法判定规则：
1. 状语从句 = 从属连词(when/while/although/because/if/since/unless等) + 完整主谓结构
2. 分词短语(现在分词/过去分词)、不定式(to do)、动名词短语属于【非谓语结构】，不是从句
3. 判定前先检查引导词：有从属连词才是从句，仅是分词/不定式开头的是非谓语结构作状语/定语/补语
4. 若句子是简单句（只有一个谓语动词），clauses 应为空数组，语法点中说明非谓语成分的作用

请严格按 JSON 格式输出：
{{
  "sentence": "{sentence}",
  "translation": "中文翻译",
  "structure": "句子结构分析（主谓宾、从句类型、非谓语成分等）",
  "clauses": [
    {{
      "type": "主句/定语从句/状语从句/名词性从句/非谓语结构",
      "text": "从句或非谓语结构的原文",
      "function": "在句中的功能说明"
    }}
  ],
  "key_phrases": [
    {{
      "phrase": "重点短语",
      "meaning": "含义"
    }}
  ],
  "grammar_points": ["语法点1", "语法点2"],
  "vocabulary": [
    {{
      "word": "生词",
      "phonetic": "/fəˈnetɪk/",
      "definition": "释义"
    }}
  ],
  "tip": "学习建议或注意事项"
}}"""

    result, _hit = await cached_json(
        "analyze_single_sentence",
        [difficulty, sentence],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_single_sentence(sentence),
            max_tokens=1500,
        ),
    )
    return result


# ========== 阅读分析 ==========

# 阅读分析的三档「分析深度」指令（同一文本按学习者水平输出不同深度的分析）
_READING_DEPTH_GUIDES = {
    "beginner": """【分析深度：初级（概览层）】
- summary：2-3 句话的通俗摘要，避免术语
- key_points：3 条核心要点，每条一句话
- structure：仅一层（主旨 + 各段大意）
- difficult_sentences：最多 1 句，解析用最基础的句法术语（主谓宾），给出直白翻译
- vocabulary：6 个基础高频词/短语，释义用最简单中文
- cultural_notes：最多 1-2 条浅显背景注释""",
    "intermediate": """【分析深度：中级（标准层）】
- summary：3-5 句话摘要，概括论证脉络
- key_points：4-5 条要点，区分论点与论据
- structure：两层（主旨 → 论点 → 论据/例证）
- difficult_sentences：2-3 句，标注从句类型、修饰关系，给出翻译
- vocabulary：10 个四级难度词汇，附音标与例句
- cultural_notes：2-3 条背景注释，说明对理解文意的影响""",
    "advanced": """【分析深度：高级（深度层）】
- summary：5 句以上摘要，最后一句加入批判性视角（论证方式/作者立场评估）
- key_points：5-6 条要点，注明要点之间的逻辑关系（因果/对比/递进）
- structure：三层完整论证链（主旨 → 论点 → 论据 → 细节证据）
- difficult_sentences：3-5 句，除句法外标注修辞手法与逻辑连接词的功能
- vocabulary：12 个以上六级/学术词汇，例句优先取自原文语境
- cultural_notes：3-5 条，包含术语源流与 1-2 个批判性思考问题""",
}


async def analyze_reading(content: str, difficulty: str = "intermediate") -> dict:
    """AI 阅读文本分析（difficulty 为「分析深度」档位：beginner/intermediate/advanced，
    同一文本在不同档位下输出不同深度的分析，而非相同结果）"""
    if not settings.LLM_API_KEY:
        return _mock_reading_analysis(content)
    system_msg = (
        "你是一位英语阅读教学专家，擅长文本分析、长难句解析和文化背景注释。"
        "请对给定文本进行深度分析。"
    )
    depth_guide = _READING_DEPTH_GUIDES.get(difficulty, _READING_DEPTH_GUIDES["intermediate"])
    user_msg = f"""请分析以下英语阅读文本（分析深度档位: {difficulty}）：

{content[:5000]}

{depth_guide}

请提供以下分析，严格按 JSON 格式输出：
{{
  "summary": "文章摘要",
  "key_points": ["要点1", "要点2", "要点3"],
  "structure": [
    {{
      "id": "1",
      "label": "主旨",
      "type": "main-idea",
      "children": [
        {{"id": "1-1", "label": "论点1", "type": "argument", "children": [
          {{"id": "1-1-1", "label": "论据", "type": "evidence"}}
        ]}}
      ]
    }}
  ],
  "difficult_sentences": [
    {{"sentence": "原句", "analysis": "句法分析与翻译"}}
  ],
  "translation": "全文中文翻译",
  "cultural_notes": [
    {{"term": "术语", "explanation": "文化背景解释", "position": {{"start": 0, "end": 10}}}}
  ],
  "vocabulary": [
    {{"word": "单词", "phonetic": "/fəˈnetɪk/", "partOfSpeech": "n.", "definition": "释义", "example": "例句"}}
  ]
}}

【重要】不同分析深度档位的输出必须有明显区分：概览层简明、标准层完整、深度层精细，
不要对同一文本在不同档位输出雷同的分析。"""

    result, _hit = await cached_json(
        "analyze_reading",
        [difficulty, content],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_reading_analysis(content),
            max_tokens=2000,
        ),
    )
    return result


# ========== 翻译评分 ==========

async def grade_translation(source_text: str, user_translation: str, direction: str) -> dict:
    """AI 翻译评分"""
    if not settings.LLM_API_KEY:
        return _mock_translation_grade()
    dir_label = "英译中" if direction == "en-to-zh" else "中译英"
    system_msg = "你是一位资深翻译评估专家，擅长评估学生翻译练习的质量。"

    user_msg = f"""请评估以下{dir_label}翻译练习。

原文:
{source_text}

学生译文:
{user_translation}

请从以下四个维度评分（每项满分100）：
1. Accuracy (准确性) — 原文意思传达是否准确
2. Fluency (流畅度) — 译文是否通顺自然
3. Vocabulary (词汇) — 用词是否恰当
4. Grammar (语法) — 译文语法是否正确

请严格按 JSON 格式输出：
{{
  "scores": [
    {{"name": "Accuracy", "score": 85, "maxScore": 100, "feedback": "..."}},
    {{"name": "Fluency", "score": 80, "maxScore": 100, "feedback": "..."}},
    {{"name": "Vocabulary", "score": 82, "maxScore": 100, "feedback": "..."}},
    {{"name": "Grammar", "score": 78, "maxScore": 100, "feedback": "..."}}
  ],
  "overall_score": 81,
  "reference_translation": "参考译文...",
  "improvement_suggestions": "改进建议...",
  "translation_tips": ["翻译技巧1", "翻译技巧2"]
}}"""

    result, _hit = await cached_json(
        "grade_translation",
        [direction, source_text, user_translation],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            _mock_translation_grade,
            max_tokens=1500,
        ),
    )
    return result


# ========== 语法练习生成 ==========

async def generate_grammar_exercises(grammar_point: str, ex_type: str, difficulty: str, count: int) -> list[dict]:
    """AI 生成语法练习题"""
    if not settings.LLM_API_KEY:
        return _mock_grammar_exercises(grammar_point, ex_type, count)
    system_msg = "你是一位英语语法教学专家，擅长设计针对性语法练习题。"

    type_desc = {
        "fill-blank": "填空题（挖空关键语法部分）",
        "multiple-choice": "选择题（4个选项）",
        "error-correction": "改错题（句子中有1处语法错误）",
        "sentence-transform": "句型转换题",
    }.get(ex_type, "选择题")

    user_msg = f"""请生成 {count} 道英语语法练习题。

语法点: {grammar_point or "综合（覆盖常见语法点）"}
题型: {type_desc}
难度: {difficulty}

请严格按 JSON 数组格式输出：
[
  {{
    "type": "{ex_type}",
    "question": "题目内容",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answer": "正确答案",
    "explanation": "解析说明",
    "grammar_point": "考查语法点"
  }}
]

注意：选择题的 options 必须有4个选项；非选择题的 options 为空数组。"""

    result, _hit = await cached_json(
        "generate_grammar_exercises",
        [grammar_point, ex_type, difficulty, count],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_grammar_exercises(grammar_point, ex_type, count),
            max_tokens=1200,
        ),
    )

    if isinstance(result, list):
        return result[:count]
    return result.get("exercises", [])[:count] if isinstance(result, dict) else []


# ========== 词根词缀分析 ==========

async def analyze_word_root(word: str) -> dict:
    """AI 词根词缀分析"""
    if not settings.LLM_API_KEY:
        return _mock_word_root(word)
    system_msg = "你是一位英语词汇学专家，擅长词根词缀分析和词汇记忆策略。"

    user_msg = f"""请分析单词 "{word}" 的词根词缀结构。

请严格按 JSON 格式输出：
{{
  "word": "{word}",
  "root": "词根",
  "prefix": "前缀（无则为空）",
  "suffix": "后缀（无则为空）",
  "analysis": "详细分析：词根含义 + 前缀/后缀如何改变词义",
  "related_words": ["同词根的相关单词1", "相关单词2", "相关单词3"]
}}"""

    result, _hit = await cached_json(
        "analyze_word_root",
        [word.lower()],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_word_root(word),
            max_tokens=1200,
        ),
    )
    return result


# ========== 听力素材脚本生成 ==========

async def generate_listening_script(topic: str, accent: str, speed: float, difficulty: str, duration: int) -> dict:
    """AI 生成听力素材脚本（duration 单位：秒）"""
    if not settings.LLM_API_KEY:
        return _mock_listening_script(topic)
    system_msg = "你是一位英语听力教材编写专家，擅长设计各难度级别的听力素材。"

    minutes = duration // 60
    seconds = duration % 60
    # 目标字数：正常语速约 140 词/分钟，语速倍率越高同样时长需要的词越多
    target_words = max(40, int(duration / 60 * 140 * max(speed, 0.5)))

    user_msg = f"""请生成一段英语听力素材。

主题: {topic}
口音: {accent} (美式=us, 英式=uk, 澳式=au)
语速: {speed}x
难度: {difficulty}
目标时长: {minutes}分{seconds}秒

【硬性要求】脚本长度必须约为 {target_words} 个英文单词（允许上下浮动15%）。
目标时长完全由字数控制：{minutes}分{seconds}秒 ÷ {speed}x 语速 ≈ {target_words} 词。
请先数好字数再输出，宁可多写不可少写。内容可以是独白（分多个自然段）或多人对话，
确保内容充实、逻辑连贯，能撑满目标时长。

请严格按 JSON 格式输出：
{{
  "title": "素材标题",
  "script": "完整的听力脚本文本（纯对话或独白，约{target_words}词）",
  "vocabulary": [
    {{"word": "生词", "phonetic": "/fəˈnetɪk/", "definition": "中文释义", "example": "例句"}}
  ],
  "difficulty_notes": "难度说明"
}}

注意：脚本内容应自然流畅，符合{accent}口音的英语表达习惯。"""

    # 输出上限按目标字数精确换算（英文 1 词 ≈ 1.5 token），再加 JSON 结构开销
    max_out = max(900, min(4000, int(target_words * 1.6) + 500))

    async def _generate_listening() -> dict:
        result = await safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_listening_script(topic),
            max_tokens=max_out,
        )
        if not isinstance(result, dict):
            return _mock_listening_script(topic)

        script = str(result.get("script", ""))
        actual_words = len(script.split())
        need = target_words - actual_words

        # 字数明显不足时才补写，而且只补差额
        # （原实现是把整段 prompt 重发一遍重新生成，输入输出双翻倍，是最大的一处浪费）
        if 0 < need and actual_words < target_words * 0.5:
            cont_msg = f"""下面是一段英语听力脚本已完成的部分。请【紧接着】续写，不要重复前文内容。

主题: {topic} 口音: {accent} 难度: {difficulty}
已完成内容的结尾片段：
---
{script[-600:]}
---

【要求】续写约 {need} 个英文单词（{difficulty} 难度、{accent} 口音表达习惯），
使全文总词数达到约 {target_words} 词。只输出续写部分。

请严格按 JSON 格式输出：
{{"continuation": "续写内容（纯英文，约{need}词）"}}"""

            try:
                extra = await call_llm_json(
                    [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": cont_msg},
                    ],
                    max_tokens=max(300, min(2500, int(need * 1.6) + 100)),
                )
                if isinstance(extra, dict):
                    addition = str(extra.get("continuation", "")).strip()
                    if addition:
                        result["script"] = script.rstrip() + "\n\n" + addition
            except Exception as e:
                print(f"[LLM] listening top-up skipped: {e}")

        return result

    # 相同参数的听力素材直接复用：同主题同难度重复生成没有任何意义
    result, _hit = await cached_json(
        "generate_listening_script",
        [topic, accent, speed, difficulty, duration],
        _generate_listening,
    )
    return result


# ========== 听力全文要点提取 ==========

async def extract_listening_key_points(script: str, count: int = 8) -> dict:
    """AI 提取听力素材全文要点（供要点提取练习的参考答案）。

    前端旧实现是"逐句截前 8 个词"拼接，不是真正的要点。
    这里让 LLM 通读全文后按语义归纳层次化要点，每条注明对应原文位置。
    """
    if not settings.LLM_API_KEY:
        # 无 key 时退化为按句提取（保持可用）
        sents = [s.strip() for s in script.split(".") if s.strip()]
        points = [s[:80] for s in sents[:count]]
        return {"key_points": points, "summary": ""}

    system_msg = "你是一位英语听力教学专家，擅长归纳听力材料的核心信息层次。"
    user_msg = f"""以下是学生刚听完的一段英语听力素材。请通读全文后，提取全文的核心要点作为"要点提取练习"的参考答案。

听力素材:
---
{script[:6000]}
---

【提取要求】
1. 按全文语义逻辑归纳 {count} 条左右要点（核心论点/关键事实/重要转折/结论），而不是逐句截取
2. 每条要点用中文概括（学生是中文母语的英语学习者），保留关键英文术语/数字
3. 要点之间不重复、按原文出现顺序排列
4. 一句话 summary 概括全文主旨

请严格按 JSON 格式输出：
{{
  "key_points": ["要点1", "要点2", "..."],
  "summary": "一句话主旨概括"
}}"""

    result, _hit = await cached_json(
        "extract_listening_key_points",
        [script, count],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: {"key_points": [], "summary": ""},
            max_tokens=900,
        ),
    )
    if not isinstance(result, dict):
        return {"key_points": [], "summary": ""}
    return result


# ========== 讨论主题推荐 ==========

async def recommend_discussion_topics(category: str, difficulty: str, count: int) -> dict:
    """AI推荐讨论主题"""
    if not settings.LLM_API_KEY:
        return _mock_discussion_topics(category, difficulty, count)

    category_desc = {
        "general": "通用话题（社会、文化、生活等）",
        "technology": "科技与创新",
        "environment": "环境与可持续发展",
        "education": "教育改革与学习方式",
        "society": "社会现象与公共议题",
        "business": "商业与经济",
        "ethics": "伦理与哲学思辨",
    }.get(category, "通用话题")

    difficulty_desc = {
        "beginner": "初级（适合CEFR A2-B1水平，用词简单，论点直接）",
        "intermediate": "中级（适合CEFR B1-B2水平，需要一定论证能力）",
        "advanced": "高级（适合CEFR B2-C1水平，需要深度思辨和复杂表达）",
    }.get(difficulty, "中级")

    system_msg = "你是一位英语讨论话题设计专家，擅长创建引人深思且适合口语练习的讨论主题。"
    user_msg = f"""请推荐 {count} 个英语讨论主题。

话题分类: {category_desc}
难度: {difficulty_desc}

每个主题应包含：
- topic: 英文主题描述（1-2句话，适合作为讨论题目）
- topic_zh: 中文翻译
- stance_for: 正方立场简述
- stance_against: 反方立场简述
- key_vocabulary: 3-5个相关高级词汇
- discussion_points: 2-3个讨论要点提示

请严格按 JSON 格式输出：
{{
  "topics": [
    {{
      "topic": "Should universities prioritize STEM education over humanities in their funding allocation?",
      "topic_zh": "大学是否应该在资金分配上优先考虑STEM教育而非人文学科？",
      "stance_for": "STEM教育直接促进技术创新和经济发展...",
      "stance_against": "人文学科培养批判性思维和文化素养...",
      "key_vocabulary": ["allocate", "prioritize", "innovation", "humanities"],
      "discussion_points": ["短期经济效益vs长期文化影响", "跨学科融合的可能性"]
    }}
  ]
}}"""

    result, _hit = await cached_json(
        "recommend_discussion_topics",
        [category, difficulty, count],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_discussion_topics(category, difficulty, count),
            max_tokens=1500,
        ),
        ttl_days=14,
    )
    return result


# ========== AI 讨论者回复 ==========

async def generate_ai_discussion_reply(
    topic: str,
    ai_name: str,
    ai_persona: str,
    messages: list[dict],
    difficulty: str = "intermediate",
) -> str:
    """生成AI讨论者的回复"""
    if not settings.LLM_API_KEY:
        return _mock_ai_discussion_reply(topic, ai_name, messages)

    difficulty_hint = {
        "beginner": "使用简单句和常见词汇，表达清晰直接。",
        "intermediate": "使用中等复杂度的句式和一定的高级词汇，论证有层次。",
        "advanced": "使用复杂句式、高级词汇和学术表达，论证深入且多角度。",
    }.get(difficulty, "使用中等复杂度的句式和一定的高级词汇。")

    # 构建对话历史
    chat_history = "\n".join([
        f"{m.get('sender_name', 'Unknown')}: {m.get('content', '')}"
        for m in messages[-10:]  # 最多取最近10条
    ])

    persona = ai_persona or f"You are {ai_name}, an English discussion participant who shares thoughtful opinions and engages actively with others' arguments."

    system_msg = f"""You are {ai_name}, participating in an English discussion.
Your persona: {persona}

Discussion topic: {topic}
Language level: {difficulty_hint}

Rules:
1. Respond in English only (this is an English learning platform).
2. Keep your response concise (2-4 sentences, 30-80 words).
3. Express a clear opinion and engage with what others have said.
4. Use vocabulary appropriate for the difficulty level.
5. Be natural, conversational, and thought-provoking.
6. Do not repeat what others have already said — add new perspectives."""

    user_msg = f"""Here is the discussion so far:

{chat_history}

Now it's your turn to speak, {ai_name}. Please provide your response:"""

    return await call_llm([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ], temperature=0.8, max_tokens=200)


# ========== AI 助教对话 ==========

async def chat_with_ai_assistant(user_message: str, context: str = "") -> str:
    """AI 助教对话（语言自适应：英文对话场景用英文回，中文提问用中文回）"""
    if not settings.LLM_API_KEY:
        return f"[Mock模式] 收到你的问题：「{user_message[:100]}」。配置 LLM API Key 后，AI助教将提供专业的英语学习解答。"
    messages = [
        {"role": "system", "content": (
            "你是AI外语学习助教，可以回答英语学习问题、提供学习建议、解释语法点、纠正写作等。"
            "语言规则：请用与用户消息相同的语言回答（用户用英文就用英文答，用中文就用中文答），"
            "英文场景回答必须是地道自然的英文。"
        )},
    ]
    if context:
        messages.append({"role": "system", "content": f"对话上下文: {context}"})
    messages.append({"role": "user", "content": user_message})

    return await call_llm(messages, temperature=0.8)


# ========== 学习路径推荐 ==========

async def recommend_learning_path(ability_radar: list[dict], weak_points: list[str], recent_activities: list[dict]) -> dict:
    """AI 学习路径推荐"""
    if not settings.LLM_API_KEY:
        return _mock_learning_path()
    system_msg = "你是一位个性化学习路径设计专家，基于学习者的能力画像推荐学习计划。"

    user_msg = f"""请基于以下学习者数据推荐个性化学习路径。

能力雷达: {json.dumps(ability_radar, ensure_ascii=False)}
薄弱点: {json.dumps(weak_points, ensure_ascii=False)}
最近活动: {json.dumps(recent_activities[:10], ensure_ascii=False)}

请严格按 JSON 格式输出：
{{
  "diagnosis": "学习者诊断总结",
  "recommended_path": [
    {{
      "module": "writing",
      "priority": "high",
      "action": "建议的具体行动",
      "estimated_time": "30分钟",
      "reason": "推荐理由"
    }}
  ],
  "weekly_plan": {{
    "monday": "周一计划",
    "tuesday": "周二计划",
    "wednesday": "周三计划",
    "thursday": "周四计划",
    "friday": "周五计划",
    "weekend": "周末计划"
  }},
  "tips": ["学习建议1", "学习建议2", "学习建议3"]
}}"""

    result, _hit = await cached_json(
        "recommend_learning_path",
        [ability_radar, weak_points, recent_activities],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            _mock_learning_path,
            max_tokens=1500,
        ),
        ttl_days=1,
    )
    return result


# ========== Mock 数据（无 API Key 时使用） ==========

# ========== 练习内容生成（阅读文本 / 口语话题 / 复述素材 / 写作题目 / 词汇练习） ==========

async def generate_reading_text(topic: str, difficulty: str, length: str = "medium") -> dict:
    """AI 按主题+难度生成阅读文本（难度真正作用于文本本身的词汇与句法复杂度）"""
    if not settings.LLM_API_KEY:
        return _mock_generated_text(topic, difficulty, length)

    length_spec = {
        "short": ("约 150-200 词（2-3 段）", 180),
        "medium": ("约 300-400 词（4-5 段）", 350),
        "long": ("约 500-650 词（6-8 段）", 570),
    }.get(length, ("约 300-400 词（4-5 段）", 350))
    difficulty_spec = {
        "beginner": "高中难度：高频词汇为主，句子平均 12 词以内，无复杂从句嵌套",
        "intermediate": "四级难度：含常见学术词汇，可有一层从句，句式有变化",
        "advanced": "六级/考研难度：学术词汇、多层从句、抽象概念与修辞表达",
    }.get(difficulty, "四级难度：含常见学术词汇，可有一层从句")

    system_msg = "你是一位英语分级读物编写专家，擅长按指定难度编写主题阅读文本。"
    user_msg = f"""请编写一篇英语阅读文本。

主题: {topic}
文本难度: {difficulty_spec}
篇幅: {length_spec[0]}

【要求】
1. 难度要求必须落实到词汇与句法层面（见上方"文本难度"说明）
2. 内容有明确的信息层次与逻辑推进，适合做阅读理解训练
3. source 栏填写虚拟的合理出处风格（如分级读物/科普杂志风格描述）

请严格按 JSON 格式输出：
{{
  "title": "英文标题",
  "content": "完整正文（纯英文，{length_spec[0]}）",
  "source": "建议来源标注（如 Graded Reader - Science）",
  "word_count": 词数,
  "difficulty_notes": "一句话说明该文本的难度特征"
}}"""

    result, _hit = await cached_json(
        "generate_reading_text",
        [topic, difficulty, length],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_generated_text(topic, difficulty, length),
            max_tokens=1500,
        ),
    )
    if isinstance(result, dict) and result.get("content"):
        result.setdefault("word_count", len(str(result.get("content", "")).split()))
    return result


async def generate_speaking_topics(theme: str, difficulty: str, count: int = 3) -> dict:
    """AI 生成口语 Presentation 话题（按主题方向+难度）"""
    if not settings.LLM_API_KEY:
        return _mock_speaking_topics(theme, difficulty, count)

    system_msg = "你是一位英语口语考试命题专家，熟悉托福/雅思口语独立题的命题风格。"
    user_msg = f"""请围绕主题方向生成 {count} 个英语口语 Presentation 话题。

主题方向: {theme}
难度: {difficulty}（初级=日常描述类；中级=观点阐述类；高级=思辨论证类）

【要求】每个话题用一句完整英文题目描述（含作答指引），风格类似雅思 Part 2 / 托福独立口语题。

请严格按 JSON 格式输出：
{{
  "topics": [
    {{"title": "英文题目描述", "category": "分类（科技/人物/经历/社会/文化/教育/环境/其他）", "difficulty": "{difficulty}"}}
  ]
}}"""

    result, _hit = await cached_json(
        "generate_speaking_topics",
        [theme, difficulty, count],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_speaking_topics(theme, difficulty, count),
            max_tokens=700,
        ),
    )
    if not isinstance(result, dict) or not result.get("topics"):
        return _mock_speaking_topics(theme, difficulty, count)
    return result


async def generate_retelling_material(topic: str, length: str = "medium") -> dict:
    """AI 生成复述练习素材（短文/微型讲座文本，供 TTS 播放后复述）"""
    if not settings.LLM_API_KEY:
        return _mock_retelling_material(topic, length)

    length_spec = {
        "short": ("约 90-120 词", 105),
        "medium": ("约 150-200 词", 175),
        "long": ("约 220-280 词", 250),
    }.get(length, ("约 150-200 词", 175))

    system_msg = "你是一位英语听力教材编写专家，擅长编写适合复述训练的短文。"
    user_msg = f"""请编写一段适合「听后复述」训练的英语短文。

主题: {topic}
篇幅: {length_spec[0]}

【要求】
1. 内容有清晰的信息层次（3-5 个要点），便于学生复述时组织
2. 语言难度中等（四级水平），信息密度适中
3. key_points 给出 3-5 条复述时应覆盖的要点（中文概括）

请严格按 JSON 格式输出：
{{
  "title": "素材标题",
  "script": "完整短文（纯英文，{length_spec[0]}）",
  "key_points": ["要点1", "要点2", "要点3"]
}}"""

    result, _hit = await cached_json(
        "generate_retelling_material",
        [topic, length],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_retelling_material(topic, length),
            max_tokens=800,
        ),
    )
    if not isinstance(result, dict) or not result.get("script"):
        return _mock_retelling_material(topic, length)
    return result


async def generate_writing_topics(writing_type: str, theme: str, difficulty: str, count: int = 3) -> dict:
    """AI 生成写作题目（按题型+主题+难度）"""
    if not settings.LLM_API_KEY:
        return _mock_writing_topics(writing_type, theme, difficulty, count)

    type_desc = {
        "chart": "图表作文（雅思 Task 1 风格：描述数据/流程/图表）",
        "argumentative": "议论文（雅思 Task 2 / 考研大作文风格：观点论证）",
        "letter": "书信/应用文（建议信/申请信/投诉信等）",
        "summary": "摘要写作（读后概括）",
    }.get(writing_type, "议论文")

    system_msg = "你是一位英语写作考试命题专家。"
    user_msg = f"""请生成 {count} 个英语写作题目。

题型: {type_desc}
主题方向: {theme}
难度: {difficulty}（初级=结构简单字数要求低；中级=标准考试要求；高级=论证深度与词汇要求高）

【要求】
- 图表作文需在题目中虚拟描述图表内容（数据/趋势）
- 议论文题目要有明确的作答指引与最低字数要求
- instructions 用中文说明写作要求

请严格按 JSON 格式输出：
{{
  "topics": [
    {{"title": "英文题目（含虚拟图表描述或完整题干）", "instructions": "中文写作要求说明", "difficulty": "{difficulty}"}}
  ]
}}"""

    result, _hit = await cached_json(
        "generate_writing_topics",
        [writing_type, theme, difficulty, count],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_writing_topics(writing_type, theme, difficulty, count),
            max_tokens=800,
        ),
    )
    if not isinstance(result, dict) or not result.get("topics"):
        return _mock_writing_topics(writing_type, theme, difficulty, count)
    return result


async def generate_vocab_exercises(script: str, count: int = 6) -> dict:
    """AI 基于文本生成词汇三件套练习：选词填空 / 释义匹配 / 造句

    一次调用生成三种题型的完整数据，前端按题型分别渲染。
    """
    if not settings.LLM_API_KEY:
        return _mock_vocab_exercises(script, count)

    system_msg = "你是一位英语词汇教学专家，擅长基于语料设计词汇练习。"
    user_msg = f"""以下是一段英语文本。请基于文中出现的词汇设计三种词汇练习。

文本:
---
{script[:6000]}
---

【要求】
1. 先选出 {count} 个对学习者最有价值的词汇（优先选文本中的关键动词/名词/形容词）
2. cloze（选词填空）：{count} 题，每题从文本中取一句话挖掉目标词（用 ____ 表示空格），
   options 给 4 个选项（含正确答案），answer 为正确答案
3. matching（释义匹配）：{count} 对 word-definition 配对，definition 用中文
4. sentence_words（造句练习）：从已选词汇中挑 4 个适合造句的词，每个附 hint（中文提示）

请严格按 JSON 格式输出：
{{
  "cloze": [
    {{"sentence": "包含 ____ 的句子（其余部分保持原文）", "options": ["词A", "词B", "词C", "词D"], "answer": "正确词"}}
  ],
  "matching": [
    {{"word": "词汇", "definition": "中文释义"}}
  ],
  "sentence_words": [
    {{"word": "词汇", "hint": "中文造句提示"}}
  ]
}}"""

    result, _hit = await cached_json(
        "generate_vocab_exercises",
        [script, count],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_vocab_exercises(script, count),
            max_tokens=1500,
        ),
    )
    if not isinstance(result, dict):
        return _mock_vocab_exercises(script, count)
    return result


async def grade_sentence(word: str, sentence: str) -> dict:
    """AI 评阅造句练习（用指定词汇造句）"""
    if not settings.LLM_API_KEY:
        return _mock_sentence_grade(word, sentence)

    system_msg = "你是一位英语词汇教学专家，正在批改学生的造句练习。"
    user_msg = f"""学生需要用指定词汇造句。

指定词汇: {word}
学生造句: {sentence}

请从以下方面评阅：
1. 词汇使用是否正确（词义、搭配、词形）
2. 语法是否正确
3. 句子是否自然地道

请严格按 JSON 格式输出：
{{
  "score": 0-100 的整数分数,
  "correct_usage": true/false（词汇用法是否正确）,
  "feedback": "中文点评（指出优点与问题，两三句话）",
  "improved": "如句子有问题，给出改进后的例句；无问题则给出更地道的表达"
}}"""

    result, _hit = await cached_json(
        "grade_sentence",
        [word, sentence],
        lambda: safe_json_call(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_sentence_grade(word, sentence),
            max_tokens=400,
        ),
    )
    if not isinstance(result, dict):
        return _mock_sentence_grade(word, sentence)
    return result


def _mock_generated_text(topic: str, difficulty: str, length: str) -> dict:
    words = 180 if length == "short" else 350 if length == "medium" else 570
    filler = " ".join([f"science research finding number {i} about {topic}" for i in range(60)])
    return {
        "title": f"A Closer Look at {topic.title()}",
        "content": (f"Generated reading text about {topic} (difficulty: {difficulty}). " * 10)[: words * 6] or filler,
        "source": "AI Generated (mock)",
        "word_count": words,
        "difficulty_notes": f"mock 文本（无 LLM key 时降级返回）：{difficulty} 难度示例",
    }


def _mock_speaking_topics(theme: str, difficulty: str, count: int) -> dict:
    return {
        "topics": [
            {"title": f"Describe an experience related to {theme} and explain why it matters to you.", "category": "经历", "difficulty": difficulty},
            {"title": f"Discuss the advantages and disadvantages of {theme}. Support your view with examples.", "category": "观点", "difficulty": difficulty},
            {"title": f"Some people think {theme} has changed modern life for the better, while others disagree. Present your opinion.", "category": "思辨", "difficulty": difficulty},
        ][:count]
    }


def _mock_retelling_material(topic: str, length: str) -> dict:
    return {
        "title": f"Retelling Material: {topic}",
        "script": (f"This is a mock retelling material about {topic}. It contains several key points "
                   "that students should cover in their retelling, including the background, "
                   "the main development, and the conclusion of the topic. "),
        "key_points": [f"关于 {topic} 的背景", "主要发展过程", "结论与影响"],
    }


def _mock_writing_topics(writing_type: str, theme: str, difficulty: str, count: int) -> dict:
    return {
        "topics": [
            {"title": f"Write an essay discussing the impact of {theme} on modern society.", "instructions": "写一篇议论文，阐述你的观点并举例论证。至少 150 词。", "difficulty": difficulty},
            {"title": f"Some people believe {theme} brings more benefits than problems. To what extent do you agree?", "instructions": "议论文，表明立场并论证。至少 200 词。", "difficulty": difficulty},
            {"title": f"Describe how {theme} has changed in the last decade and predict future trends.", "instructions": "说明文，描述变化并预测趋势。至少 150 词。", "difficulty": difficulty},
        ][:count]
    }


def _mock_vocab_exercises(script: str, count: int) -> dict:
    sents = [s.strip() for s in script.split(".") if s.strip()][:count]
    words = [s.split()[0] if s.split() else "word" for s in sents]
    return {
        "cloze": [
            {"sentence": s.replace(w, "____", 1) if w in s else f"The team ____ the project ({w}).",
             "options": [w, "abandon", "delay", "ignore"], "answer": w}
            for s, w in zip(sents, words)
        ],
        "matching": [{"word": w, "definition": "（mock 释义）待配置 LLM key 后自动生成"} for w in words],
        "sentence_words": [{"word": w, "hint": "用这个词造一个与原文语境相关的句子"} for w in words[:4]],
    }


def _mock_sentence_grade(word: str, sentence: str) -> dict:
    used = word.lower() in sentence.lower()
    return {
        "score": 80 if used else 40,
        "correct_usage": used,
        "feedback": ("（mock 评阅）检测到目标词汇已使用。" if used else "（mock 评阅）未检测到目标词汇，请确认造句中使用了指定单词。"),
        "improved": f"Try: The {word} plays an important role in this context.",
    }


def _mock_writing_grade(content: str) -> dict:
    return {
        "scores": [
            {"name": "Task Achievement", "score": 78, "maxScore": 100, "feedback": "文章基本回应了题目要求，但论点展开不够深入。"},
            {"name": "Coherence & Cohesion", "score": 75, "maxScore": 100, "feedback": "段落间有过渡，但衔接手段较为单一。"},
            {"name": "Lexical Resource", "score": 72, "maxScore": 100, "feedback": "词汇量适中，但缺乏高级词汇的使用。"},
            {"name": "Grammatical Range & Accuracy", "score": 80, "maxScore": 100, "feedback": "语法基本正确，句式有一定多样性。"},
            {"name": "Content Depth", "score": 70, "maxScore": 100, "feedback": "论据支持不够充分，建议增加具体例子。"},
            {"name": "Organization", "score": 76, "maxScore": 100, "feedback": "结构清晰，但结论部分可以更有力。"},
        ],
        "overall_score": 75,
        "ai_feedback": "本文整体结构清晰，语法基本正确。主要问题在于论点展开不够深入，缺乏具体例证。建议在论述中加入更多数据或实例来增强说服力。词汇方面可以尝试使用更高级的表达。",
        "revised_version": content + "\n\n[AI润色版将在配置LLM API Key后提供完整润色]",
        "error_details": [
            {"original": "makes communication easier", "corrected": "facilitates communication", "error_type": "vocabulary", "explanation": "建议使用更正式的词汇 facilitate 替代 make...easier"},
        ],
    }


def _mock_enhance(content: str) -> dict:
    """按需增强的示例结果（未配置 API Key 或预算用尽时使用）"""
    base = _mock_writing_grade(content)
    return {
        "revised_version": base.get("revised_version", content),
        "topic_vocabulary": [
            {"term": "facilitate", "definition": "促进，使便利", "example": "Digital tools facilitate communication across borders."},
            {"term": "compelling", "definition": "令人信服的", "example": "The author presents a compelling argument for reform."},
            {"term": "in light of", "definition": "鉴于，根据", "example": "In light of recent findings, the policy needs revision."},
        ],
    }


def _mock_speaking_eval(topic: str) -> dict:
    return {
        "scores": [
            {"name": "Fluency", "score": 72, "maxScore": 100, "feedback": "语速适中，但存在较多停顿。"},
            {"name": "Pronunciation", "score": 70, "maxScore": 100, "feedback": "发音基本清晰，部分元音需注意。"},
            {"name": "Vocabulary", "score": 75, "maxScore": 100, "feedback": "用词较为丰富，但可进一步拓展。"},
            {"name": "Grammar", "score": 68, "maxScore": 100, "feedback": "有几处时态错误和主谓不一致。"},
            {"name": "Content", "score": 78, "maxScore": 100, "feedback": "话题展开较好，逻辑清晰。"},
            {"name": "Interactive Communication", "score": 73, "maxScore": 100, "feedback": "回应较为自然，但互动可更主动。"},
        ],
        "overall_score": 73,
        "feedback": "口语表达整体不错，话题把握较好。建议在流利度和语法准确性上多加练习，减少不必要的停顿。",
        "reference_answer": f"[关于「{topic}」的参考示范回答将在配置LLM API Key后提供]",
    }


def _mock_single_word(word: str) -> dict:
    return {
        "word": word,
        "phonetic": "/mɒk/",
        "partOfSpeech": "n./v./adj.",
        "definition": f"[{word}的中文释义将在配置LLM API Key后提供]",
        "definition_en": f"[English definition for '{word}' will be available after configuring LLM API Key]",
        "synonyms": ["synonym1", "synonym2"],
        "antonyms": ["antonym1"],
        "collocations": ["collocation1", "collocation2"],
        "examples": [f"This is an example sentence using {word}.", f"Another example with {word} in context."],
        "etymology": "",
        "difficulty": "B2",
        "note": "",
    }


def _mock_single_sentence(sentence: str) -> dict:
    return {
        "sentence": sentence,
        "translation": "[句子翻译将在配置LLM API Key后提供]",
        "structure": "[句子结构分析将在配置LLM API Key后提供]",
        "clauses": [],
        "key_phrases": [],
        "grammar_points": [],
        "vocabulary": [],
        "tip": "配置LLM API Key后可获得完整的句子分析。",
    }


def _mock_reading_analysis(content: str) -> dict:
    return {
        "summary": "本文讨论了技术对社会的影响，分析了技术带来的便利和挑战。",
        "key_points": ["技术改变了沟通方式", "技术提高了工作效率", "技术也带来了隐私问题"],
        "structure": [
            {"id": "1", "label": "主旨：技术对社会的双重影响", "type": "main-idea", "children": [
                {"id": "1-1", "label": "积极影响", "type": "argument", "children": [
                    {"id": "1-1-1", "label": "沟通便利", "type": "evidence"},
                    {"id": "1-1-2", "label": "效率提升", "type": "evidence"},
                ]},
                {"id": "1-2", "label": "消极影响", "type": "argument", "children": [
                    {"id": "1-2-1", "label": "隐私问题", "type": "evidence"},
                ]},
            ]},
        ],
        "difficult_sentences": [
            {"sentence": content[:100] if len(content) > 100 else content, "analysis": "此句为复合句，主句+定语从句结构。翻译时需注意从句的语序调整。"},
        ],
        "translation": "[全文翻译将在配置LLM API Key后提供]",
        "cultural_notes": [],
        "vocabulary": [
            {"word": "technology", "phonetic": "/tekˈnɒlədʒi/", "partOfSpeech": "n.", "definition": "技术", "example": "Technology has changed our lives."},
        ],
    }


def _mock_translation_grade() -> dict:
    return {
        "scores": [
            {"name": "Accuracy", "score": 80, "maxScore": 100, "feedback": "原文意思基本传达准确。"},
            {"name": "Fluency", "score": 75, "maxScore": 100, "feedback": "译文较为通顺，但部分表达略显生硬。"},
            {"name": "Vocabulary", "score": 78, "maxScore": 100, "feedback": "用词恰当，但可更精准。"},
            {"name": "Grammar", "score": 82, "maxScore": 100, "feedback": "语法基本正确。"},
        ],
        "overall_score": 79,
        "reference_translation": "[参考译文将在配置LLM API Key后提供]",
        "improvement_suggestions": "建议在翻译时注意目标语言的表达习惯，适当调整语序。",
        "translation_tips": ["注意中英文语序差异", "专业术语需统一翻译"],
    }


def _mock_grammar_exercises(grammar_point: str, ex_type: str, count: int) -> list[dict]:
    samples = [
        {"type": ex_type, "question": "She _____ to school every day.", "options": ["walk", "walks", "walking", "is walking"], "answer": "walks", "explanation": "第三人称单数一般现在时动词加-s", "grammar_point": grammar_point or "一般现在时"},
        {"type": ex_type, "question": "The book _____ by the author last year.", "options": ["wrote", "was written", "is written", "writes"], "answer": "was written", "explanation": "被动语态，过去时", "grammar_point": grammar_point or "被动语态"},
        {"type": ex_type, "question": "If I _____ rich, I would travel the world.", "options": ["am", "was", "were", "be"], "answer": "were", "explanation": "虚拟语气，与现在事实相反用were", "grammar_point": grammar_point or "虚拟语气"},
        {"type": ex_type, "question": "He is the man _____ car was stolen.", "options": ["who", "which", "whose", "that"], "answer": "whose", "explanation": "关系代词whose表所属关系", "grammar_point": grammar_point or "定语从句"},
        {"type": ex_type, "question": "Neither the teacher nor the students _____ aware of the change.", "options": ["was", "were", "is", "has been"], "answer": "were", "explanation": "neither...nor就近原则，students是复数", "grammar_point": grammar_point or "主谓一致"},
    ]
    return samples[:count]


def _mock_word_root(word: str) -> dict:
    return {
        "word": word,
        "root": "示例词根",
        "prefix": "",
        "suffix": "",
        "analysis": f"「{word}」的词根词缀分析将在配置LLM API Key后提供详细内容。",
        "related_words": ["related_word_1", "related_word_2", "related_word_3"],
    }


def _mock_listening_script(topic: str) -> dict:
    return {
        "title": f"{topic} - AI Generated (Mock)",
        "script": f"Welcome to today's program about {topic}. In this episode, we will explore various aspects of this fascinating topic. Let's begin our discussion.\n\n[完整听力脚本将在配置LLM API Key后生成]",
        "vocabulary": [
            {"word": "explore", "phonetic": "/ɪkˈsplɔː/", "definition": "探索", "example": "Let's explore this topic together."},
        ],
        "difficulty_notes": "Mock 模式 - 配置 LLM API Key 后生成真实内容",
    }


def _mock_learning_path() -> dict:
    return {
        "diagnosis": "学习者整体能力中等偏上，写作和口语是薄弱环节，需要重点提升。",
        "recommended_path": [
            {"module": "writing", "priority": "high", "action": "完成2篇议论文写作练习", "estimated_time": "60分钟", "reason": "写作得分偏低，需加强练习"},
            {"module": "speaking", "priority": "high", "action": "进行3次人机对话练习", "estimated_time": "30分钟", "reason": "口语流利度有待提升"},
            {"module": "vocabulary", "priority": "medium", "action": "复习15个待复习单词", "estimated_time": "20分钟", "reason": "艾宾浩斯复习计划"},
        ],
        "weekly_plan": {
            "monday": "写作练习（议论文1篇）+ 词汇复习",
            "tuesday": "口语练习（人机对话2次）",
            "wednesday": "阅读分析（1篇长文）+ 语法练习",
            "thursday": "听力训练（精听1篇）+ 词汇复习",
            "friday": "写作练习（图表分析1篇）+ 翻译练习",
            "weekend": "综合复习 + 错题回顾",
        },
        "tips": ["每天保持至少30分钟的学习时间", "写作后及时查看AI批改反馈", "口语练习时注意录音并回听"],
    }


def _mock_discussion_topics(category: str, difficulty: str, count: int) -> dict:
    samples = [
        {
            "topic": "Should social media platforms be held legally responsible for the spread of misinformation?",
            "topic_zh": "社交媒体平台是否应该对虚假信息的传播承担法律责任？",
            "stance_for": "平台有责任审核内容，防止虚假信息危害社会。",
            "stance_against": "过度监管会侵犯言论自由，且难以界定 misinformation 的边界。",
            "key_vocabulary": ["misinformation", "accountability", "regulation", "censorship"],
            "discussion_points": ["言论自由vs社会责任", "技术审核的可行性与局限"],
        },
        {
            "topic": "Is remote learning as effective as traditional classroom education?",
            "topic_zh": "远程学习是否和传统课堂教育一样有效？",
            "stance_for": "远程学习提供灵活性和可及性，技术工具可以增强学习体验。",
            "stance_against": "缺乏面对面互动和社交学习环境，影响学习深度。",
            "key_vocabulary": ["effectiveness", "accessibility", "interaction", "engagement"],
            "discussion_points": ["自律能力的影响", "社交技能的培养"],
        },
        {
            "topic": "Should governments invest more in space exploration or in solving Earth's problems first?",
            "topic_zh": "政府应该更多投资太空探索还是优先解决地球上的问题？",
            "stance_for": "太空探索推动科技创新，长期来看造福人类。",
            "stance_against": "地球面临气候、贫困等紧迫问题，应优先解决。",
            "key_vocabulary": ["exploration", "investment", "innovation", "prioritization"],
            "discussion_points": ["短期vs长期收益", "科技创新的溢出效应"],
        },
        {
            "topic": "Should AI-generated content be required to carry a disclosure label?",
            "topic_zh": "AI生成的内容是否应该被要求标注？",
            "stance_for": "标注有助于透明度和知情权，防止欺骗。",
            "stance_against": "过度标注可能造成歧视，且技术上难以实现。",
            "key_vocabulary": ["disclosure", "transparency", "authenticity", "regulation"],
            "discussion_points": ["技术可行性", "创作自由vs公众知情权"],
        },
        {
            "topic": "Does social media strengthen or weaken real-world relationships?",
            "topic_zh": "社交媒体是增强还是削弱了现实世界的人际关系？",
            "stance_for": "社交媒体让我们保持联系，跨越地理障碍。",
            "stance_against": "表面化的互动取代了深度的面对面交流。",
            "key_vocabulary": ["superficial", "authentic", "connection", "isolation"],
            "discussion_points": ["互动质量vs数量", "FOMO现象的影响"],
        },
        {
            "topic": "Should universities abolish standardized testing for admissions?",
            "topic_zh": "大学是否应该取消标准化考试作为录取标准？",
            "stance_for": "标准化考试存在偏见，不能全面衡量学生能力。",
            "stance_against": "考试提供客观可比的评估标准，保障公平性。",
            "key_vocabulary": ["abolish", "standardized", "admissions", "equity"],
            "discussion_points": ["评估的客观性vs全面性", "教育公平的实现路径"],
        },
    ]
    return {"topics": samples[:count]}


def _mock_ai_discussion_reply(topic: str, ai_name: str, messages: list[dict]) -> str:
    import random
    replies = [
        f"That's an interesting point. I'd add that we also need to consider the long-term implications of this issue on society as a whole.",
        f"I partially agree, but I think we're overlooking the economic factors at play here. What about the impact on smaller communities?",
        f"While I see your perspective, I'd argue that the opposite view also has merit. We should examine both sides more carefully.",
        f"That raises a crucial question. In my view, the key is finding a balance between regulation and personal freedom.",
        f"I'd push back on that slightly. The evidence suggests that a more nuanced approach would be more effective in practice.",
    ]
    return random.choice(replies)


# ========== 班级学情分析报告 ==========

_ANALYSIS_REPORT_SYSTEM = (
    "你是一位外语教学教研专家，擅长基于班级真实学习数据撰写学情分析报告。"
    "你的报告必须严格基于给定的数据，不得编造任何未提供的数据或事实。"
    "若某模块数据缺失，应明确指出「该模块暂无数据」，而不是推测。"
    "建议必须具体可执行，避免「加强练习」这类空泛表述。"
    "严格按照要求的 JSON 格式输出，不要输出 JSON 之外的任何内容。"
)


def _build_class_data_digest(overview: dict) -> str:
    """把班级学情数据压缩成给 LLM 的文本摘要（控制 token）"""
    s = overview.get("summary", {})
    lines = [
        "【班级概况】",
        "班级名称：%s" % overview.get("class_name", ""),
        "统计周期：近 %d 天" % overview.get("period_days", 30),
        "学生总数：%d 人（其中有练习记录 %d 人）" % (
            overview.get("student_count", 0), overview.get("active_student_count", 0)),
        "班级综合均分：%.1f" % s.get("class_avg", 0),
        "累计练习时长：%d 分钟；人均 %.1f 分钟" % (
            s.get("total_time", 0), s.get("avg_time_per_student", 0)),
        "累计练习次数：%d 次" % s.get("total_exercises", 0),
        "已布置作业：%d 项" % s.get("assignment_count", 0),
        "",
        "【各模块均分与投入】",
    ]
    for m in overview.get("module_scores", []):
        lines.append("%s：均分 %.1f，累计 %d 分钟，%d 次练习" % (
            m.get("label", m.get("module")), m.get("avg_score", 0),
            m.get("study_time", 0), m.get("exercise_count", 0)))

    lines.append("")
    lines.append("【成绩分布】")
    for b in overview.get("score_bands", []):
        lines.append("%s：%d 人" % (b.get("band"), b.get("count")))

    weak = overview.get("class_weak_modules", [])
    lines.append("")
    if weak:
        lines.append("【班级共性薄弱模块（均分<70）】")
        for w in weak:
            lines.append("%s：均分 %.1f" % (w.get("label"), w.get("avg_score", 0)))
    else:
        lines.append("【班级共性薄弱模块】无（各模块均分均≥70 或数据不足）")

    att = overview.get("need_attention", [])
    lines.append("")
    lines.append("【需重点关注学生】共 %d 人" % len(att))
    for a in att[:10]:
        lines.append("- %s：均分 %.1f，时长 %d 分钟；原因：%s" % (
            a.get("name"), a.get("overall_avg", 0), a.get("total_time", 0),
            "；".join(a.get("reasons", []))))

    top = overview.get("top_students", [])
    lines.append("")
    if top:
        lines.append("【表现优秀学生】共 %d 人" % len(top))
        for t in top[:6]:
            lines.append("- %s：均分 %.1f" % (t.get("name"), t.get("overall_avg", 0)))
    else:
        lines.append("【表现优秀学生】无（暂无均分≥85 的学生）")

    # 学生个体薄弱模块明细（取前 12 人，用于生成个体建议）
    students = overview.get("students", [])
    if students:
        lines.append("")
        lines.append("【学生个体情况（前12人）】")
        for p in students[:12]:
            weaks = "、".join("%s(%.1f)" % (w["label"], w["avg_score"]) for w in p.get("weak_modules", []))
            lines.append("- %s：综合 %.1f，时长 %d 分钟，薄弱：%s" % (
                p.get("name"), p.get("summary", {}).get("overall_avg", 0),
                p.get("summary", {}).get("total_time", 0),
                weaks or "无明显薄弱模块"))
    return "\n".join(lines)


async def generate_class_analysis_report(overview: dict, focus: str = "") -> dict:
    """基于班级真实学情数据生成针对性分析报告"""
    digest = _build_class_data_digest(overview)

    if not settings.LLM_API_KEY:
        return _mock_class_report(overview)

    focus_line = "【本次重点关注方向】%s\n\n" % focus if focus.strip() else ""

    user_msg = f"""{focus_line}以下是班级真实学习数据（请严格基于这些数据撰写，不得编造）：

{digest}

【报告要求】
1. 总体诊断：基于综合均分、活跃度、练习量，判断班级整体学情水平与主要特征；
2. 模块分析：逐一点评各模块表现，指出班级共性薄弱环节，并说明数据依据（引用具体均分）；
3. 学生分层：根据成绩分布与个体数据，把学生分为需要重点关注 / 稳步提升 / 表现优秀三类，每类给出代表性学生与判断依据；
4. 针对性教学建议：针对第 2、3 步发现的问题，给出 3-5 条具体可落地的教学干预措施（说明针对谁、解决什么问题、如何操作）；
5. 后续跟进重点：指出下一周期应重点观察的指标。

【输出 JSON】
{{"overall_diagnosis":"总体诊断文本（150-250字）",
"module_analysis":[{{"module":"听力","status":"良好/待提升/无数据","analysis":"该模块分析（80-150字，须引用具体数据）"}}],
"student_layering":{{"attention":{{"summary":"该层次整体特征","students":["姓名1","姓名2"],"actions":"针对该层次的干预建议"}},
"improving":{{"summary":"...","students":["..."],"actions":"..."}},
"excellent":{{"summary":"...","students":["..."],"actions":"..."}}}},
"teaching_suggestions":[{{"title":"建议标题","problem":"对应的问题（引用数据）","action":"具体操作步骤","target":"适用对象","priority":"高/中/低"}}],
"follow_up_metrics":["下一周期重点观察指标1","指标2"],
"data_notes":["数据说明或局限性，如某些模块样本不足"]}}"""

    result, _hit = await cached_json(
        "class_analysis_report",
        [overview.get("class_id", ""), str(overview.get("period_days", 30)), focus,
         str(overview.get("summary", {})), str(overview.get("score_bands", []))],
        lambda: safe_json_call(
            [
                {"role": "system", "content": _ANALYSIS_REPORT_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            lambda: _mock_class_report(overview),
            max_tokens=3000,
        ),
    )
    return result


def _mock_class_report(overview: dict) -> dict:
    """无 API key 时的降级报告：仍基于真实数据，但用规则模板组织"""
    s = overview.get("summary", {})
    class_avg = s.get("class_avg", 0)
    weak = overview.get("class_weak_modules", [])
    att = overview.get("need_attention", [])
    top = overview.get("top_students", [])
    total = overview.get("student_count", 0)
    active = overview.get("active_student_count", 0)

    if class_avg >= 85:
        level_desc = "班级整体表现优秀"
    elif class_avg >= 70:
        level_desc = "班级整体处于良好水平"
    elif class_avg >= 60:
        level_desc = "班级整体处于及格水平，仍有较大提升空间"
    elif class_avg > 0:
        level_desc = "班级整体成绩偏低，亟需重点干预"
    else:
        level_desc = "班级暂无有效练习数据，无法进行水平评估"

    overall = (
        "近 %d 天内，本班共 %d 名学生，其中 %d 人有练习记录，班级综合均分 %.1f，%s。"
        "累计练习时长 %d 分钟，人均 %.1f 分钟，累计完成练习 %d 次。%s"
        % (
            overview.get("period_days", 30), total, active, class_avg, level_desc,
            s.get("total_time", 0), s.get("avg_time_per_student", 0),
            s.get("total_exercises", 0),
            "需重点关注的学生共 %d 人。" % len(att) if att else "全体学生均无明显预警。",
        )
    )

    module_analysis = []
    for m in overview.get("module_scores", []):
        avg = m.get("avg_score", 0)
        if avg <= 0:
            status = "无数据"
            analysis = "%s模块在当前周期内没有产生评分数据，可能是学生尚未开展该模块练习，或练习未形成有效评分。建议先确认学生是否知晓该模块的入口。" % m.get("label")
        elif avg >= 85:
            status = "优秀"
            analysis = "%s模块均分 %.1f，处于优秀水平，累计投入 %d 分钟、%d 次练习。该模块可作为班级的优势项目保持。" % (
                m.get("label"), avg, m.get("study_time", 0), m.get("exercise_count", 0))
        elif avg >= 70:
            status = "良好"
            analysis = "%s模块均分 %.1f，表现良好，累计投入 %d 分钟。仍有提升空间，可通过增加练习频次巩固。" % (
                m.get("label"), avg, m.get("study_time", 0))
        else:
            status = "待提升"
            analysis = "%s模块均分仅 %.1f，明显低于合格线，是班级的共性薄弱环节。累计投入 %d 分钟，建议优先排查该模块的练习方式与投入强度。" % (
                m.get("label"), avg, m.get("study_time", 0))
        module_analysis.append({"module": m.get("label"), "status": status, "analysis": analysis})

    suggestions = []
    if weak:
        names = "、".join(w.get("label", "") for w in weak[:3])
        suggestions.append({
            "title": "集中突破班级共性薄弱模块",
            "problem": "以下模块均分低于 70：%s" % names,
            "action": "针对这些模块安排专项训练：先在课堂上做一次集中讲解，再布置对应模块的定向作业，要求在 2 周内完成至少 3 次练习。",
            "target": "全班学生",
            "priority": "高",
        })
    if att:
        suggestions.append({
            "title": "重点跟踪预警学生",
            "problem": "有 %d 名学生出现无练习记录、均分偏低或投入不足的情况" % len(att),
            "action": "逐一了解原因：对无记录学生确认是否存在登录或使用障碍；对均分偏低学生调整练习难度至基础档，先从低难度任务重建信心；对投入不足学生设定每周最低练习时长要求。",
            "target": "、".join(a.get("name", "") for a in att[:5]),
            "priority": "高",
        })
    if active < total:
        suggestions.append({
            "title": "提升班级练习参与度",
            "problem": "班级 %d 人中有 %d 人在统计周期内没有练习记录，参与率仅 %.0f%%" % (
                total, total - active, (active / total * 100) if total else 0),
            "action": "通过班级群告知练习入口与本周任务要求，并设置阶段性检查点，对完成情况在班级内公示以形成正向激励。",
            "target": "未参与练习的学生",
            "priority": "中",
        })
    if top:
        suggestions.append({
            "title": "发挥优秀学生示范作用",
            "problem": "班级有 %d 名学生综合均分达到 85 以上" % len(top),
            "action": "邀请这些学生分享学习方法，或安排其与薄弱学生结对互助，同时为其提供更高难度的挑战性任务以保持学习动力。",
            "target": "、".join(t.get("name", "") for t in top[:5]),
            "priority": "低",
        })
    if not suggestions:
        suggestions.append({
            "title": "先建立练习数据基础",
            "problem": "当前班级尚无有效练习数据，无法定位具体问题",
            "action": "先确认学生已正确加入班级并知晓各模块入口，安排一次覆盖听说读写的完整练习任务，待数据积累后再做针对性分析。",
            "target": "全班学生",
            "priority": "高",
        })

    attention_names = [a.get("name", "") for a in att if a.get("overall_avg", 0) > 0]
    middle_names = [
        p.get("name", "") for p in overview.get("students", [])
        if 60 <= p.get("summary", {}).get("overall_avg", 0) < 85
    ]
    excellent_names = [t.get("name", "") for t in top]

    return {
        "overall_diagnosis": overall,
        "module_analysis": module_analysis,
        "student_layering": {
            "attention": {
                "summary": "该层次学生在练习参与度、投入时长或成绩上存在明显短板，合计 %d 人。" % len(att),
                "students": attention_names,
                "actions": "优先安排一对一沟通，明确具体短板后从基础难度任务入手，设定每周可达成的小目标并跟踪反馈。",
            },
            "improving": {
                "summary": "该层次学生成绩处于中间区间，具备较大提升潜力，合计 %d 人。" % len(middle_names),
                "students": middle_names,
                "actions": "针对其各自的最弱模块布置定向练习，鼓励其在保持现有投入的基础上适度增加练习频次。",
            },
            "excellent": {
                "summary": "该层次学生综合表现突出，合计 %d 人。" % len(excellent_names),
                "students": excellent_names,
                "actions": "提供高难度挑战任务维持学习动力，并安排其参与互助或经验分享。",
            },
        },
        "teaching_suggestions": suggestions,
        "follow_up_metrics": [
            "各模块均分变化趋势（重点关注薄弱模块是否回升）",
            "班级练习参与率与人均练习时长",
            "预警学生的练习记录恢复情况",
        ],
        "data_notes": [
            "本报告基于平台记录的练习数据自动生成，统计周期为近 %d 天。" % overview.get("period_days", 30),
            "未产生评分数据的模块不计入薄弱判断，其分析仅供参考。",
        ],
    }
