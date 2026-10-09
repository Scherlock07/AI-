"""LLM 结果缓存模型 — 相同请求复用历史结果，避免重复消耗 tokens"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime
from app.database import Base


class LLMResultCache(Base):
    """LLM 业务结果缓存

    缓存键 = sha256(业务标签 + 规范化参数)，命中时直接返回历史结果，不再调用 LLM。
    典型场景：
    - 同一篇作文被反复批改（学生误点两次、刷新重试）
    - 同一主题/口音/语速/难度/时长的听力素材被多次生成
    - 同一单词、同一长难句被不同学生反复查询
    """
    __tablename__ = "llm_result_cache"

    cache_key = Column(String(64), primary_key=True)  # sha256 hex
    tag = Column(String(100), default="", index=True)  # 业务函数名
    payload = Column(Text, default="")  # JSON 序列化的结果
    hits = Column(Integer, default=0)  # 被复用的次数
    saved_tokens = Column(Integer, default=0)  # 累计估算节省的 tokens
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_hit_at = Column(DateTime, nullable=True)
