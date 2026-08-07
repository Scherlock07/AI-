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
import httpx
from typing import Any
from app.config import settings


async def call_llm(messages: list[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
    """调用 LLM (OpenAI 兼容接口)"""
    if not settings.LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY not configured")

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
        resp = await client.post(f"{settings.LLM_BASE_URL}/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def call_llm_json(messages: list[dict], temperature: float = 0.3) -> dict | list:
    """调用 LLM 并解析为 JSON"""
    raw = await call_llm(messages, temperature=temperature)
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

async def grade_writing(content: str, writing_type: str, prompt: str, title: str = "") -> dict:
    """AI 写作批改：六维度评分 + 逐句纠错 + 润色版"""
    if not settings.LLM_API_KEY:
        return _mock_writing_grade(content)
    system_msg = (
        "你是一位资深英语写作教师，拥有丰富的托福/雅思/学术写作教学经验。"
        "请对学生作文进行专业批改，严格按照要求的 JSON 格式输出。"
    )
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

同时提供：
- overall_feedback: 总体评价
- revised_version: 润色后的完整作文
- error_details: 逐句错误标注数组 [{{original, corrected, error_type, explanation}}]

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
  ]
}}"""

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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

    result = await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])

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

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


# ========== 听力素材脚本生成 ==========

async def generate_listening_script(topic: str, accent: str, speed: float, difficulty: str, duration: int) -> dict:
    """AI 生成听力素材脚本"""
    if not settings.LLM_API_KEY:
        return _mock_listening_script(topic)
    system_msg = "你是一位英语听力教材编写专家，擅长设计各难度级别的听力素材。"

    minutes = duration // 60
    seconds = duration % 60

    user_msg = f"""请生成一段英语听力素材。

主题: {topic}
口音: {accent} (美式=us, 英式=uk, 澳式=au)
语速: {speed}x
难度: {difficulty}
目标时长: {minutes}分{seconds}秒

请严格按 JSON 格式输出：
{{
  "title": "素材标题",
  "script": "完整的听力脚本文本（纯对话或独白）",
  "vocabulary": [
    {{"word": "生词", "phonetic": "/fəˈnetɪk/", "definition": "中文释义", "example": "例句"}}
  ],
  "difficulty_notes": "难度说明"
}}

注意：脚本内容应自然流畅，符合{accent}口音的英语表达习惯。"""

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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
    """AI 助教对话"""
    if not settings.LLM_API_KEY:
        return f"[Mock模式] 收到你的问题：「{user_message[:100]}」。配置 LLM API Key 后，AI助教将提供专业的英语学习解答。"
    messages = [
        {"role": "system", "content": "你是AI外语学习助教，可以回答英语学习问题、提供学习建议、解释语法点、纠正写作等。请用中文回答，必要时给出英语示例。"},
    ]
    if context:
        messages.append({"role": "system", "content": f"对话上下文: {context}"})
    messages.append({"role": "user", "content": user_message})

    return await call_llm(messages, temperature=0.7)


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

    return await call_llm_json([
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ])


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
