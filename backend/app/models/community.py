"""社区、翻译、学习统计模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, Float, ForeignKey, Boolean
from app.database import Base
from app.models.user import gen_uuid


class TranslationExercise(Base):
    """翻译练习"""
    __tablename__ = "translation_exercises"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    source_text = Column(Text, nullable=False)
    direction = Column(String(20), nullable=False)  # en-to-zh / zh-to-en
    reference_translation = Column(Text, default="")
    difficulty = Column(String(20), default="intermediate")
    tips = Column(Text, default="[]")  # JSON
    created_at = Column(DateTime, default=datetime.utcnow)


class TranslationRecord(Base):
    """翻译练习记录"""
    __tablename__ = "translation_records"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    exercise_id = Column(String(36), ForeignKey("translation_exercises.id"), nullable=True)
    source_text = Column(Text, nullable=False)
    user_translation = Column(Text, nullable=False)
    direction = Column(String(20), nullable=False)
    scores = Column(Text, default="[]")  # JSON: [{name, score, feedback}]
    overall_score = Column(Integer, default=0)
    reference_translation = Column(Text, default="")
    improvement_suggestions = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class StudyGroup(Base):
    """学习小组"""
    __tablename__ = "study_groups"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    category = Column(String(50), default="general")
    max_members = Column(Integer, default=20)
    member_count = Column(Integer, default=1)
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class StudyGroupMember(Base):
    """学习小组成员"""
    __tablename__ = "study_group_members"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    group_id = Column(String(36), ForeignKey("study_groups.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)


class Achievement(Base):
    """成就系统"""
    __tablename__ = "achievements"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text, default="")
    icon = Column(String(50), default="trophy")
    progress = Column(Integer, default=0)
    target = Column(Integer, default=1)
    unlocked_at = Column(DateTime, nullable=True)


class LearningStats(Base):
    """学习统计 (按天聚合)"""
    __tablename__ = "learning_stats"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD
    module = Column(String(30), nullable=False)  # listening / speaking / reading / writing / vocabulary / translation
    study_time = Column(Integer, default=0)  # 分钟
    exercise_count = Column(Integer, default=0)
    avg_score = Column(Float, default=0.0)
