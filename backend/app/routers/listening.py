"""听力模块路由"""

import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.listening import ListeningMaterial, ListeningExercise
from app.auth.security import get_current_user
from app.schemas.listening import ListeningGenerateRequest, ListeningMaterialResponse, ListeningImportRequest
from app.services.llm_service import generate_listening_script
from app.services.speech_service import text_to_speech

router = APIRouter(prefix="/api/listening", tags=["听力模块"])


@router.get("/materials", response_model=list[ListeningMaterialResponse])
async def list_materials(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    materials = db.query(ListeningMaterial).order_by(ListeningMaterial.created_at.desc()).all()
    return [_to_response(m) for m in materials]


@router.post("/generate", response_model=ListeningMaterialResponse)
async def generate_material(req: ListeningGenerateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI 生成听力素材（脚本 + TTS 音频）"""
    result = await generate_listening_script(req.topic, req.accent, req.speed, req.difficulty, req.duration)

    material = ListeningMaterial(
        title=result.get("title", f"{req.topic} - AI Generated"),
        topic=req.topic,
        accent=req.accent,
        speed=req.speed,
        duration=req.duration,
        transcript=result.get("script", ""),
        source="ai-generated",
        difficulty=req.difficulty,
        key_vocabulary=json.dumps(result.get("vocabulary", []), ensure_ascii=False),
        created_by=user.id,
    )

    # 尝试生成 TTS 音频（如未配置 Azure Key 则跳过）
    audio_url = await text_to_speech(material.transcript, req.accent, req.speed)
    material.audio_url = audio_url

    db.add(material)
    db.commit()
    db.refresh(material)
    return _to_response(material)


@router.post("/import", response_model=ListeningMaterialResponse)
async def import_material(req: ListeningImportRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """手动导入听力素材（转写文本）"""
    material = ListeningMaterial(
        title=req.title,
        topic=req.topic,
        accent="other",
        speed=1.0,
        duration=0,
        transcript=req.content,
        source="imported",
        difficulty=req.difficulty,
        created_by=user.id,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return _to_response(material)


@router.post("/upload-audio/{material_id}")
async def upload_audio(material_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """上传音频文件到指定素材"""
    material = db.query(ListeningMaterial).filter(ListeningMaterial.id == material_id).first()
    if not material:
        raise HTTPException(404, "素材不存在")

    import os
    upload_dir = "uploads/audio"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{material_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(await file.read())
    material.audio_url = file_path
    db.commit()
    return {"message": "上传成功", "audio_url": file_path}


@router.get("/{material_id}", response_model=ListeningMaterialResponse)
async def get_material(material_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    material = db.query(ListeningMaterial).filter(ListeningMaterial.id == material_id).first()
    if not material:
        raise HTTPException(404, "素材不存在")
    return _to_response(material)


def _to_response(m: ListeningMaterial) -> ListeningMaterialResponse:
    return ListeningMaterialResponse(
        id=m.id,
        title=m.title,
        topic=m.topic,
        accent=m.accent,
        speed=m.speed,
        duration=m.duration,
        audio_url=m.audio_url or "",
        transcript=m.transcript or "",
        source=m.source,
        difficulty=m.difficulty,
        key_vocabulary=json.loads(m.key_vocabulary) if m.key_vocabulary else [],
        created_at=m.created_at.isoformat() if m.created_at else "",
    )
