"""教师后台路由"""

import json
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.teacher import Class, ClassMember, Assignment, ClassroomSpeakingScore
from app.auth.security import get_current_user, require_teacher

router = APIRouter(prefix="/api/teacher", tags=["教师后台"])


# ========== 班级管理 ==========

@router.post("/classes", response_model=dict)
async def create_class(name: str, description: str = "", db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    invite_code = secrets.token_hex(4).upper()
    cls = Class(
        name=name,
        description=description,
        teacher_id=user.id,
        invite_code=invite_code,
    )
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return {"id": cls.id, "name": cls.name, "invite_code": cls.invite_code}


@router.get("/classes", response_model=list[dict])
async def list_classes(db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    classes = db.query(Class).filter(Class.teacher_id == user.id).all()
    result = []
    for c in classes:
        members = db.query(ClassMember).filter(ClassMember.class_id == c.id).count()
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "invite_code": c.invite_code,
            "member_count": members,
            "created_at": c.created_at.isoformat() if c.created_at else "",
        })
    return result


@router.get("/classes/{class_id}/students", response_model=list[dict])
async def list_class_students(class_id: str, db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    members = db.query(ClassMember).filter(ClassMember.class_id == class_id).all()
    result = []
    for m in members:
        student = db.query(User).filter(User.id == m.user_id).first()
        if student:
            result.append({
                "id": student.id,
                "name": student.display_name,
                "avatar": student.avatar or "",
                "level": student.level,
                "total_points": student.total_points,
                "streak": student.streak,
                "joined_at": m.joined_at.isoformat() if m.joined_at else "",
            })
    return result


@router.get("/classes/{class_id}/stats", response_model=dict)
async def class_stats(class_id: str, db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    """班级统计数据"""
    members = db.query(ClassMember).filter(ClassMember.class_id == class_id).all()
    student_ids = [m.user_id for m in members]

    students = db.query(User).filter(User.id.in_(student_ids)).all() if student_ids else []

    # 能力雷达（按模块统计平均分）
    from app.models.community import LearningStats
    modules = ["listening", "speaking", "reading", "writing", "vocabulary", "translation"]
    radar = []
    for mod in modules:
        records = db.query(LearningStats).filter(
            LearningStats.user_id.in_(student_ids),
            LearningStats.module == mod,
        ).all() if student_ids else []
        avg_score = sum(r.avg_score for r in records) / len(records) if records else 0
        radar.append({"subject": mod, "score": round(avg_score, 1)})

    # 成绩分布
    score_ranges = {"0-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0}
    for s in students:
        if s.total_points < 600:
            score_ranges["0-59"] += 1
        elif s.total_points < 700:
            score_ranges["60-69"] += 1
        elif s.total_points < 800:
            score_ranges["70-79"] += 1
        elif s.total_points < 900:
            score_ranges["80-89"] += 1
        else:
            score_ranges["90-100"] += 1

    return {
        "total_students": len(students),
        "ability_radar": radar,
        "score_distribution": score_ranges,
        "avg_points": sum(s.total_points for s in students) / len(students) if students else 0,
    }


# ========== 作业管理 ==========

@router.post("/assignments", response_model=dict)
async def create_assignment(
    class_id: str, title: str, description: str, module: str,
    difficulty: str = "intermediate", due_date: str = "",
    db: Session = Depends(get_db), user: User = Depends(require_teacher),
):
    from datetime import datetime
    assignment = Assignment(
        class_id=class_id,
        teacher_id=user.id,
        title=title,
        description=description,
        module=module,
        difficulty=difficulty,
        due_date=datetime.fromisoformat(due_date) if due_date else None,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return {"id": assignment.id, "title": assignment.title}


@router.get("/assignments/{class_id}", response_model=list[dict])
async def list_assignments(class_id: str, db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    assignments = db.query(Assignment).filter(Assignment.class_id == class_id).all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "module": a.module,
            "difficulty": a.difficulty,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }
        for a in assignments
    ]


# ========== 课堂口语评分 ==========

@router.post("/speaking-scores", response_model=dict)
async def create_speaking_score(
    class_id: str, student_id: str, topic: str,
    scores: str, overall_score: int, feedback: str = "",
    db: Session = Depends(get_db), user: User = Depends(require_teacher),
):
    record = ClassroomSpeakingScore(
        class_id=class_id,
        student_id=student_id,
        teacher_id=user.id,
        topic=topic,
        scores=scores,
        overall_score=overall_score,
        feedback=feedback,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "message": "评分已提交"}
