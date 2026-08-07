"""阅读模块模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from app.database import Base
from app.models.user import gen_uuid


class ReadingText(Base):
    """阅读文本库"""
    __tablename__ = "reading_texts"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    title = Column(String(200), nullable=False)
    source = Column(String(200), default="手动导入")
    content = Column(Text, nullable=False)
    difficulty = Column(String(20), default="intermediate")
    word_count = Column(Integer, default=0)
    # AI 分析结果（缓存）
    summary = Column(Text, default="")
    key_points = Column(Text, default="[]")  # JSON
    structure = Column(Text, default="[]")  # JSON: 逻辑结构树
    difficult_sentences = Column(Text, default="[]")  # JSON: [{sentence, analysis}]
    translation = Column(Text, default="")  # 全文翻译
    cultural_notes = Column(Text, default="[]")  # JSON: [{term, explanation, position}]
    vocabulary = Column(Text, default="[]")  # JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)


class ReadingExercise(Base):
    """阅读练习记录"""
    __tablename__ = "reading_exercises"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    text_id = Column(String(36), ForeignKey("reading_texts.id"), nullable=False)
    time_spent = Column(Integer, default=0)  # 秒
    comprehension_score = Column(Integer, default=0)
    completed_at = Column(DateTime, default=datetime.utcnow)
