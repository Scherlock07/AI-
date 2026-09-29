"""使用数据收集模块路由 — 前端埋点上报 / 教师查看统计"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.community import UsageEvent
from app.auth.security import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["使用数据"])


class TrackEvent(BaseModel):
    event_type: str = Field(..., max_length=30)  # page_view / module_duration / feature_use
    module: str = Field("", max_length=30)
    action: str = Field("", max_length=60)
    detail: dict = Field(default_factory=dict)
    device: str = Field("", max_length=20)
    client_time: str = Field("", max_length=40)  # 客户端时间（仅参考，服务端另有 created_at）


class TrackBatch(BaseModel):
    events: list[TrackEvent] = Field(..., max_length=50)


@router.post("/track", response_model=dict)
async def track_events(
    batch: TrackBatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """接收前端埋点事件（批量，最多50条/次）"""
    rows = []
    for ev in batch.events:
        import json
        rows.append(UsageEvent(
            user_id=user.id,
            event_type=ev.event_type,
            module=ev.module,
            action=ev.action,
            detail=json.dumps(ev.detail, ensure_ascii=False)[:2000],
            device=ev.device or "",
        ))
    db.add_all(rows)
    db.commit()
    return {"received": len(rows)}


@router.get("/summary", response_model=dict)
async def analytics_summary(
    days: int = 14,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """使用数据汇总（仅教师）：总览 / 模块分布 / 每日活跃 / 热门功能 / 设备占比"""
    if user.role != "teacher":
        raise HTTPException(403, "仅教师可查看使用数据")

    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    base = db.query(UsageEvent).filter(UsageEvent.created_at >= since)

    # 总览
    total_events = base.count()
    total_users = db.query(func.count(func.distinct(UsageEvent.user_id))).filter(
        UsageEvent.created_at >= since
    ).scalar() or 0

    # 模块分布（按 page_view 事件）
    module_rows = (
        db.query(UsageEvent.module, func.count(UsageEvent.id))
        .filter(UsageEvent.created_at >= since, UsageEvent.event_type == "page_view")
        .group_by(UsageEvent.module)
        .all()
    )
    by_module = [{"module": m or "unknown", "count": c} for m, c in module_rows if m]

    # 每日事件量与活跃用户
    daily_rows = (
        db.query(
            func.date(UsageEvent.created_at),
            func.count(UsageEvent.id),
            func.count(func.distinct(UsageEvent.user_id)),
        )
        .filter(UsageEvent.created_at >= since)
        .group_by(func.date(UsageEvent.created_at))
        .all()
    )
    daily = [{"date": str(d), "events": c, "users": u} for d, c, u in daily_rows]

    # 热门功能动作（feature_use）
    action_rows = (
        db.query(UsageEvent.module, UsageEvent.action, func.count(UsageEvent.id))
        .filter(UsageEvent.created_at >= since, UsageEvent.event_type == "feature_use")
        .group_by(UsageEvent.module, UsageEvent.action)
        .order_by(func.count(UsageEvent.id).desc())
        .limit(10)
        .all()
    )
    top_actions = [{"module": m, "action": a, "count": c} for m, a, c in action_rows if a]

    # 模块停留时长（module_duration，detail 内含 seconds，JSON 文本需 Python 侧解析求均值）
    durations: dict = {}
    dur_events = db.query(UsageEvent).filter(
        UsageEvent.created_at >= since, UsageEvent.event_type == "module_duration"
    ).all()
    import json
    for ev in dur_events:
        if not ev.module:
            continue
        try:
            secs = float(json.loads(ev.detail or "{}").get("seconds", 0))
        except (ValueError, TypeError):
            continue
        durations.setdefault(ev.module, []).append(secs)
    avg_durations = [
        {"module": m, "avg_seconds": round(sum(v) / len(v))}
        for m, v in sorted(durations.items(), key=lambda kv: -sum(kv[1]))
    ]

    # 设备占比
    device_rows = (
        db.query(UsageEvent.device, func.count(UsageEvent.id))
        .filter(UsageEvent.created_at >= since)
        .group_by(UsageEvent.device)
        .all()
    )
    by_device = [{"device": d or "unknown", "count": c} for d, c in device_rows]

    return {
        "days": days,
        "total_events": total_events,
        "total_users": total_users,
        "by_module": by_module,
        "daily": daily,
        "top_actions": top_actions,
        "avg_durations": avg_durations,
        "by_device": by_device,
    }


@router.get("/llm-usage", response_model=dict)
async def llm_usage_summary(
    days: int = 7,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """LLM 调用用量汇总（仅教师）：按业务接口统计次数与 tokens 消耗"""
    if user.role != "teacher":
        raise HTTPException(403, "仅教师可查看 AI 用量")

    from app.models.llm_usage import LLMUsageLog

    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(
            LLMUsageLog.tag,
            func.count(LLMUsageLog.id),
            func.sum(LLMUsageLog.prompt_tokens),
            func.sum(LLMUsageLog.completion_tokens),
            func.sum(LLMUsageLog.cache_hit_tokens),
            func.sum(LLMUsageLog.cache_miss_tokens),
        )
        .filter(LLMUsageLog.created_at >= since)
        .group_by(LLMUsageLog.tag)
        .order_by(func.sum(LLMUsageLog.prompt_tokens).desc())
        .all()
    )

    by_tag = [
        {
            "tag": t or "unknown",
            "calls": n,
            "prompt_tokens": p or 0,
            "completion_tokens": c or 0,
            "cache_hit_tokens": h or 0,
            "cache_miss_tokens": m or 0,
        }
        for t, n, p, c, h, m in rows
    ]

    # 按天汇总（观察趋势）
    daily_rows = (
        db.query(
            func.date(LLMUsageLog.created_at),
            func.count(LLMUsageLog.id),
            func.sum(LLMUsageLog.prompt_tokens),
            func.sum(LLMUsageLog.completion_tokens),
        )
        .filter(LLMUsageLog.created_at >= since)
        .group_by(func.date(LLMUsageLog.created_at))
        .all()
    )
    daily = [
        {"date": str(d), "calls": n, "prompt_tokens": p or 0, "completion_tokens": c or 0}
        for d, n, p, c in daily_rows
    ]

    return {"days": days, "by_tag": by_tag, "daily": daily}
