"""用户与认证模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    """用户表 — 学生 / 教师"""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    display_name = Column(String(50), nullable=False)
    avatar = Column(String(500), default="")
    role = Column(String(20), default="student")  # student / teacher
    level = Column(String(20), default="intermediate")  # beginner / intermediate / advanced
    total_points = Column(Integer, default=0)
    streak = Column(Integer, default=0)
    joined_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
