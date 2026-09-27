"""意见反馈模块路由 — 学生提交反馈 / 教师查看处理"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.community import Feedback
from app.auth.security import get_current_user

router = APIRouter(prefix="/api/feedback", tags=["意见反馈"])

VALID_CATEGORIES = {"bug", "ux", "feature", "content", "other"}
VALID_STATUS = {"pending", "processing", "resolved"}


class FeedbackCreate(BaseModel):
    category: str = Field(..., description="bug/ux/feature/content/other")
    content: str = Field(..., min_length=5, max_length=2000)
    contact: str = Field("", max_length=100)
    page: str = Field("", max_length=200)


class FeedbackUpdate(BaseModel):
    status: str
    reply: str = ""


@router.post("", response_model=dict)
async def submit_feedback(
    req: FeedbackCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """提交意见反馈（已登录用户；device/user_agent 由服务端自动记录）"""
    if req.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"无效的反馈类型: {req.category}")

    ua = request.headers.get("user-agent", "")[:300]
    device = "mobile" if any(k in ua.lower() for k in ("mobile", "android", "iphone", "ipad")) else "desktop"

    fb = Feedback(
        user_id=user.id,
        category=req.category,
        content=req.content,
        contact=req.contact,
        page=req.page,
        user_agent=ua,
        device=device,
    )
    db.add(fb)
    db.commit()
    return {"id": fb.id, "message": "反馈已提交，感谢你的建议！"}


@router.get("", response_model=list[dict])
async def list_feedback(
    status: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """反馈列表（仅教师可查）"""
    if user.role != "teacher":
        raise HTTPException(403, "仅教师可查看反馈列表")

    query = db.query(Feedback)
    if status in VALID_STATUS:
        query = query.filter(Feedback.status == status)
    items = query.order_by(Feedback.created_at.desc()).limit(200).all()

    user_ids = list({f.user_id for f in items if f.user_id})
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    return [
        {
            "id": f.id,
            "category": f.category,
            "content": f.content,
            "contact": f.contact,
            "page": f.page,
            "device": f.device,
            "user_agent": f.user_agent,
            "status": f.status,
            "reply": f.reply,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "user": (
                {"id": users[f.user_id].id, "display_name": users[f.user_id].display_name, "username": users[f.user_id].username}
                if f.user_id and f.user_id in users else None
            ),
        }
        for f in items
    ]


@router.patch("/{feedback_id}", response_model=dict)
async def update_feedback(
    feedback_id: str,
    req: FeedbackUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """更新反馈处理状态（仅教师）"""
    if user.role != "teacher":
        raise HTTPException(403, "仅教师可处理反馈")

    if req.status not in VALID_STATUS:
        raise HTTPException(400, f"无效的状态: {req.status}")

    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(404, "反馈不存在")

    fb.status = req.status
    fb.reply = req.reply
    db.commit()
    return {"id": fb.id, "status": fb.status, "message": "已更新"}
