"""学生端班级路由：凭邀请码加入班级、查看我的班级、退出班级"""

import secrets
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.teacher import Class, ClassMember, Assignment
from app.auth.security import get_current_user

router = APIRouter(prefix="/api/classroom", tags=["学生班级"])


def _serialize_class(cls: Class, db: Session, teacher_name: str = "") -> dict:
    member_count = db.query(ClassMember).filter(ClassMember.class_id == cls.id).count()
    assignment_count = db.query(Assignment).filter(Assignment.class_id == cls.id).count()
    return {
        "id": cls.id,
        "name": cls.name,
        "description": cls.description or "",
        "invite_code": cls.invite_code,
        "teacher_name": teacher_name,
        "member_count": member_count,
        "assignment_count": assignment_count,
        "created_at": cls.created_at.isoformat() if cls.created_at else "",
    }


class JoinPayload(BaseModel):
    invite_code: str = ""


@router.post("/join", response_model=dict)
async def join_class(
    invite_code: str = "",
    payload: JoinPayload | None = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """凭邀请码加入班级（兼容 JSON body 与 query 参数）"""
    if payload and payload.invite_code:
        invite_code = payload.invite_code
    code = (invite_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="请输入邀请码")

    cls = db.query(Class).filter(Class.invite_code == code).first()
    if not cls:
        raise HTTPException(status_code=404, detail="邀请码无效，请向老师确认后重试")

    existing = db.query(ClassMember).filter(
        ClassMember.class_id == cls.id,
        ClassMember.user_id == user.id,
    ).first()
    if existing:
        return {
            "id": cls.id,
            "name": cls.name,
            "already_member": True,
            "message": f"你已在该班级中（{cls.name}）",
        }

    member = ClassMember(class_id=cls.id, user_id=user.id)
    db.add(member)
    db.commit()

    teacher = db.query(User).filter(User.id == cls.teacher_id).first()
    return {
        "id": cls.id,
        "name": cls.name,
        "already_member": False,
        "teacher_name": teacher.display_name if teacher else "",
        "message": f"已成功加入「{cls.name}」",
    }


@router.get("/my-classes", response_model=list[dict])
async def my_classes(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """查看我加入的全部班级"""
    members = db.query(ClassMember).filter(ClassMember.user_id == user.id).all()
    result = []
    for m in members:
        cls = db.query(Class).filter(Class.id == m.class_id).first()
        if not cls:
            continue
        teacher = db.query(User).filter(User.id == cls.teacher_id).first()
        item = _serialize_class(cls, db, teacher.display_name if teacher else "")
        item["joined_at"] = m.joined_at.isoformat() if m.joined_at else ""
        result.append(item)
    return result


@router.get("/my-assignments", response_model=list[dict])
async def my_assignments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """查看我已加入班级的全部作业"""
    class_ids = [
        m.class_id for m in db.query(ClassMember).filter(ClassMember.user_id == user.id).all()
    ]
    if not class_ids:
        return []

    assignments = db.query(Assignment).filter(Assignment.class_id.in_(class_ids)).all()
    result = []
    for a in assignments:
        cls = db.query(Class).filter(Class.id == a.class_id).first()
        result.append({
            "id": a.id,
            "class_id": a.class_id,
            "class_name": cls.name if cls else "",
            "title": a.title,
            "description": a.description or "",
            "module": a.module,
            "difficulty": a.difficulty,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        })
    result.sort(key=lambda x: x["created_at"], reverse=True)
    return result


@router.delete("/leave/{class_id}", response_model=dict)
async def leave_class(class_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """退出班级"""
    member = db.query(ClassMember).filter(
        ClassMember.class_id == class_id,
        ClassMember.user_id == user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="你不在该班级中")
    db.delete(member)
    db.commit()
    return {"id": class_id, "message": "已退出该班级"}
