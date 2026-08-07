"""社区模块路由 — 学习小组 / 排行榜 / 成就"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.community import StudyGroup, StudyGroupMember, Achievement, LearningStats
from app.auth.security import get_current_user
from app.schemas.community import StudyGroupCreate, StudyGroupResponse, AchievementResponse

router = APIRouter(prefix="/api/community", tags=["社区模块"])


# ========== 学习小组 ==========

@router.get("/groups", response_model=list[StudyGroupResponse])
async def list_groups(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    groups = db.query(StudyGroup).order_by(StudyGroup.created_at.desc()).all()
    result = []
    for g in groups:
        joined = db.query(StudyGroupMember).filter(
            StudyGroupMember.group_id == g.id,
            StudyGroupMember.user_id == user.id,
        ).first() is not None
        result.append(_group_to_response(g, joined))
    return result


@router.post("/groups", response_model=StudyGroupResponse)
async def create_group(req: StudyGroupCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    group = StudyGroup(
        name=req.name,
        description=req.description,
        category=req.category,
        max_members=req.max_members,
        creator_id=user.id,
    )
    db.add(group)
    db.flush()
    member = StudyGroupMember(group_id=group.id, user_id=user.id)
    db.add(member)
    db.commit()
    db.refresh(group)
    return _group_to_response(group, True)


@router.post("/groups/{group_id}/join", response_model=StudyGroupResponse)
async def join_group(group_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(404, "小组不存在")
    if group.member_count >= group.max_members:
        raise HTTPException(400, "小组已满")

    existing = db.query(StudyGroupMember).filter(
        StudyGroupMember.group_id == group_id,
        StudyGroupMember.user_id == user.id,
    ).first()
    if existing:
        raise HTTPException(400, "已加入该小组")

    member = StudyGroupMember(group_id=group_id, user_id=user.id)
    db.add(member)
    group.member_count += 1
    db.commit()
    db.refresh(group)
    return _group_to_response(group, True)


# ========== 排行榜 ==========

@router.get("/leaderboard", response_model=list[dict])
async def get_leaderboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    users = db.query(User).filter(
        User.role == "student",
        User.is_active == True,
    ).order_by(User.total_points.desc()).limit(50).all()
    return [
        {
            "rank": i + 1,
            "user_id": u.id,
            "name": u.display_name,
            "avatar": u.avatar or "",
            "total_points": u.total_points,
            "streak": u.streak,
            "level": u.level,
        }
        for i, u in enumerate(users)
    ]


# ========== 成就系统 ==========

@router.get("/achievements", response_model=list[AchievementResponse])
async def get_achievements(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.query(Achievement).filter(Achievement.user_id == user.id).all()
    return [_achievement_to_response(a) for a in items]


def _group_to_response(g: StudyGroup, joined: bool) -> StudyGroupResponse:
    return StudyGroupResponse(
        id=g.id,
        name=g.name,
        description=g.description or "",
        category=g.category,
        member_count=g.member_count,
        max_members=g.max_members,
        creator_id=g.creator_id,
        created_at=g.created_at.isoformat() if g.created_at else "",
        joined=joined,
    )


def _achievement_to_response(a: Achievement) -> AchievementResponse:
    return AchievementResponse(
        id=a.id,
        title=a.title,
        description=a.description or "",
        icon=a.icon,
        progress=a.progress,
        target=a.target,
        unlocked_at=a.unlocked_at.isoformat() if a.unlocked_at else None,
    )
