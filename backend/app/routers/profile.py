"""学习档案与 AI 助教路由"""

import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
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
