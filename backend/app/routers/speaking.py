"""口语模块路由"""

import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.speaking import SpeakingRecord, DiscussionRoom, DiscussionMessage
from app.auth.security import get_current_user
from app.schemas.speaking import (
    SpeakingEvaluateRequest, SpeakingEvaluateResult,
    DiscussionRoomCreate, DiscussionRoomResponse,
    DiscussionMessageCreate, DiscussionMessageResponse,
    TopicRecommendRequest, TopicRecommendResponse,
    InviteRequest, AIReplyRequest,
)
from app.services.llm_service import (
    evaluate_speaking, recommend_discussion_topics, generate_ai_discussion_reply,
)
from app.services.speech_service import assess_pronunciation

router = APIRouter(prefix="/api/speaking", tags=["口语模块"])


@router.post("/evaluate", response_model=SpeakingEvaluateResult)
async def evaluate(req: SpeakingEvaluateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """评估口语表现（LLM 评估 + 可选 Azure 发音评估）"""
    if not req.transcript and not req.audio_base64:
        raise HTTPException(400, "需要提供转写文本或音频")

    # LLM 评估
    llm_result = await evaluate_speaking(req.transcript, req.topic, req.type, req.reference_text)

    # 如果有音频，尝试 Azure 发音评估
    pronunciation_detail = {}
    if req.audio_base64 and req.reference_text:
        # 保存临时音频文件
        import base64, tempfile, os
        audio_data = base64.b64decode(req.audio_base64)
        temp_path = os.path.join(tempfile.gettempdir(), f"speech_{user.id}.wav")
        with open(temp_path, "wb") as f:
            f.write(audio_data)
        pronunciation_detail = await assess_pronunciation(temp_path, req.reference_text)

    # 保存记录
    record = SpeakingRecord(
        user_id=user.id,
        type=req.type,
        topic=req.topic,
        transcript=req.transcript,
        scores=json.dumps(llm_result.get("scores", []), ensure_ascii=False),
        overall_score=llm_result.get("overall_score", 0),
        feedback=llm_result.get("feedback", ""),
        reference_answer=llm_result.get("reference_answer", ""),
        pronunciation_scores=json.dumps(pronunciation_detail, ensure_ascii=False),
    )
    db.add(record)
    db.commit()

    return SpeakingEvaluateResult(
        scores=llm_result.get("scores", []),
        overall_score=llm_result.get("overall_score", 0),
        feedback=llm_result.get("feedback", ""),
        reference_answer=llm_result.get("reference_answer", ""),
        pronunciation_detail=pronunciation_detail,
    )


@router.get("/records", response_model=list[dict])
async def list_records(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    records = db.query(SpeakingRecord).filter(
        SpeakingRecord.user_id == user.id
    ).order_by(SpeakingRecord.created_at.desc()).all()
    return [_record_to_dict(r) for r in records]


# ========== 讨论主题推荐 ==========

@router.post("/recommend-topics", response_model=TopicRecommendResponse)
async def recommend_topics(req: TopicRecommendRequest, user: User = Depends(get_current_user)):
    """AI推荐讨论主题"""
    result = await recommend_discussion_topics(req.category, req.difficulty, req.count)
    return TopicRecommendResponse(topics=result.get("topics", []))


# ========== 讨论房间（创建/广场/加入/详情） ==========

@router.post("/rooms", response_model=DiscussionRoomResponse)
async def create_room(req: DiscussionRoomCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """创建讨论房间"""
    room = DiscussionRoom(
        topic=req.topic,
        description=req.description,
        host_id=user.id,
        host_name=user.display_name or user.username,
        max_participants=req.max_participants,
        ai_count=req.ai_count,
        language=req.language,
        difficulty=req.difficulty,
        category=req.category,
        speaker_queue=json.dumps([{
            "id": user.id,
            "name": user.display_name or user.username,
            "isAI": False,
            "role": "host",
        }], ensure_ascii=False),
        current_speaker=user.id,
        status="waiting",
    )
    db.add(room)
    db.flush()  # Flush to get room.id before creating the message

    # 添加系统消息
    sys_msg = DiscussionMessage(
        room_id=room.id,
        sender_type="system",
        content=f"讨论房间已创建。主题：{req.topic}",
    )
    db.add(sys_msg)
    db.commit()
    db.refresh(room)
    return _room_to_response(room, user.id)


@router.get("/rooms", response_model=list[DiscussionRoomResponse])
async def list_rooms(
    status: str | None = Query(None, description="按状态过滤: waiting/active"),
    category: str | None = Query(None, description="按分类过滤"),
    search: str | None = Query(None, description="搜索主题"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """讨论广场 — 列出所有可加入的房间"""
    query = db.query(DiscussionRoom).filter(DiscussionRoom.status != "completed")
    if status:
        query = query.filter(DiscussionRoom.status == status)
    if category:
        query = query.filter(DiscussionRoom.category == category)
    if search:
        query = query.filter(DiscussionRoom.topic.ilike(f"%{search}%"))
    rooms = query.order_by(DiscussionRoom.created_at.desc()).limit(50).all()
    return [_room_to_response(r, user.id) for r in rooms]


@router.get("/rooms/{room_id}", response_model=DiscussionRoomResponse)
async def get_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """获取房间详情"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")
    return _room_to_response(room, user.id)


@router.post("/rooms/{room_id}/join", response_model=DiscussionRoomResponse)
async def join_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """加入讨论房间"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")
    if room.status == "completed":
        raise HTTPException(400, "房间已关闭")

    queue = json.loads(room.speaker_queue) if room.speaker_queue else []
    # 只统计真人参与者
    human_count = sum(1 for p in queue if not p.get("isAI"))
    if human_count >= room.max_participants:
        raise HTTPException(400, "房间已满")
    if any(p["id"] == user.id for p in queue):
        raise HTTPException(400, "已加入房间")

    queue.append({
        "id": user.id,
        "name": user.display_name or user.username,
        "isAI": False,
        "role": "participant",
    })
    room.speaker_queue = json.dumps(queue, ensure_ascii=False)

    # 系统消息
    sys_msg = DiscussionMessage(
        room_id=room.id,
        sender_type="system",
        content=f"{user.display_name or user.username} 加入了讨论",
    )
    db.add(sys_msg)
    db.commit()
    db.refresh(room)
    return _room_to_response(room, user.id)


@router.post("/rooms/{room_id}/leave", response_model=dict)
async def leave_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """离开讨论房间"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")

    queue = json.loads(room.speaker_queue) if room.speaker_queue else []
    queue = [p for p in queue if p["id"] != user.id]
    room.speaker_queue = json.dumps(queue, ensure_ascii=False)

    # 如果没有真人了，关闭房间
    human_count = sum(1 for p in queue if not p.get("isAI"))
    if human_count == 0:
        room.status = "completed"

    # 系统消息
    sys_msg = DiscussionMessage(
        room_id=room.id,
        sender_type="system",
        content=f"{user.display_name or user.username} 离开了讨论",
    )
    db.add(sys_msg)
    db.commit()
    return {"success": True, "message": "已离开房间"}


@router.delete("/rooms/{room_id}")
async def close_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """关闭讨论房间（仅房主）"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")
    if room.host_id != user.id:
        raise HTTPException(403, "只有房主可以关闭房间")
    room.status = "completed"
    db.commit()
    return {"success": True, "message": "房间已关闭"}


# ========== 房间消息 ==========

@router.get("/rooms/{room_id}/messages", response_model=list[DiscussionMessageResponse])
async def get_messages(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """获取房间消息记录"""
    msgs = db.query(DiscussionMessage).filter(
        DiscussionMessage.room_id == room_id
    ).order_by(DiscussionMessage.created_at.asc()).limit(200).all()
    return [_msg_to_response(m) for m in msgs]


@router.post("/rooms/{room_id}/messages", response_model=DiscussionMessageResponse)
async def send_message(
    room_id: str,
    req: DiscussionMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """发送讨论消息"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")
    if room.status == "completed":
        raise HTTPException(400, "房间已关闭")

    # 如果房间还是waiting状态，有消息就改为active
    if room.status == "waiting":
        room.status = "active"

    msg = DiscussionMessage(
        room_id=room_id,
        sender_id=user.id,
        sender_name=user.display_name or user.username,
        sender_type="user",
        content=req.content,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _msg_to_response(msg)


@router.post("/rooms/{room_id}/ai-reply", response_model=DiscussionMessageResponse)
async def ai_reply(
    room_id: str,
    req: AIReplyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI讨论者生成回复"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")
    if room.status == "completed":
        raise HTTPException(400, "房间已关闭")

    # 获取最近消息作为上下文
    msgs = db.query(DiscussionMessage).filter(
        DiscussionMessage.room_id == room_id
    ).order_by(DiscussionMessage.created_at.desc()).limit(10).all()
    msgs.reverse()
    msg_dicts = [{"sender_name": m.sender_name, "content": m.content} for m in msgs]

    ai_name = req.ai_name or "AI Emma"
    ai_persona = req.ai_persona or ""

    reply_text = await generate_ai_discussion_reply(
        topic=room.topic,
        ai_name=ai_name,
        ai_persona=ai_persona,
        messages=msg_dicts,
        difficulty=room.difficulty,
    )

    msg = DiscussionMessage(
        room_id=room_id,
        sender_id=f"ai_{ai_name.lower().replace(' ', '_')}",
        sender_name=ai_name,
        sender_type="ai",
        content=reply_text.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _msg_to_response(msg)


# ========== 房间邀请 ==========

@router.post("/rooms/{room_id}/invite", response_model=dict)
async def invite_user(
    room_id: str,
    req: InviteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """邀请用户加入房间（通过用户名搜索）"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")

    target_user = db.query(User).filter(User.username == req.username).first()
    if not target_user:
        raise HTTPException(404, f"用户 '{req.username}' 不存在")

    # 检查是否已在房间
    queue = json.loads(room.speaker_queue) if room.speaker_queue else []
    if any(p["id"] == target_user.id for p in queue):
        raise HTTPException(400, f"用户 '{req.username}' 已在房间中")

    # 记录系统消息（邀请通知）
    inviter_name = user.display_name or user.username
    sys_msg = DiscussionMessage(
        room_id=room.id,
        sender_type="system",
        content=f"{inviter_name} 邀请了 {target_user.display_name or target_user.username} 加入讨论",
    )
    db.add(sys_msg)
    db.commit()

    return {
        "success": True,
        "message": f"已向 {target_user.display_name or target_user.username} 发送邀请",
        "room_id": room_id,
        "room_topic": room.topic,
        "invited_user": target_user.display_name or target_user.username,
    }


@router.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """搜索用户（用于邀请）"""
    users = db.query(User).filter(
        User.username.ilike(f"%{q}%") | User.display_name.ilike(f"%{q}%")
    ).filter(User.id != user.id).limit(10).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name or u.username,
        }
        for u in users
    ]


# ========== 轮流发言控制 ==========

@router.post("/rooms/{room_id}/next-speaker", response_model=DiscussionRoomResponse)
async def next_speaker(room_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """传递发言令牌到下一位"""
    room = db.query(DiscussionRoom).filter(DiscussionRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "房间不存在")

    queue = json.loads(room.speaker_queue) if room.speaker_queue else []
    if not queue:
        raise HTTPException(400, "无参与者")

    current_idx = next((i for i, p in enumerate(queue) if p["id"] == room.current_speaker), -1)
    next_idx = (current_idx + 1) % len(queue)
    room.current_speaker = queue[next_idx]["id"]
    room.status = "active"
    db.commit()
    db.refresh(room)
    return _room_to_response(room, user.id)


# ========== 辅助函数 ==========

def _record_to_dict(r: SpeakingRecord) -> dict:
    return {
        "id": r.id,
        "type": r.type,
        "topic": r.topic,
        "duration": r.duration,
        "audioUrl": r.audio_url or "",
        "transcript": r.transcript or "",
        "scores": json.loads(r.scores) if r.scores else [],
        "overallScore": r.overall_score,
        "feedback": r.feedback or "",
        "referenceAnswer": r.reference_answer or "",
        "createdAt": r.created_at.isoformat() if r.created_at else "",
    }


def _room_to_response(room: DiscussionRoom, user_id: str) -> DiscussionRoomResponse:
    queue = json.loads(room.speaker_queue) if room.speaker_queue else []
    human_count = sum(1 for p in queue if not p.get("isAI"))
    return DiscussionRoomResponse(
        id=room.id,
        topic=room.topic,
        description=room.description or "",
        host_id=room.host_id,
        host_name=room.host_name or "",
        status=room.status,
        max_participants=room.max_participants,
        ai_count=room.ai_count,
        language=room.language,
        difficulty=room.difficulty,
        category=room.category,
        current_speaker=room.current_speaker,
        speaker_queue=queue,
        participant_count=human_count,
        created_at=room.created_at.isoformat() if room.created_at else "",
    )


def _msg_to_response(m: DiscussionMessage) -> DiscussionMessageResponse:
    return DiscussionMessageResponse(
        id=m.id,
        room_id=m.room_id,
        sender_id=m.sender_id or "",
        sender_name=m.sender_name or "",
        sender_type=m.sender_type or "user",
        content=m.content or "",
        created_at=m.created_at.isoformat() if m.created_at else "",
    )
