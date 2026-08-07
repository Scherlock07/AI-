"""写作模块路由"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.writing import WritingSubmission, WritingPeerReview
from app.auth.security import get_current_user
from app.schemas.writing import WritingSubmitRequest, WritingGradeRequest, WritingResponse, WritingGradeResult
from app.services.llm_service import grade_writing
from app.services.ocr_service import recognize_handwriting

router = APIRouter(prefix="/api/writing", tags=["写作模块"])


@router.post("/submit", response_model=WritingResponse)
async def submit_writing(req: WritingSubmitRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """提交作文并触发 AI 批改"""
    submission = WritingSubmission(
        user_id=user.id,
        title=req.title,
        type=req.type,
        prompt=req.prompt,
        content=req.content,
        word_count=len(req.content.split()),
        status="reviewing",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # AI 批改
    result = await grade_writing(req.content, req.type, req.prompt, req.title)

    submission.scores = json.dumps(result.get("scores", []), ensure_ascii=False)
    submission.overall_score = result.get("overall_score", 0)
    submission.ai_feedback = result.get("ai_feedback", "")
    submission.revised_version = result.get("revised_version", "")
    submission.error_details = json.dumps(result.get("error_details", []), ensure_ascii=False)
    submission.status = "completed"
    submission.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(submission)

    # 更新积分
    user.total_points += result.get("overall_score", 0)
    db.commit()

    return _to_response(submission)


@router.post("/grade", response_model=WritingGradeResult)
async def grade_only(req: WritingGradeRequest, user: User = Depends(get_current_user)):
    """仅评分不保存（快速预览）"""
    try:
        result = await grade_writing(req.content, req.type, req.prompt, req.title)
    except Exception as e:
        raise HTTPException(500, f"AI 批改失败: {str(e)}")
    try:
        return WritingGradeResult(**result)
    except Exception as e:
        raise HTTPException(500, f"结果格式化失败: {str(e)[:500]}\n原始数据keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")


@router.post("/ocr", response_model=dict)
async def ocr_handwriting(image_base64: str, user: User = Depends(get_current_user)):
    """OCR 识别手写作文"""
    result = await recognize_handwriting(image_base64)
    return result


@router.get("/submissions", response_model=list[WritingResponse])
async def list_submissions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    submissions = db.query(WritingSubmission).filter(
        WritingSubmission.user_id == user.id
    ).order_by(WritingSubmission.submitted_at.desc()).all()
    return [_to_response(s) for s in submissions]


@router.get("/submissions/{submission_id}", response_model=WritingResponse)
async def get_submission(submission_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    submission = db.query(WritingSubmission).filter(WritingSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "作文不存在")
    return _to_response(submission)


def _to_response(s: WritingSubmission) -> WritingResponse:
    return WritingResponse(
        id=s.id,
        title=s.title,
        type=s.type,
        content=s.content,
        word_count=s.word_count,
        status=s.status,
        scores=json.loads(s.scores) if s.scores else [],
        overall_score=s.overall_score,
        ai_feedback=s.ai_feedback or "",
        revised_version=s.revised_version or "",
        submitted_at=s.submitted_at.isoformat() if s.submitted_at else "",
        completed_at=s.completed_at.isoformat() if s.completed_at else None,
    )
