"""口语模块模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, Float, ForeignKey
from app.database import Base
from app.models.user import gen_uuid


class SpeakingRecord(Base):
    """口语练习记录"""
    __tablename__ = "speaking_records"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    type = Column(String(20), nullable=False)  # presentation / discussion / conversation / retelling / classroom
    topic = Column(String(200), nullable=False)
    duration = Column(Integer, default=0)  # 秒
    audio_url = Column(String(500), default="")
    transcript = Column(Text, default="")
    scores = Column(Text, default="[]")  # JSON: [{name, score, maxScore, feedback}]
    overall_score = Column(Integer, default=0)
    feedback = Column(Text, default="")
    reference_answer = Column(Text, default="")
    pronunciation_scores = Column(Text, default="{}")  # JSON: Azure 发音评估结果
    created_at = Column(DateTime, default=datetime.utcnow)


class DiscussionRoom(Base):
    """讨论房间 — 轮流发言模式 + 自由讨论"""
    __tablename__ = "discussion_rooms"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    topic = Column(String(300), nullable=False)
    description = Column(Text, default="")  # 房间描述
    host_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    host_name = Column(String(100), default="")
    status = Column(String(20), default="waiting")  # waiting / active / completed
    max_participants = Column(Integer, default=6)
    ai_count = Column(Integer, default=2)  # AI讨论者数量
    language = Column(String(10), default="en")  # 讨论语言
    difficulty = Column(String(20), default="intermediate")  # 难度
    category = Column(String(50), default="general")  # 话题分类
    current_speaker = Column(String(36), nullable=True)
    speaker_queue = Column(Text, default="[]")  # JSON: 参与者发言顺序
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class DiscussionMessage(Base):
    """讨论房间消息"""
    __tablename__ = "discussion_messages"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    room_id = Column(String(36), ForeignKey("discussion_rooms.id"), nullable=False, index=True)
    sender_id = Column(String(36), default="")  # 用户ID或AI标识
    sender_name = Column(String(100), default="")
    sender_type = Column(String(10), default="user")  # user / ai / system
    content = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
