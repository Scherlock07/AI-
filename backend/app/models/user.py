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


class PracticeSession(Base):
    """练习时长记录

    修复兰天童 10.10 反馈「无法统计本次对话练习的时长」。

    口径定义（重要）：
    - 一条记录 = 一次练习，由前端在进入练习页时调用 start、离开或完成时调用 end 生成
    - duration_seconds 由前端根据本地计时器上报，后端做合理性钳制（0 ~ 4 小时）
    - module 取值与前端模块一致：listening / speaking / reading / writing /
      vocabulary / translation / conversation
    - sub_type 记录细分场景（如 speaking 下的人机对话 daily / critical）
    """
    __tablename__ = "practice_sessions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    module = Column(String(30), nullable=False, index=True)
    sub_type = Column(String(50), default="")
    duration_seconds = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
