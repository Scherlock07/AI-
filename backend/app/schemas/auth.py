"""认证 schemas"""

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: str
    role: str = "student"


class LoginRequest(BaseModel):
    username: str  # 支持 username 或 email
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


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


from app.schemas.user import UserResponse  # noqa: E402
TokenResponse.model_rebuild()
