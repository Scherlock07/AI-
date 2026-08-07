"""教师后台模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Boolean
from app.database import Base
from app.models.user import gen_uuid


class Class(Base):
    """班级"""
    __tablename__ = "classes"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    invite_code = Column(String(20), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClassMember(Base):
    """班级成员"""
    __tablename__ = "class_members"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)


class Assignment(Base):
    """作业"""
    __tablename__ = "assignments"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    module = Column(String(30), nullable=False)  # listening / speaking / reading / writing
    difficulty = Column(String(20), default="intermediate")
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClassroomSpeakingScore(Base):
    """课堂口语评分记录"""
    __tablename__ = "classroom_speaking_scores"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    topic = Column(String(200), nullable=False)
    scores = Column(Text, default="[]")  # JSON: 多维度评分
    overall_score = Column(Integer, default=0)
    feedback = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
