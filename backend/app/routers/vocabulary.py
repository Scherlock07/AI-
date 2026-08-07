"""词汇与语法模块路由"""

import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.vocabulary import VocabularyWord, GrammarExercise, GrammarExerciseRecord, WrongAnswer
from app.auth.security import get_current_user
from app.schemas.vocabulary import (
    VocabularyAddRequest, VocabularyWordResponse, VocabularyReviewRequest,
    GrammarGenerateRequest, GrammarExerciseResponse,
    WrongAnswerResponse, RootAnalysisRequest, RootAnalysisResult,
)
from app.services.llm_service import generate_grammar_exercises, analyze_word_root

router = APIRouter(prefix="/api/vocabulary", tags=["词汇与语法模块"])


# ========== 智能词汇本 ==========

@router.get("/words", response_model=list[VocabularyWordResponse])
async def list_words(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    words = db.query(VocabularyWord).filter(
        VocabularyWord.user_id == user.id
    ).order_by(VocabularyWord.added_at.desc()).all()
    return [_word_to_response(w) for w in words]


@router.get("/words/review", response_model=list[VocabularyWordResponse])
async def get_review_words(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """获取今天需要复习的单词（艾宾浩斯）"""
    now = datetime.utcnow()
    words = db.query(VocabularyWord).filter(
        VocabularyWord.user_id == user.id,
        VocabularyWord.next_review <= now,
        VocabularyWord.mastery < 100,
    ).order_by(VocabularyWord.next_review.asc()).all()
    return [_word_to_response(w) for w in words]


@router.post("/words", response_model=VocabularyWordResponse)
async def add_word(req: VocabularyAddRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # 计算首次复习时间（明天）
    next_review = datetime.utcnow() + timedelta(days=1)
    word = VocabularyWord(
        user_id=user.id,
        word=req.word,
        phonetic=req.phonetic,
        part_of_speech=req.part_of_speech,
        definition=req.definition,
        example=req.example,
        context=req.context,
        next_review=next_review,
    )
    db.add(word)
    db.commit()
    db.refresh(word)
    return _word_to_response(word)


@router.post("/words/{word_id}/review", response_model=VocabularyWordResponse)
async def review_word(word_id: str, req: VocabularyReviewRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """复习单词 — 更新艾宾浩斯参数"""
    word = db.query(VocabularyWord).filter(
        VocabularyWord.id == word_id,
        VocabularyWord.user_id == user.id,
    ).first()
    if not word:
        raise HTTPException(404, "单词不存在")

    word.review_count += 1
    word.last_reviewed = datetime.utcnow()

    if req.is_correct:
        word.mastery = min(100, word.mastery + 20)
    else:
        word.mastery = max(0, word.mastery - 10)

    # 艾宾浩斯复习间隔：1, 2, 4, 7, 15, 30 天
    intervals = [1, 2, 4, 7, 15, 30]
    idx = min(word.review_count - 1, len(intervals) - 1)
    word.next_review = datetime.utcnow() + timedelta(days=intervals[idx])

    db.commit()
    db.refresh(word)
    return _word_to_response(word)


@router.delete("/words/{word_id}")
async def delete_word(word_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    word = db.query(VocabularyWord).filter(
        VocabularyWord.id == word_id,
        VocabularyWord.user_id == user.id,
    ).first()
    if not word:
        raise HTTPException(404, "单词不存在")
    db.delete(word)
    db.commit()
    return {"message": "已删除"}


# ========== 词根词缀分析 ==========

@router.post("/root-analysis", response_model=RootAnalysisResult)
async def root_analysis(req: RootAnalysisRequest, user: User = Depends(get_current_user)):
    result = await analyze_word_root(req.word)
    return RootAnalysisResult(**result)


# ========== 语法练习 ==========

@router.post("/grammar/generate", response_model=list[GrammarExerciseResponse])
async def generate_grammar(req: GrammarGenerateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI 生成语法练习题"""
    exercises = await generate_grammar_exercises(req.grammar_point, req.type, req.difficulty, req.count)

    saved = []
    for ex in exercises:
        exercise = GrammarExercise(
            type=ex.get("type", req.type),
            question=ex.get("question", ""),
            options=json.dumps(ex.get("options", []), ensure_ascii=False),
            answer=ex.get("answer", ""),
            explanation=ex.get("explanation", ""),
            grammar_point=ex.get("grammar_point", req.grammar_point),
            difficulty=req.difficulty,
        )
        db.add(exercise)
        db.flush()
        saved.append(_exercise_to_response(exercise))

    db.commit()
    return saved


@router.post("/grammar/{exercise_id}/answer", response_model=dict)
async def answer_grammar(exercise_id: str, answer: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    exercise = db.query(GrammarExercise).filter(GrammarExercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(404, "题目不存在")

    is_correct = answer.strip().lower() == exercise.answer.strip().lower()
    record = GrammarExerciseRecord(
        user_id=user.id,
        exercise_id=exercise_id,
        user_answer=answer,
        is_correct=is_correct,
    )
    db.add(record)

    # 错题加入错题本
    if not is_correct:
        wrong = WrongAnswer(
            user_id=user.id,
            module="vocabulary",
            question=exercise.question,
            user_answer=answer,
            correct_answer=exercise.answer,
            explanation=exercise.explanation,
        )
        db.add(wrong)

    db.commit()
    return {"is_correct": is_correct, "correct_answer": exercise.answer, "explanation": exercise.explanation}


# ========== 错题本 ==========

@router.get("/wrong-answers", response_model=list[WrongAnswerResponse])
async def list_wrong_answers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.query(WrongAnswer).filter(
        WrongAnswer.user_id == user.id
    ).order_by(WrongAnswer.added_at.desc()).all()
    return [_wrong_to_response(w) for w in items]


@router.put("/wrong-answers/{item_id}/reviewed")
async def mark_reviewed(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(WrongAnswer).filter(
        WrongAnswer.id == item_id,
        WrongAnswer.user_id == user.id,
    ).first()
    if not item:
        raise HTTPException(404, "错题不存在")
    item.reviewed = True
    db.commit()
    return {"message": "已标记为已复习"}


def _word_to_response(w: VocabularyWord) -> VocabularyWordResponse:
    return VocabularyWordResponse(
        id=w.id,
        word=w.word,
        phonetic=w.phonetic or "",
        part_of_speech=w.part_of_speech or "",
        definition=w.definition or "",
        example=w.example or "",
        context=w.context or "",
        root_analysis=w.root_analysis or "",
        review_count=w.review_count,
        mastery=w.mastery,
        next_review=w.next_review.isoformat() if w.next_review else "",
        added_at=w.added_at.isoformat() if w.added_at else "",
    )


def _exercise_to_response(e: GrammarExercise) -> GrammarExerciseResponse:
    return GrammarExerciseResponse(
        id=e.id,
        type=e.type,
        question=e.question,
        options=json.loads(e.options) if e.options else [],
        answer=e.answer,
        explanation=e.explanation or "",
        grammar_point=e.grammar_point or "",
        difficulty=e.difficulty,
    )


def _wrong_to_response(w: WrongAnswer) -> WrongAnswerResponse:
    return WrongAnswerResponse(
        id=w.id,
        module=w.module,
        question=w.question,
        user_answer=w.user_answer or "",
        correct_answer=w.correct_answer or "",
        explanation=w.explanation or "",
        reviewed=w.reviewed,
        added_at=w.added_at.isoformat() if w.added_at else "",
    )
