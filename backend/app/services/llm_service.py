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

请严格按以下 JSON 格式输出：
{{
  "scores": [
    {{"name": "Fluency", "score": 75, "maxScore": 100, "feedback": "..."}},
    {{"name": "Pronunciation", "score": 70, "maxScore": 100, "feedback": "..."}},
    {{"name": "Vocabulary", "score": 80, "maxScore": 100, "feedback": "..."}},
    {{"name": "Grammar", "score": 72, "maxScore": 100, "feedback": "..."}},
    {{"name": "Content", "score": 78, "maxScore": 100, "feedback": "..."}},
    {{"name": "Interactive Communication", "score": 75, "maxScore": 100, "feedback": "..."}}
  ],
  "overall_score": 75,
  "feedback": "总体评价...",
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

async def analyze_reading(content: str, difficulty: str = "intermediate") -> dict:
    """AI 阅读文本分析"""
    if not settings.LLM_API_KEY:
        return _mock_reading_analysis(content)
    system_msg = (
        "你是一位英语阅读教学专家，擅长文本分析、长难句解析和文化背景注释。"
        "请对给定文本进行深度分析。"
    )
    user_msg = f"""请分析以下英语阅读文本（难度: {difficulty}）：

{content[:5000]}

请提供以下分析，严格按 JSON 格式输出：
{{
  "summary": "文章摘要（3-5句话）",
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
}}"""

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
