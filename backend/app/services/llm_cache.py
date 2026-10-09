"""LLM 结果缓存层

设计目标：在不改变任何功能表现的前提下，消除"相同请求重复调用大模型"的浪费。

三层保护：
1. 结果缓存（持久化到 SQLite）—— 相同参数直接返回历史结果
2. 单飞（singleflight）—— 同一 key 的并发请求只真正调用一次，其余等待复用
3. 分级 TTL —— 结果稳定的业务长期缓存，有时效性的业务短缓存
"""

import asyncio
import hashlib
import json
import random
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable

from app.config import settings

# 缓存条目上限，超出后按"最久未命中"淘汰
MAX_ENTRIES = 3000

# 命中即省：用于无历史记录时兜底的估算值
_FALLBACK_SAVING = 1500

# 各业务的缓存有效期（天）
CACHE_TTL_DAYS: dict[str, int] = {
    # 结果只取决于输入内容，永久有效（同一篇作文/同一段录音结果必然一致）
    "grade_writing": 3650,
    "evaluate_speaking": 3650,
    "grade_translation": 3650,
    "analyze_single_word": 3650,
    "analyze_single_sentence": 3650,
    "analyze_word_root": 3650,
    # 内容型：需要保留新鲜感，但短期内重复生成毫无意义
    "generate_listening_script": 90,
    "analyze_reading": 180,
    "generate_grammar_exercises": 60,
    # 推荐型：保留一定新鲜度
    "recommend_discussion_topics": 14,
    "recommend_learning_path": 1,
}

# 同一 key 的并发单飞表（asyncio 单线程协作式调度，下面的读写之间没有 await，
# 因此是原子的，无需额外加锁；也避免模块级 Lock 与事件循环绑定的问题）
_inflight: dict[str, asyncio.Future] = {}

# 进程内缓存统计
_stats = {"hit": 0, "miss": 0, "saved_tokens": 0}


def make_key(tag: str, parts: list[Any]) -> str:
    """生成缓存键：业务标签 + 规范化后的参数"""
    chunks = [tag]
    for p in parts:
        if isinstance(p, str):
            chunks.append(p)
        else:
            chunks.append(json.dumps(p, ensure_ascii=False, sort_keys=True, default=str))
    raw = "\x1f".join(chunks)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _avg_cost(tag: str) -> int:
    """该业务的单次平均 token 成本（用于估算节省量）"""
    try:
        from app.database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            row = db.execute(
                text(
                    "SELECT AVG(prompt_tokens + completion_tokens) FROM llm_usage_logs "
                    "WHERE tag = :t AND completion_tokens > 0"
                ),
                {"t": tag},
            ).fetchone()
            if row and row[0]:
                return int(row[0])
        finally:
            db.close()
    except Exception:
        pass
    return _FALLBACK_SAVING


def get_cached(cache_key: str, ttl_days: int) -> Any | None:
    """读缓存；未命中或已过期返回 None"""
    if not settings.LLM_CACHE_ENABLED:
        return None
    try:
        from app.database import SessionLocal
        from app.models.llm_cache import LLMResultCache
        db = SessionLocal()
        try:
            row = db.query(LLMResultCache).filter(LLMResultCache.cache_key == cache_key).first()
            if not row:
                return None
            if ttl_days > 0 and row.created_at and datetime.utcnow() - row.created_at > timedelta(days=ttl_days):
                return None
            saved = _avg_cost(row.tag)
            row.hits = (row.hits or 0) + 1
            row.saved_tokens = (row.saved_tokens or 0) + saved
            row.last_hit_at = datetime.utcnow()
            db.commit()
            _stats["hit"] += 1
            _stats["saved_tokens"] += saved
            print(f"[LLM-CACHE] HIT {row.tag} | 复用第 {row.hits} 次 | 本次估算节省 {saved} tok")
            return json.loads(row.payload)
        finally:
            db.close()
    except Exception as e:
        print(f"[LLM-CACHE] read failed: {e}")
        return None


def put_cached(cache_key: str, tag: str, payload: Any) -> None:
    """写缓存（失败不影响业务）"""
    if not settings.LLM_CACHE_ENABLED:
        return
    try:
        from app.database import SessionLocal
        from app.models.llm_cache import LLMResultCache
        db = SessionLocal()
        try:
            exists = db.query(LLMResultCache).filter(LLMResultCache.cache_key == cache_key).first()
            if exists:
                exists.payload = json.dumps(payload, ensure_ascii=False)
                exists.created_at = datetime.utcnow()
            else:
                db.add(LLMResultCache(
                    cache_key=cache_key,
                    tag=tag,
                    payload=json.dumps(payload, ensure_ascii=False),
                ))
            db.commit()
            if random.random() < 0.05:
                _evict(db)
        finally:
            db.close()
    except Exception as e:
        print(f"[LLM-CACHE] write failed: {e}")


def _evict(db) -> None:
    """条目过多时淘汰最久未命中、且创建较早的记录"""
    try:
        from app.models.llm_cache import LLMResultCache
        total = db.query(LLMResultCache).count()
        if total <= MAX_ENTRIES:
            return
        stale = (
            db.query(LLMResultCache)
            .order_by(LLMResultCache.hits.asc(), LLMResultCache.created_at.asc())
            .limit(total - MAX_ENTRIES)
            .all()
        )
        for row in stale:
            db.delete(row)
        db.commit()
        print(f"[LLM-CACHE] evicted {len(stale)} entries")
    except Exception:
        pass


async def cached_json(
    tag: str,
    parts: list[Any],
    factory: Callable[[], Awaitable[Any]],
    ttl_days: int | None = None,
) -> tuple[Any, bool]:
    """带缓存 + 单飞的结果获取

    返回 (结果, 是否命中缓存)。
    factory 只在缓存未命中且没有其他协程正在生成时被调用。
    """
    if not settings.LLM_CACHE_ENABLED:
        return await factory(), False

    ttl = CACHE_TTL_DAYS.get(tag, 30) if ttl_days is None else ttl_days
    key = make_key(tag, parts)

    hit = get_cached(key, ttl)
    if hit is not None:
        return hit, True

    # 单飞：同一 key 并发时只让一个协程真正调用 LLM，其余等待复用
    fut = _inflight.get(key)
    if fut is None:
        fut = asyncio.get_running_loop().create_future()
        _inflight[key] = fut
        leader = True
    else:
        leader = False

    if not leader:
        try:
            return await asyncio.shield(fut), True
        except Exception as e:
            # 领头协程失败时兜底：自己再试一次，保证功能不受影响
            print(f"[LLM-CACHE] leader failed, fallback to direct call: {e}")
            return await factory(), False

    error: BaseException | None = None
    result: Any = None
    try:
        _stats["miss"] += 1
        result = await factory()
        put_cached(key, tag, result)
        return result, False
    except BaseException as e:
        error = e
        raise
    finally:
        f = _inflight.pop(key, None)
        if f is not None and not f.done():
            if error is not None:
                f.set_exception(error)
                f.exception()  # 消费一次，避免 "exception was never retrieved" 告警
            else:
                f.set_result(result)


def cache_stats() -> dict:
    """返回进程内缓存统计（供运维接口使用）"""
    return dict(_stats)
