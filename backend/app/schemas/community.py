"""翻译与社区 schemas"""

from pydantic import BaseModel


class TranslationGradeRequest(BaseModel):
    source_text: str
    user_translation: str
    direction: str = "en-to-zh"  # en-to-zh / zh-to-en


class TranslationGradeResult(BaseModel):
    scores: list[dict]  # [{name, score, maxScore, feedback}]
    overall_score: int
    reference_translation: str
    improvement_suggestions: str
    translation_tips: list[str] = []


class StudyGroupCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "general"
    max_members: int = 20


class StudyGroupResponse(BaseModel):
    id: str
    name: str
    description: str = ""
    category: str = "general"
    member_count: int = 1
    max_members: int = 20
    creator_id: str = ""
    created_at: str = ""
    joined: bool = False


class AchievementResponse(BaseModel):
    id: str
    title: str
    description: str = ""
    icon: str = "trophy"
    progress: int = 0
    target: int = 1
    unlocked_at: str | None = None
