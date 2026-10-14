"""学习档案与 AI 助教路由"""

import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User, PracticeSession
from app.models.community import LearningStats
from app.models.writing import WritingSubmission
from app.models.speaking import SpeakingRecord
from app.models.reading import ReadingExercise
from app.models.listening import ListeningExercise
from app.auth.security import get_current_user
from app.services.llm_service import recommend_learning_path, chat_with_ai_assistant

router = APIRouter(prefix="/api/profile", tags=["学习档案与AI助教"])


@router.get("/stats", response_model=dict)
async def get_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """获取学习统计"""
    # 最近7天进度
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    stats = db.query(LearningStats).filter(
        LearningStats.user_id == user.id,
        LearningStats.date >= seven_days_ago.strftime("%Y-%m-%d"),
    ).all()

    weekly = {}
    for s in stats:
        if s.date not in weekly:
            weekly[s.date] = {"minutes": 0, "score": 0, "count": 0}
        weekly[s.date]["minutes"] += s.study_time
        weekly[s.date]["score"] += s.avg_score
        weekly[s.date]["count"] += 1

    weekly_progress = [
        {"date": date, "minutes": v["minutes"], "score": v["score"] / v["count"] if v["count"] else 0}
        for date, v in sorted(weekly.items())
    ]

    # 能力雷达
    modules = ["listening", "speaking", "reading", "writing", "vocabulary", "translation"]
    ability_radar = []
    for mod in modules:
        mod_stats = db.query(LearningStats).filter(
            LearningStats.user_id == user.id,
            LearningStats.module == mod,
        ).all()
        avg = sum(s.avg_score for s in mod_stats) / len(mod_stats) if mod_stats else 0
        ability_radar.append({"subject": mod, "score": round(avg, 1)})

    # 薄弱点
    weak_points = [a["subject"] for a in sorted(ability_radar, key=lambda x: x["score"])[:3] if a["score"] < 70]

    # 总学习时间
    total_time = db.query(func.sum(LearningStats.study_time)).filter(
        LearningStats.user_id == user.id,
    ).scalar() or 0

    # 总练习数
    total_exercises = db.query(LearningStats).filter(
        LearningStats.user_id == user.id,
    ).count()

    return {
        "total_study_time": total_time,
        "total_exercises": total_exercises,
        "weekly_progress": weekly_progress,
        "ability_radar": ability_radar,
        "weak_points": weak_points,
        "streak": user.streak,
    }


@router.get("/recent-activities", response_model=list[dict])
async def get_recent_activities(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """最近活动"""
    activities = []

    # 写作
    writings = db.query(WritingSubmission).filter(
        WritingSubmission.user_id == user.id,
    ).order_by(WritingSubmission.submitted_at.desc()).limit(5).all()
    for w in writings:
        activities.append({
            "module": "writing",
            "title": w.title,
            "score": w.overall_score,
            "time": w.submitted_at.isoformat() if w.submitted_at else "",
        })

    # 口语
    speakings = db.query(SpeakingRecord).filter(
        SpeakingRecord.user_id == user.id,
    ).order_by(SpeakingRecord.created_at.desc()).limit(5).all()
    for s in speakings:
        activities.append({
            "module": "speaking",
            "title": s.topic,
            "score": s.overall_score,
            "time": s.created_at.isoformat() if s.created_at else "",
        })

    # 按时间排序
    activities.sort(key=lambda x: x["time"], reverse=True)
    return activities[:10]


@router.get("/learning-path", response_model=dict)
async def get_learning_path(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI 学习路径推荐"""
    # 获取能力数据
    stats = await get_stats(db, user)
    activities = await get_recent_activities(db, user)

    result = await recommend_learning_path(
        stats["ability_radar"],
        stats["weak_points"],
        activities,
    )
    return result


# ========== AI 助教 ==========

@router.post("/ai-assistant", response_model=dict)
async def ai_assistant(message: str, context: str = "", user: User = Depends(get_current_user)):
    """AI 助教对话"""
    reply = await chat_with_ai_assistant(message, context)
    return {"reply": reply, "user": user.display_name}


# ========== 练习时长统计（兰天童 2026-10-10 反馈）==========
# 口径：一次练习 = 前端进入练习页 start、离开或完成时 end 生成的一条记录。
# 前端上报 duration（秒），后端做合理性钳制后落库，避免异常值污染统计。

_MODULE_LABELS = {
    "listening": "听力",
    "speaking": "口语",
    "reading": "阅读",
    "writing": "写作",
    "vocabulary": "词汇语法",
    "translation": "翻译",
    "conversation": "人机对话",
}


def _clamp_duration(d: int) -> int:
    """时长合理性钳制：负值归零，超过 4 小时按 4 小时封顶"""
    try:
        d = int(d or 0)
    except Exception:
        return 0
    if d < 0:
        return 0
    return min(d, 14400)


@router.post("/practice/start", response_model=dict)
async def practice_start(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """开始一次练习计时（前端进入练习页时调用）"""
    module = str(payload.get("module") or "").strip()[:30]
    sub_type = str(payload.get("sub_type") or "").strip()[:50]
    if not module:
        return {"session_id": "", "started_at": "", "ok": False, "reason": "缺少 module"}

    sess = PracticeSession(
        user_id=user.id,
        module=module,
        sub_type=sub_type,
        started_at=datetime.utcnow(),
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return {
        "ok": True,
        "session_id": sess.id,
        "started_at": sess.started_at.isoformat() if sess.started_at else "",
    }


@router.post("/practice/end", response_model=dict)
async def practice_end(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """结束一次练习计时并写入时长（前端离开页面或完成练习时调用）"""
    session_id = str(payload.get("session_id") or "").strip()
    module = str(payload.get("module") or "").strip()[:30]
    sub_type = str(payload.get("sub_type") or "").strip()[:50]
    duration = _clamp_duration(payload.get("duration") or 0)

    sess = None
    if session_id:
        sess = db.query(PracticeSession).filter(
            PracticeSession.id == session_id,
            PracticeSession.user_id == user.id,
        ).first()

    if sess is None:
        # 未拿到 session_id（如页面被刷新）：直接落一条完整记录，不丢数据
        if not module:
            return {"ok": False, "reason": "缺少 session_id 与 module"}
        sess = PracticeSession(user_id=user.id, module=module, sub_type=sub_type)

    sess.duration_seconds = duration
    sess.ended_at = datetime.utcnow()
    db.add(sess)
    db.commit()

    total = db.query(func.coalesce(func.sum(PracticeSession.duration_seconds), 0)).filter(
        PracticeSession.user_id == user.id,
        PracticeSession.module == sess.module,
    ).scalar() or 0
    cnt = db.query(func.count(PracticeSession.id)).filter(
        PracticeSession.user_id == user.id,
        PracticeSession.module == sess.module,
    ).scalar() or 0

    return {
        "ok": True,
        "duration": duration,
        "module": sess.module,
        "total_duration": int(total),
        "total_count": int(cnt),
    }


@router.get("/practice-stats", response_model=dict)
async def practice_stats(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """各模块练习时长统计（学习档案页展示用）"""
    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(
            PracticeSession.module,
            func.coalesce(func.sum(PracticeSession.duration_seconds), 0).label("total"),
            func.count(PracticeSession.id).label("cnt"),
        )
        .filter(
            PracticeSession.user_id == user.id,
            PracticeSession.started_at >= since,
        )
        .group_by(PracticeSession.module)
        .all()
    )

    by_module = []
    grand_total = 0
    grand_cnt = 0
    for m, total, cnt in rows:
        total = int(total or 0)
        cnt = int(cnt or 0)
        grand_total += total
        grand_cnt += cnt
        by_module.append({
            "module": m,
            "label": _MODULE_LABELS.get(m, m),
            "total_seconds": total,
            "total_minutes": round(total / 60, 1),
            "count": cnt,
            "avg_seconds": int(total / cnt) if cnt else 0,
        })
    by_module.sort(key=lambda x: x["total_seconds"], reverse=True)

    # 近 7 天趋势（按天聚合，便于画折线）
    trend_start = datetime.utcnow() - timedelta(days=7)
    trend_rows = (
        db.query(
            func.date(PracticeSession.started_at).label("d"),
            func.coalesce(func.sum(PracticeSession.duration_seconds), 0).label("total"),
        )
        .filter(
            PracticeSession.user_id == user.id,
            PracticeSession.started_at >= trend_start,
        )
        .group_by(func.date(PracticeSession.started_at))
        .all()
    )
    trend_map = {}
    for d, total in trend_rows:
        key = d.isoformat() if hasattr(d, "isoformat") else str(d)
        trend_map[key] = int(total or 0)
    trend = []
    for i in range(6, -1, -1):
        day = (datetime.utcnow() - timedelta(days=i)).date().isoformat()
        trend.append({"date": day, "seconds": trend_map.get(day, 0)})

    return {
        "days": days,
        "total_seconds": grand_total,
        "total_minutes": round(grand_total / 60, 1),
        "total_hours": round(grand_total / 3600, 2),
        "total_count": grand_cnt,
        "by_module": by_module,
        "trend": trend,
    }


@router.get("/practice-sessions", response_model=list[dict])
async def practice_sessions(
    module: str = Query(""),
    limit: int = Query(50, ge=1, le=300),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """练习时长明细（用于核对与排查）"""
    q = db.query(PracticeSession).filter(PracticeSession.user_id == user.id)
    if module:
        q = q.filter(PracticeSession.module == module)
    rows = q.order_by(PracticeSession.started_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "module": r.module,
            "label": _MODULE_LABELS.get(r.module, r.module),
            "sub_type": r.sub_type or "",
            "duration_seconds": r.duration_seconds or 0,
            "duration_minutes": round((r.duration_seconds or 0) / 60, 1),
            "started_at": r.started_at.isoformat() if r.started_at else "",
            "ended_at": r.ended_at.isoformat() if r.ended_at else "",
        }
        for r in rows
    ]
