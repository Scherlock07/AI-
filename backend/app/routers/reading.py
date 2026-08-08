"""阅读模块路由"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.reading import ReadingText, ReadingExercise
from app.auth.security import get_current_user
from app.schemas.reading import (
    ReadingImportRequest, ReadingAnalysisRequest, ReadingAnalysisResult, ReadingTextResponse,
    WordAnalysisRequest, WordAnalysisResult,
    SentenceAnalysisRequest, SentenceAnalysisResult,
)
from app.services.llm_service import analyze_reading, analyze_single_word, analyze_single_sentence

router = APIRouter(prefix="/api/reading", tags=["阅读模块"])


@router.get("/texts", response_model=list[ReadingTextResponse])
async def list_texts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    texts = db.query(ReadingText).order_by(ReadingText.created_at.desc()).all()
    return [_to_response(t) for t in texts]


@router.post("/import", response_model=ReadingTextResponse)
async def import_text(req: ReadingImportRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """手动导入阅读文本"""
    text = ReadingText(
        title=req.title,
        source=req.source,
        content=req.content,
        difficulty=req.difficulty,
        word_count=len(req.content.split()),
        created_by=user.id,
    )
    db.add(text)
    db.commit()
    db.refresh(text)
    return _to_response(text)


@router.post("/analyze", response_model=ReadingAnalysisResult)
async def analyze(req: ReadingAnalysisRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI 阅读分析（实时分析，不保存）"""
    result = await analyze_reading(req.content, req.difficulty)
    return ReadingAnalysisResult(**result)


@router.post("/analyze-word", response_model=WordAnalysisResult)
async def analyze_word(req: WordAnalysisRequest, user: User = Depends(get_current_user)):
    """AI 分析单个单词（在阅读上下文中）"""
    result = await analyze_single_word(req.word, req.context)
    return WordAnalysisResult(**result)


@router.post("/analyze-sentence", response_model=SentenceAnalysisResult)
async def analyze_sentence(req: SentenceAnalysisRequest, user: User = Depends(get_current_user)):
    """AI 分析单个句子（长难句分析）"""
    result = await analyze_single_sentence(req.sentence, req.difficulty)
    return SentenceAnalysisResult(**result)


@router.post("/{text_id}/analyze", response_model=ReadingTextResponse)
async def analyze_and_save(text_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """对已导入文本执行 AI 分析并保存结果"""
    text = db.query(ReadingText).filter(ReadingText.id == text_id).first()
    if not text:
        raise HTTPException(404, "文本不存在")

    result = await analyze_reading(text.content, text.difficulty)
    text.summary = result.get("summary", "")
    text.key_points = json.dumps(result.get("key_points", []), ensure_ascii=False)
    text.structure = json.dumps(result.get("structure", []), ensure_ascii=False)
    text.difficult_sentences = json.dumps(result.get("difficult_sentences", []), ensure_ascii=False)
    text.translation = result.get("translation", "")
    text.cultural_notes = json.dumps(result.get("cultural_notes", []), ensure_ascii=False)
    text.vocabulary = json.dumps(result.get("vocabulary", []), ensure_ascii=False)
    db.commit()
    db.refresh(text)
    return _to_response(text)


@router.get("/{text_id}", response_model=ReadingTextResponse)
async def get_text(text_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    text = db.query(ReadingText).filter(ReadingText.id == text_id).first()
    if not text:
        raise HTTPException(404, "文本不存在")
    return _to_response(text)


def _to_response(t: ReadingText) -> ReadingTextResponse:
    return ReadingTextResponse(
        id=t.id,
        title=t.title,
        source=t.source,
        content=t.content,
        difficulty=t.difficulty,
        word_count=t.word_count,
        summary=t.summary or "",
        key_points=json.loads(t.key_points) if t.key_points else [],
        structure=json.loads(t.structure) if t.structure else [],
        difficult_sentences=json.loads(t.difficult_sentences) if t.difficult_sentences else [],
        translation=t.translation or "",
        cultural_notes=json.loads(t.cultural_notes) if t.cultural_notes else [],
        vocabulary=json.loads(t.vocabulary) if t.vocabulary else [],
        created_at=t.created_at.isoformat() if t.created_at else "",
    )
