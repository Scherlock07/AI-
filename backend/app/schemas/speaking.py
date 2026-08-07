"""口语模块 schemas"""

from pydantic import BaseModel, Field


class SpeakingEvaluateRequest(BaseModel):
    type: str = "presentation"  # presentation / discussion / conversation / retelling / classroom
    topic: str
    transcript: str = ""
    audio_base64: str = ""  # 可选：base64 编码音频
    reference_text: str = ""  # 用于发音对比的参考文本


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
    pronunciation_detail: dict = {}  # Azure 发音评估详情


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
