"""班级学情分析服务：从各类练习记录聚合学生与班级维度的真实学情数据。

数据来源：
- LearningStats     按天聚合（module / study_time / exercise_count / avg_score）
- WritingSubmission 作文提交（overall_score / scores / error_details）
- SpeakingRecord    口语记录（overall_score / scores / duration / type）
- ReadingExercise   阅读练习（comprehension_score / time_spent）
- ClassMember       班级成员关系
- Assignment        作业

设计原则：所有指标均来自真实记录，无数据时明确返回 0 / 空，
不做任何推测填充，避免教师依据虚假数据决策。
"""

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.teacher import Class, ClassMember, Assignment, ClassroomSpeakingScore
from app.models.community import LearningStats
from app.models.writing import WritingSubmission
from app.models.speaking import SpeakingRecord
from app.models.reading import ReadingExercise

MODULES = ["listening", "speaking", "reading", "writing", "vocabulary", "translation"]

MODULE_LABELS = {
    "listening": "听力",
    "speaking": "口语",
    "reading": "阅读",
    "writing": "写作",
    "vocabulary": "词汇语法",
    "translation": "翻译",
}


def _avg(values: list[float]) -> float:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else 0.0


def _score_band(score: float) -> str:
    """把分数映射为水平档位"""
    if score <= 0:
        return "无数据"
    if score >= 85:
        return "优秀"
    if score >= 70:
        return "良好"
    if score >= 60:
        return "及格"
    return "待提升"


def collect_student_profile(student: User, db: Session, days: int = 30) -> dict:
    """采集单个学生的学情画像（近 N 天）"""
    since_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    since_dt = datetime.utcnow() - timedelta(days=days)

    # 1) 按模块聚合学习统计
    stats = db.query(LearningStats).filter(
        LearningStats.user_id == student.id,
        LearningStats.date >= since_date,
    ).all()

    module_stats = {}
    for mod in MODULES:
        rows = [s for s in stats if s.module == mod]
        module_stats[mod] = {
            "module": mod,
            "label": MODULE_LABELS.get(mod, mod),
            "study_time": sum(r.study_time or 0 for r in rows),
            "exercise_count": sum(r.exercise_count or 0 for r in rows),
            "avg_score": _avg([r.avg_score for r in rows if r.avg_score]),
            "active_days": len({r.date for r in rows if (r.exercise_count or 0) > 0}),
        }

    total_time = sum(v["study_time"] for v in module_stats.values())
    total_exercises = sum(v["exercise_count"] for v in module_stats.values())
    scored_modules = [v for v in module_stats.values() if v["avg_score"] > 0]
    overall_avg = _avg([v["avg_score"] for v in scored_modules])

    # 2) 写作明细：维度均分 + 高频错误类型
    # 注意：WritingSubmission 的时间字段是 submitted_at（非 created_at）
    writings = db.query(WritingSubmission).filter(
        WritingSubmission.user_id == student.id,
        WritingSubmission.submitted_at >= since_dt,
    ).order_by(WritingSubmission.submitted_at.desc()).all()

    writing_dimensions = {}
    error_type_count = {}
    import json as _json
    for w in writings:
        try:
            scores = _json.loads(w.scores or "[]")
        except Exception:
            scores = []
        for d in scores:
            name = d.get("name") or "未命名维度"
            ms = d.get("maxScore") or 100
            try:
                val = float(d.get("score") or 0)
            except Exception:
                val = 0.0
            pct = (val / ms * 100) if ms else 0.0
            writing_dimensions.setdefault(name, []).append(pct)
        try:
            errs = _json.loads(w.error_details or "[]")
        except Exception:
            errs = []
        for e in errs:
            et = (e.get("error_type") or "other").lower()
            error_type_count[et] = error_type_count.get(et, 0) + 1

    writing_dim_avg = [
        {"dimension": k, "score": _avg(v), "samples": len(v)}
        for k, v in writing_dimensions.items()
    ]
    writing_dim_avg.sort(key=lambda x: x["score"])

    # 3) 口语明细：按类型均分
    speakings = db.query(SpeakingRecord).filter(
        SpeakingRecord.user_id == student.id,
        SpeakingRecord.created_at >= since_dt,
    ).order_by(SpeakingRecord.created_at.desc()).all()

    speaking_by_type = {}
    for s in speakings:
        t = s.type or "other"
        speaking_by_type.setdefault(t, []).append(s.overall_score or 0)
    speaking_summary = [
        {"type": k, "avg_score": _avg(v), "count": len(v)}
        for k, v in speaking_by_type.items()
    ]

    # 4) 阅读
    readings = db.query(ReadingExercise).filter(
        ReadingExercise.user_id == student.id,
        ReadingExercise.completed_at >= since_dt,
    ).all()
    reading_summary = {
        "count": len(readings),
        "avg_score": _avg([r.comprehension_score for r in readings if r.comprehension_score]),
        "avg_time_sec": round(
            sum(r.time_spent or 0 for r in readings) / len(readings)
        ) if readings else 0,
    }

    # 5) 薄弱模块识别（有成绩数据、平均分低于 70 的模块，按分数升序）
    weak_modules = [
        {"module": v["module"], "label": v["label"], "avg_score": v["avg_score"], "exercise_count": v["exercise_count"]}
        for v in module_stats.values()
        if v["avg_score"] > 0 and v["avg_score"] < 70
    ]
    weak_modules.sort(key=lambda x: x["avg_score"])

    # 6) 强势模块（>=85）
    strong_modules = [
        {"module": v["module"], "label": v["label"], "avg_score": v["avg_score"]}
        for v in module_stats.values()
        if v["avg_score"] >= 85
    ]
    strong_modules.sort(key=lambda x: -x["avg_score"])

    return {
        "student_id": student.id,
        "name": student.display_name,
        "username": student.username,
        "avatar": student.avatar or "",
        "level": student.level,
        "total_points": student.total_points or 0,
        "streak": student.streak or 0,
        "joined_at": student.joined_at.isoformat() if student.joined_at else "",
        "period_days": days,
        "summary": {
            "total_time": total_time,
            "total_exercises": total_exercises,
            "overall_avg": overall_avg,
            "level_band": _score_band(overall_avg),
            "has_data": total_exercises > 0,
        },
        "module_stats": list(module_stats.values()),
        "weak_modules": weak_modules,
        "strong_modules": strong_modules,
        "writing": {
            "count": len(writings),
            "avg_score": _avg([w.overall_score for w in writings if w.overall_score]),
            "dimensions": writing_dim_avg,
            "error_types": sorted(
                [{"type": k, "count": v} for k, v in error_type_count.items()],
                key=lambda x: -x["count"],
            ),
        },
        "speaking": {
            "count": len(speakings),
            "avg_score": _avg([s.overall_score for s in speakings if s.overall_score]),
            "avg_duration": round(sum(s.duration or 0 for s in speakings) / len(speakings)) if speakings else 0,
            "by_type": speaking_summary,
        },
        "reading": reading_summary,
    }


def collect_class_overview(class_obj: Class, db: Session, days: int = 30) -> dict:
    """采集班级整体学情（近 N 天）"""
    members = db.query(ClassMember).filter(ClassMember.class_id == class_obj.id).all()
    students = [db.query(User).filter(User.id == m.user_id).first() for m in members]
    students = [s for s in students if s]

    profiles = [collect_student_profile(s, db, days) for s in students]

    since_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    student_ids = [s.id for s in students]

    # 班级各模块均分
    module_scores = []
    for mod in MODULES:
        if not student_ids:
            module_scores.append({"module": mod, "label": MODULE_LABELS.get(mod, mod), "avg_score": 0, "study_time": 0})
            continue
        rows = db.query(LearningStats).filter(
            LearningStats.user_id.in_(student_ids),
            LearningStats.module == mod,
            LearningStats.date >= since_date,
        ).all()
        module_scores.append({
            "module": mod,
            "label": MODULE_LABELS.get(mod, mod),
            "avg_score": _avg([r.avg_score for r in rows if r.avg_score]),
            "study_time": sum(r.study_time or 0 for r in rows),
            "exercise_count": sum(r.exercise_count or 0 for r in rows),
        })

    # 班级共性薄弱模块（均分 < 70 且有数据）
    class_weak = [m for m in module_scores if 0 < m["avg_score"] < 70]
    class_weak.sort(key=lambda x: x["avg_score"])

    # 需要关注的学生：无数据 或 均分 < 60 或 长时间未练习
    need_attention = []
    for p in profiles:
        reasons = []
        avg = p["summary"]["overall_avg"]
        if not p["summary"]["has_data"]:
            reasons.append("近 %d 天无练习记录" % days)
        else:
            if avg < 60:
                reasons.append("综合均分偏低（%.1f）" % avg)
            if p["summary"]["total_time"] < 30:
                reasons.append("练习时长不足（%d 分钟）" % p["summary"]["total_time"])
            if len(p["weak_modules"]) >= 3:
                reasons.append("薄弱模块达 %d 个" % len(p["weak_modules"]))
        if reasons:
            need_attention.append({
                "student_id": p["student_id"],
                "name": p["name"],
                "avatar": p["avatar"],
                "overall_avg": avg,
                "total_time": p["summary"]["total_time"],
                "reasons": reasons,
            })

    # 优秀学生（均分 >= 85）
    top_students = [
        {"student_id": p["student_id"], "name": p["name"], "avatar": p["avatar"],
         "overall_avg": p["summary"]["overall_avg"], "total_time": p["summary"]["total_time"]}
        for p in profiles if p["summary"]["overall_avg"] >= 85
    ]
    top_students.sort(key=lambda x: -x["overall_avg"])

    # 成绩分布
    bands = {"90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "60以下": 0, "无数据": 0}
    for p in profiles:
        avg = p["summary"]["overall_avg"]
        if not p["summary"]["has_data"]:
            bands["无数据"] += 1
        elif avg >= 90:
            bands["90-100"] += 1
        elif avg >= 80:
            bands["80-89"] += 1
        elif avg >= 70:
            bands["70-79"] += 1
        elif avg >= 60:
            bands["60-69"] += 1
        else:
            bands["60以下"] += 1

    # 作业完成情况
    assignments = db.query(Assignment).filter(Assignment.class_id == class_obj.id).all()

    total_time = sum(p["summary"]["total_time"] for p in profiles)
    total_exercises = sum(p["summary"]["total_exercises"] for p in profiles)

    return {
        "class_id": class_obj.id,
        "class_name": class_obj.name,
        "period_days": days,
        "student_count": len(students),
        "active_student_count": len([p for p in profiles if p["summary"]["has_data"]]),
        "summary": {
            "total_time": total_time,
            "total_exercises": total_exercises,
            "class_avg": _avg([p["summary"]["overall_avg"] for p in profiles if p["summary"]["has_data"]]),
            "avg_time_per_student": round(total_time / len(students)) if students else 0,
            "assignment_count": len(assignments),
        },
        "module_scores": module_scores,
        "class_weak_modules": class_weak,
        "score_bands": [{"band": k, "count": v} for k, v in bands.items()],
        "need_attention": need_attention,
        "top_students": top_students,
        "students": profiles,
    }
