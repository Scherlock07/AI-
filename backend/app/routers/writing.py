"""写作模块路由"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.writing import WritingSubmission, WritingPeerReview
from app.auth.security import get_current_user
from app.schemas.writing import (
    WritingSubmitRequest, WritingGradeRequest, WritingResponse, WritingGradeResult,
    WritingEnhanceRequest, WritingOcrRequest,
)
from app.services.llm_service import grade_writing, generate_writing_enhancement
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
async def grade_only(req: WritingGradeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI 批改并保存记录（历史记录页可见）"""
    try:
        result = await grade_writing(req.content, req.type, req.prompt, req.title)
    except Exception as e:
        raise HTTPException(500, f"AI 批改失败: {str(e)}")

    # 保存批改记录（历史记录页依赖 /submissions 数据）
    try:
        submission = WritingSubmission(
            user_id=user.id,
            title=req.title or "Untitled",
            type=req.type,
            prompt=req.prompt,
            content=req.content,
            word_count=len(req.content.split()),
            status="completed",
        )
        submission.scores = json.dumps(result.get("scores", []), ensure_ascii=False)
        submission.overall_score = result.get("overall_score", 0)
        submission.ai_feedback = result.get("ai_feedback", "")
        submission.revised_version = result.get("revised_version", "")
        submission.error_details = json.dumps(result.get("error_details", []), ensure_ascii=False)
        submission.completed_at = datetime.utcnow()
        db.add(submission)
        user.total_points += result.get("overall_score", 0)
        db.commit()
    except Exception:
        db.rollback()  # 保存失败不影响批改结果返回

    try:
        return WritingGradeResult(**result)
    except Exception as e:
        raise HTTPException(500, f"结果格式化失败: {str(e)[:500]}\n原始数据keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")


@router.post("/enhance", response_model=dict)
async def enhance_writing(req: WritingEnhanceRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """按需生成"润色范文 + 拓展词汇"

    与 /grade 拆开的原因：这两项输出占写作批改 60% 以上的 token，
    但学生并非每次都需要。改为点击时生成，相同作文复用缓存，不会重复计费。
    """
    try:
        result = await generate_writing_enhancement(req.content, req.type, req.prompt, req.weak_dimensions)
    except Exception as e:
        raise HTTPException(500, f"生成失败: {str(e)}")

    # 回填到最近的同内容批改记录，历史记录页也能看到润色版
    try:
        sub = (
            db.query(WritingSubmission)
            .filter(WritingSubmission.user_id == user.id, WritingSubmission.content == req.content)
            .order_by(WritingSubmission.submitted_at.desc())
            .first()
        )
        if sub:
            sub.revised_version = result.get("revised_version", "")
            sub.topic_vocabulary = json.dumps(result.get("topic_vocabulary", []), ensure_ascii=False)
            db.commit()
    except Exception:
        db.rollback()

    return {
        "revised_version": result.get("revised_version", ""),
        "topic_vocabulary": result.get("topic_vocabulary", []),
    }


@router.post("/ocr", response_model=dict)
async def ocr_handwriting(req: WritingOcrRequest, user: User = Depends(get_current_user)):
    """OCR 识别手写作文（JSON body: {image_base64}）"""
    if not req.image_base64:
        raise HTTPException(400, "缺少图片数据")
    result = await recognize_handwriting(req.image_base64)
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
        error_details=json.loads(s.error_details) if s.error_details else [],
        topic_vocabulary=json.loads(s.topic_vocabulary) if s.topic_vocabulary else [],
        submitted_at=s.submitted_at.isoformat() if s.submitted_at else "",
        completed_at=s.completed_at.isoformat() if s.completed_at else None,
    )
