"""写作模块模型"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from app.database import Base
from app.models.user import gen_uuid


class WritingSubmission(Base):
    """作文提交与批改记录"""
    __tablename__ = "writing_submissions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    type = Column(String(20), nullable=False)  # chart / argumentative / creative / imitation
    prompt = Column(Text, default="")  # 写作题目/要求
    content = Column(Text, nullable=False)
    word_count = Column(Integer, default=0)
    status = Column(String(20), default="submitted")  # submitted / reviewing / completed
    # AI 批改结果
    scores = Column(Text, default="[]")  # JSON: [{name, score, maxScore, feedback}]
    overall_score = Column(Integer, default=0)
    ai_feedback = Column(Text, default="")
    revised_version = Column(Text, default="")  # AI 润色版
    error_details = Column(Text, default="[]")  # JSON: 逐句错误标注
    submitted_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class WritingPeerReview(Base):
    """写作互评记录"""
    __tablename__ = "writing_peer_reviews"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    submission_id = Column(String(36), ForeignKey("writing_submissions.id"), nullable=False)
    reviewer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    score = Column(Integer, default=0)
    feedback = Column(Text, default="")
    is_anonymous = Column(String(5), default="true")
    created_at = Column(DateTime, default=datetime.utcnow)
