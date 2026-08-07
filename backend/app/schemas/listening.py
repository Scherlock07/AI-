"""听力模块 schemas"""

from pydantic import BaseModel


class ListeningGenerateRequest(BaseModel):
    topic: str = "daily life"
    accent: str = "us"  # us / uk / au
    speed: float = 1.0
    difficulty: str = "intermediate"
    duration: int = 120  # 秒


class ListeningMaterialResponse(BaseModel):
    id: str
    title: str
    topic: str
    accent: str
    speed: float
    duration: int
    audio_url: str = ""
    transcript: str = ""
    source: str = "ai-generated"
    difficulty: str = "intermediate"
    key_vocabulary: list[dict] = []
    created_at: str = ""


class ListeningImportRequest(BaseModel):
    title: str
    topic: str
    content: str  # 转写文本
    difficulty: str = "intermediate"
