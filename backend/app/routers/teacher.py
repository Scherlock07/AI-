"""教师后台路由"""

import json
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.teacher import Class, ClassMember, Assignment, ClassroomSpeakingScore
from app.auth.security import get_current_user, require_teacher

router = APIRouter(prefix="/api/teacher", tags=["教师后台"])


def _get_owned_class(class_id: str, user: User, db: Session) -> Class:
    """获取班级并校验归属（防止跨教师越权操作）"""
    cls = db.query(Class).filter(Class.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")
    if cls.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="无权操作该班级")
    return cls


# ========== 班级管理 ==========

@router.post("/classes", response_model=dict)
async def create_class(name: str, description: str = "", db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    clean_name = (name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="班级名称不能为空")
    if len(clean_name) > 50:
        raise HTTPException(status_code=400, detail="班级名称不能超过 50 个字符")
    dup = db.query(Class).filter(Class.teacher_id == user.id, Class.name == clean_name).first()
    if dup:
        raise HTTPException(status_code=409, detail="已存在同名班级，请换一个名称")

    # 生成全局唯一邀请码
    invite_code = ""
    for _ in range(10):
        candidate = secrets.token_hex(4).upper()
        if not db.query(Class).filter(Class.invite_code == candidate).first():
            invite_code = candidate
            break
    if not invite_code:
        raise HTTPException(status_code=500, detail="邀请码生成失败，请重试")

    cls = Class(
        name=clean_name,
        description=description,
        teacher_id=user.id,
        invite_code=invite_code,
    )
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return {
        "id": cls.id,
        "name": cls.name,
        "description": cls.description,
        "invite_code": cls.invite_code,
    }


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
    cls = _get_owned_class(class_id, user, db)
    members = db.query(ClassMember).filter(ClassMember.class_id == cls.id).all()
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


@router.put("/classes/{class_id}", response_model=dict)
async def update_class(
    class_id: str, name: str = "", description: str = "",
    db: Session = Depends(get_db), user: User = Depends(require_teacher),
):
    """修改班级名称与简介（仅班主任可操作）"""
    cls = _get_owned_class(class_id, user, db)

    new_name = (name or "").strip()
    if name is not None and name != "" and not new_name:
        raise HTTPException(status_code=400, detail="班级名称不能为空白字符")
    if new_name:
        if len(new_name) > 50:
            raise HTTPException(status_code=400, detail="班级名称不能超过 50 个字符")
        # 同一教师下不允许重名
        dup = db.query(Class).filter(
            Class.teacher_id == user.id,
            Class.name == new_name,
            Class.id != cls.id,
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="已存在同名班级，请换一个名称")
        cls.name = new_name

    if description is not None and description != "":
        cls.description = description.strip()[:500]

    db.commit()
    db.refresh(cls)
    return {
        "id": cls.id,
        "name": cls.name,
        "description": cls.description,
        "invite_code": cls.invite_code,
        "message": "班级信息已更新",
    }


@router.post("/classes/{class_id}/invite-code", response_model=dict)
async def regenerate_invite_code(class_id: str, db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    """重新生成邀请码（原邀请码立即失效）"""
    cls = _get_owned_class(class_id, user, db)
    for _ in range(10):
        code = secrets.token_hex(4).upper()
        if not db.query(Class).filter(Class.invite_code == code).first():
            cls.invite_code = code
            db.commit()
            db.refresh(cls)
            return {"id": cls.id, "invite_code": cls.invite_code, "message": "邀请码已重置，原邀请码失效"}
    raise HTTPException(status_code=500, detail="邀请码生成失败，请重试")


@router.delete("/classes/{class_id}", response_model=dict)
async def delete_class(class_id: str, db: Session = Depends(get_db), user: User = Depends(require_teacher)):
    """解散班级，并清理成员、作业、课堂评分等关联数据"""
    cls = _get_owned_class(class_id, user, db)

    db.query(ClassMember).filter(ClassMember.class_id == cls.id).delete(synchronize_session=False)
    db.query(Assignment).filter(Assignment.class_id == cls.id).delete(synchronize_session=False)
    db.query(ClassroomSpeakingScore).filter(ClassroomSpeakingScore.class_id == cls.id).delete(synchronize_session=False)
    db.delete(cls)
    db.commit()
    return {"id": class_id, "message": "班级已解散"}


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


# ========== 学情分析 ==========

@router.get("/classes/{class_id}/overview", response_model=dict)
async def class_overview(
    class_id: str, days: int = 30,
    db: Session = Depends(get_db), user: User = Depends(require_teacher),
):
    """班级学情总览：各模块均分、成绩分布、预警学生、优秀学生、学生明细"""
    cls = _get_owned_class(class_id, user, db)
    days = max(7, min(days, 180))
    from app.services.analytics_service import collect_class_overview
    return collect_class_overview(cls, db, days)


@router.get("/students/{student_id}/profile", response_model=dict)
async def student_profile(
    student_id: str, class_id: str = "", days: int = 30,
    db: Session = Depends(get_db), user: User = Depends(require_teacher),
):
    """单个学生学情详情。若传 class_id 则校验该生确属此教师名下班级。"""
    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学生不存在")

    # 权限校验：该学生必须至少属于该教师的一个班级
    owned_class_ids = [c.id for c in db.query(Class).filter(Class.teacher_id == user.id).all()]
    if not owned_class_ids:
        raise HTTPException(status_code=403, detail="你还没有创建任何班级")
    if class_id:
        if class_id not in owned_class_ids:
            raise HTTPException(status_code=403, detail="无权查看该班级")
        member = db.query(ClassMember).filter(
            ClassMember.class_id == class_id, ClassMember.user_id == student_id
        ).first()
        if not member:
            raise HTTPException(status_code=404, detail="该学生不在此班级中")
    else:
        member = db.query(ClassMember).filter(
            ClassMember.class_id.in_(owned_class_ids), ClassMember.user_id == student_id
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="该学生不在你的任何班级中")

    days = max(7, min(days, 180))
    from app.services.analytics_service import collect_student_profile
    return collect_student_profile(student, db, days)


@router.post("/classes/{class_id}/analysis-report", response_model=dict)
async def class_analysis_report(
    class_id: str, days: int = 30, focus: str = "", force: bool = False,
    db: Session = Depends(get_db), user: User = Depends(require_teacher),
):
    """生成班级针对性学情分析报告（AI 基于真实数据生成，结果缓存）"""
    cls = _get_owned_class(class_id, user, db)
    days = max(7, min(days, 180))

    from app.services.analytics_service import collect_class_overview
    overview = collect_class_overview(cls, db, days)

    from app.services import llm_service
    report = await llm_service.generate_class_analysis_report(overview, focus=focus)

    return {
        "class_id": cls.id,
        "class_name": cls.name,
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "focus": focus,
        "data_summary": overview.get("summary", {}),
        "report": report,
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
