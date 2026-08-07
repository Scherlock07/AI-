"""翻译模块路由"""

import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.community import TranslationExercise, TranslationRecord
from app.auth.security import get_current_user
from app.schemas.community import TranslationGradeRequest, TranslationGradeResult
from app.services.llm_service import grade_translation

router = APIRouter(prefix="/api/translation", tags=["翻译模块"])


@router.post("/grade", response_model=TranslationGradeResult)
async def grade(req: TranslationGradeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI 翻译评分"""
    result = await grade_translation(req.source_text, req.user_translation, req.direction)

    # 保存记录
    record = TranslationRecord(
        user_id=user.id,
        source_text=req.source_text,
        user_translation=req.user_translation,
        direction=req.direction,
        scores=json.dumps(result.get("scores", []), ensure_ascii=False),
        overall_score=result.get("overall_score", 0),
        reference_translation=result.get("reference_translation", ""),
        improvement_suggestions=result.get("improvement_suggestions", ""),
    )
    db.add(record)
    db.commit()

    user.total_points += result.get("overall_score", 0)
    db.commit()

    return TranslationGradeResult(**result)


@router.get("/records", response_model=list[dict])
async def list_records(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    records = db.query(TranslationRecord).filter(
        TranslationRecord.user_id == user.id
    ).order_by(TranslationRecord.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "source_text": r.source_text,
            "user_translation": r.user_translation,
            "direction": r.direction,
            "scores": json.loads(r.scores) if r.scores else [],
            "overall_score": r.overall_score,
            "reference_translation": r.reference_translation,
            "improvement_suggestions": r.improvement_suggestions,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in records
    ]
