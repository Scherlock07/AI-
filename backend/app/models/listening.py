"""听力模块模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.user import gen_uuid


class ListeningMaterial(Base):
    """听力素材"""
    __tablename__ = "listening_materials"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    title = Column(String(200), nullable=False)
    topic = Column(String(100), nullable=False)
    accent = Column(String(10), default="us")  # us / uk / au / other
    speed = Column(Float, default=1.0)
    duration = Column(Integer, default=0)  # 秒
    audio_url = Column(String(500), default="")
    transcript = Column(Text, default="")
    source = Column(String(20), default="ai-generated")  # ai-generated / imported
    difficulty = Column(String(20), default="intermediate")
    key_vocabulary = Column(Text, default="[]")  # JSON: [{word, phonetic, definition, example}]
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)


class ListeningExercise(Base):
    """听力练习记录"""
    __tablename__ = "listening_exercises"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    material_id = Column(String(36), ForeignKey("listening_materials.id"), nullable=False)
    score = Column(Integer, default=0)
    completed_at = Column(DateTime, default=datetime.utcnow)
    details = Column(Text, default="{}")  # JSON: 练习详情
