"""词汇与语法模块模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Float, Boolean
from app.database import Base
from app.models.user import gen_uuid


class VocabularyWord(Base):
    """智能词汇本 — 艾宾浩斯复习"""
    __tablename__ = "vocabulary_words"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    word = Column(String(100), nullable=False)
    phonetic = Column(String(100), default="")
    part_of_speech = Column(String(50), default="")
    definition = Column(Text, default="")
    example = Column(Text, default="")
    context = Column(Text, default="")  # 来源语境
    root_analysis = Column(Text, default="")  # 词根词缀分析
    # 艾宾浩斯复习参数
    review_count = Column(Integer, default=0)
    mastery = Column(Integer, default=0)  # 0-100
    next_review = Column(DateTime, nullable=True)
    last_reviewed = Column(DateTime, nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)


class GrammarExercise(Base):
    """语法练习题"""
    __tablename__ = "grammar_exercises"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    type = Column(String(30), nullable=False)  # fill-blank / multiple-choice / error-correction / sentence-transform
    question = Column(Text, nullable=False)
    options = Column(Text, default="[]")  # JSON: 选择题选项
    answer = Column(Text, nullable=False)
    explanation = Column(Text, default="")
    grammar_point = Column(String(200), default="")
    difficulty = Column(String(20), default="intermediate")


class GrammarExerciseRecord(Base):
    """语法练习记录"""
    __tablename__ = "grammar_exercise_records"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    exercise_id = Column(String(36), ForeignKey("grammar_exercises.id"), nullable=False)
    user_answer = Column(Text, default="")
    is_correct = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WrongAnswer(Base):
    """错题本"""
    __tablename__ = "wrong_answers"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    module = Column(String(30), nullable=False)  # listening / speaking / reading / writing / vocabulary / translation
    question = Column(Text, nullable=False)
    user_answer = Column(Text, default="")
    correct_answer = Column(Text, default="")
    explanation = Column(Text, default="")
    reviewed = Column(Boolean, default=False)
    added_at = Column(DateTime, default=datetime.utcnow)
