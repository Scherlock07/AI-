"""LLM 调用用量日志模型 — 观测每次 AI 调用的 tokens 消耗"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime
from app.database import Base
from app.models.user import gen_uuid


class LLMUsageLog(Base):
    """每次 LLM API 调用的用量记录

    用于观测：哪个业务接口调用了多少次、每次消耗多少 tokens（含缓存命中拆分）。
    """
    __tablename__ = "llm_usage_logs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    tag = Column(String(100), default="")  # 调用来源（业务函数名）
    model = Column(String(50), default="")
    prompt_chars = Column(Integer, default=0)  # 发送的 prompt 总字符数
    prompt_tokens = Column(Integer, default=0)  # input tokens 总数
    completion_tokens = Column(Integer, default=0)  # output tokens
    cache_hit_tokens = Column(Integer, default=0)  # 缓存命中（计费 0.1元/百万）
    cache_miss_tokens = Column(Integer, default=0)  # 缓存未命中（计费 1元/百万）
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
