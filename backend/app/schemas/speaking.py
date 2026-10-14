"""口语模块 schemas"""

from pydantic import BaseModel, Field


class SpeakingEvaluateRequest(BaseModel):
    type: str = "presentation"  # presentation / discussion / conversation / retelling / classroom
    topic: str
    transcript: str = ""
    audio_base64: str = ""  # 可选：base64 编码音频
    reference_text: str = ""  # 用于发音对比的参考文本
    duration: int = 0  # 秒，练习时长（兰天童 10.10 反馈）
    mime: str = ""  # audio_base64 对应的容器类型（audio/webm 等），供后端转码判断
    # 前端在「录音 → 转写」一步已拿到的发音评估结果，回传后随记录一并落库。
    # 否则发音评估只在响应里出现一次，学生刷新后（历史记录）就查不到了。
    pronunciation_detail: dict = {}


class SpeakingTranscribeRequest(BaseModel):
    """浏览器录音 → 文本。整条链路在自有后端完成，不依赖浏览器厂商的识别服务。"""

    audio_base64: str
    mime: str = ""  # audio/webm;codecs=opus、audio/mp4 等
    reference_text: str = ""  # 有值时同时做音素级发音评估
    language: str = "en-US"


class SpeakingTranscribeResult(BaseModel):
    transcript: str = ""
    pronunciation_detail: dict = {}
    source: str = "azure"  # azure / unavailable / error
    error: str = ""
    duration: float = 0.0  # 音频秒数


class SpeakingScoreDimension(BaseModel):
    name: str
    score: int
    maxScore: int = 100
    feedback: str = ""


class SpeakingEvaluateResult(BaseModel):
    scores: list[SpeakingScoreDimension]
    overall_score: int
    feedback: str
    reference_answer: str = ""
    transcript: str = ""  # 后端识别出的真实转写，回传给前端展示
    pronunciation_detail: dict = {}  # Azure 发音评估详情
    transcript_warning: str = ""  # empty / too_short：转写为空或过短时的显式提示


# ========== 讨论房间 ==========

class DiscussionRoomCreate(BaseModel):
    topic: str
    description: str = ""
    max_participants: int = 6
    ai_count: int = 2
    language: str = "en"
    difficulty: str = "intermediate"
    category: str = "general"


class DiscussionRoomResponse(BaseModel):
    id: str
    topic: str
    description: str = ""
    host_id: str
    host_name: str = ""
    status: str
    max_participants: int
    ai_count: int = 2
    language: str = "en"
    difficulty: str = "intermediate"
    category: str = "general"
    current_speaker: str | None = None
    speaker_queue: list[dict] = []
    participant_count: int = 0
    created_at: str = ""


class DiscussionMessageCreate(BaseModel):
    content: str


# ============ 人机对话会话持久化（兰天童 10.10 反馈）============

class ConversationStartRequest(BaseModel):
    mode: str = "daily"  # daily / critical
    topic: str = ""


class ConversationMessageAdd(BaseModel):
    role: str = "user"  # user / ai
    content: str


class ConversationMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str = "user"
    content: str = ""
    turn_index: int = 0
    created_at: str = ""


class ConversationSessionResponse(BaseModel):
    id: str
    mode: str = "daily"
    topic: str = ""
    status: str = "active"
    message_count: int = 0
    duration: int = 0
    overall_score: int = 0
    feedback: str = ""
    started_at: str = ""
    completed_at: str = ""
    messages: list[ConversationMessageResponse] = []


class ConversationFinishRequest(BaseModel):
    duration: int = 0  # 秒，前端计时器上报
    overall_score: int = 0
    feedback: str = ""
    scores: list[dict] = []


class PracticeStartRequest(BaseModel):
    module: str
    sub_type: str = ""


class PracticeStartResponse(BaseModel):
    session_id: str
    started_at: str


class PracticeEndRequest(BaseModel):
    session_id: str = ""
    duration: int = 0        # 秒，前端上报
    module: str = ""
    sub_type: str = ""


class PracticeEndResponse(BaseModel):
    ok: bool = True
    duration: int = 0
    module: str = ""
    total_duration: int = 0  # 该模块累计时长（秒）
    total_count: int = 0     # 该模块累计次数


class DiscussionMessageResponse(BaseModel):
    id: str
    room_id: str
    sender_id: str = ""
    sender_name: str = ""
    sender_type: str = "user"
    content: str = ""
    created_at: str = ""


class TopicRecommendRequest(BaseModel):
    category: str = "general"
    difficulty: str = "intermediate"
    count: int = 5


class TopicRecommendResponse(BaseModel):
    topics: list[dict] = []


class InviteRequest(BaseModel):
    username: str


class AIReplyRequest(BaseModel):
    """AI讨论者回复请求"""
    ai_name: str = ""
    ai_persona: str = ""  # AI角色设定
