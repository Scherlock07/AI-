"""用户 schemas"""

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    avatar: str = ""
    role: str = "student"
    level: str = "intermediate"
    total_points: int = 0
    streak: int = 0
    joined_at: str = ""


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    avatar: str | None = None
    level: str | None = None  # beginner / intermediate / advanced


class LearningStatsResponse(BaseModel):
    total_study_time: int = 0  # 分钟
    total_exercises: int = 0
    weekly_progress: list[dict] = []
    ability_radar: list[dict] = []
    weak_points: list[str] = []
    streak: int = 0
