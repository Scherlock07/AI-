"""口语模块路由"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.speaking import (
    SpeakingRecord, DiscussionRoom, DiscussionMessage,
    ConversationSession, ConversationMessage,
)
from app.auth.security import get_current_user
from app.schemas.speaking import (
    SpeakingEvaluateRequest, SpeakingEvaluateResult,
    DiscussionRoomCreate, DiscussionRoomResponse,
    DiscussionMessageCreate, DiscussionMessageResponse,
    TopicRecommendRequest, TopicRecommendResponse,
    InviteRequest, AIReplyRequest,
    ConversationStartRequest, ConversationMessageAdd,
    ConversationMessageResponse, ConversationSessionResponse,
    ConversationFinishRequest,
)
from app.services.llm_service import (
    evaluate_speaking, recommend_discussion_topics, generate_ai_discussion_reply,
    generate_speaking_topics, generate_retelling_material,
)
from app.services.speech_service import assess_pronunciation

router = APIRouter(prefix="/api/speaking", tags=["口语模块"])


class GenerateTopicsRequest(BaseModel):
    theme: str
    difficulty: str = "intermediate"  # beginner / intermediate / advanced
    count: int = 3


class GenerateRetellingRequest(BaseModel):
    topic: str
    length: str = "medium"  # short / medium / long


@router.post("/generate-topic")
async def generate_topic(req: GenerateTopicsRequest, user: User = Depends(get_current_user)):
    """AI 生成口语 Presentation 话题（按主题方向+难度）"""
    if not req.theme.strip():
        raise HTTPException(400, "缺少主题方向")
    if len(req.theme) > 200:
        raise HTTPException(400, "主题过长")
    if req.difficulty not in ("beginner", "intermediate", "advanced"):
        req.difficulty = "intermediate"
    if not (1 <= req.count <= 5):
        req.count = 3
    result = await generate_speaking_topics(req.theme, req.difficulty, req.count)
    return result


@router.post("/generate-retelling")
async def generate_retelling(req: GenerateRetellingRequest, user: User = Depends(get_current_user)):
    """AI 生成复述练习素材（短文 + 复述要点）"""
    if not req.topic.strip():
        raise HTTPException(400, "缺少主题")
    if len(req.topic) > 200:
        raise HTTPException(400, "主题过长")
    if req.length not in ("short", "medium", "long"):
        req.length = "medium"
    result = await generate_retelling_material(req.topic, req.length)
    return result


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
    # duration 此前一直未写入（口语记录时长恒为 0）——兰天童 10.10 反馈的时长统计据此一并修正
    _dur = int(req.duration or 0)
    if _dur < 0 or _dur > 14400:
        _dur = 0
    record = SpeakingRecord(
        user_id=user.id,
        type=req.type,
        topic=req.topic,
        duration=_dur,
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
        transcript_warning=llm_result.get("transcript_warning", ""),
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


# ============ 人机对话会话持久化 ============
# 修复兰天童 2026-10-10 反馈：
#   1) 没有记录讨论记录文本 → 消息逐条落库，会话结束可完整回放
#   2) 无法统计本次对话练习的时长 → 会话记录 duration，另接入统一练习时长表

def _conv_session_to_response(
    s: ConversationSession, msgs: list[ConversationMessage] | None = None
) -> ConversationSessionResponse:
    return ConversationSessionResponse(
        id=s.id,
        mode=s.mode or "daily",
        topic=s.topic or "",
        status=s.status or "active",
        message_count=s.message_count or 0,
        duration=s.duration or 0,
        overall_score=s.overall_score or 0,
        feedback=s.feedback or "",
        started_at=s.started_at.isoformat() if s.started_at else "",
        completed_at=s.completed_at.isoformat() if s.completed_at else "",
        messages=[
            ConversationMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role or "user",
                content=m.content or "",
                turn_index=m.turn_index or 0,
                created_at=m.created_at.isoformat() if m.created_at else "",
            )
            for m in (msgs or [])
        ],
    )


@router.post("/conversation/sessions", response_model=ConversationSessionResponse)
async def start_conversation_session(
    req: ConversationStartRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """开始一次人机对话会话（前端进入对话时调用）"""
    if req.mode not in ("daily", "critical"):
        req.mode = "daily"
    session = ConversationSession(
        user_id=user.id,
        mode=req.mode,
        topic=(req.topic or "")[:200],
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _conv_session_to_response(session, [])


@router.post("/conversation/sessions/{session_id}/messages", response_model=ConversationMessageResponse)
async def add_conversation_message(
    session_id: str,
    req: ConversationMessageAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """追加一条对话消息（学生与 AI 的每条消息都调用）"""
    session = db.query(ConversationSession).filter(
        ConversationSession.id == session_id,
        ConversationSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "会话不存在")
    if not req.content.strip():
        raise HTTPException(400, "消息内容为空")
    if len(req.content) > 8000:
        raise HTTPException(400, "单条消息过长")

    turn = (session.message_count or 0)
    msg = ConversationMessage(
        session_id=session.id,
        user_id=user.id,
        role="ai" if req.role == "ai" else "user",
        content=req.content,
        turn_index=turn,
    )
    db.add(msg)
    session.message_count = turn + 1
    db.commit()
    db.refresh(msg)
    return ConversationMessageResponse(
        id=msg.id,
        session_id=msg.session_id,
        role=msg.role or "user",
        content=msg.content or "",
        turn_index=msg.turn_index or 0,
        created_at=msg.created_at.isoformat() if msg.created_at else "",
    )


@router.post("/conversation/sessions/{session_id}/finish", response_model=ConversationSessionResponse)
async def finish_conversation_session(
    session_id: str,
    req: ConversationFinishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """结束人机对话并写入评分与时长"""
    session = db.query(ConversationSession).filter(
        ConversationSession.id == session_id,
        ConversationSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "会话不存在")

    # 时长合理性钳制：0 ~ 4 小时，异常值按消息数兜底估算（每轮约 40 秒）
    dur = int(req.duration or 0)
    if dur < 0 or dur > 14400:
        dur = min(14400, max(0, (session.message_count or 0) * 40))
    session.duration = dur
    session.overall_score = int(req.overall_score or 0)
    session.feedback = (req.feedback or "")[:8000]
    session.scores = json.dumps(req.scores or [], ensure_ascii=False)
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return _conv_session_to_response(session, [])


@router.get("/conversation/sessions", response_model=list[ConversationSessionResponse])
async def list_conversation_sessions(
    limit: int = Query(30, ge=1, le=200),
    with_messages: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """历史人机对话列表（with_messages=true 时附带完整文字记录）"""
    sessions = db.query(ConversationSession).filter(
        ConversationSession.user_id == user.id
    ).order_by(ConversationSession.started_at.desc()).limit(limit).all()

    out = []
    for s in sessions:
        msgs = []
        if with_messages:
            msgs = db.query(ConversationMessage).filter(
                ConversationMessage.session_id == s.id
            ).order_by(ConversationMessage.turn_index.asc()).all()
        out.append(_conv_session_to_response(s, msgs))
    return out


@router.get("/conversation/sessions/{session_id}", response_model=ConversationSessionResponse)
async def get_conversation_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """单次会话完整记录（用于历史回放）"""
    session = db.query(ConversationSession).filter(
        ConversationSession.id == session_id,
        ConversationSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "会话不存在")
    msgs = db.query(ConversationMessage).filter(
        ConversationMessage.session_id == session.id
    ).order_by(ConversationMessage.turn_index.asc()).all()
    return _conv_session_to_response(session, msgs)


@router.delete("/conversation/sessions/{session_id}")
async def delete_conversation_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除一次对话记录（仅本人）"""
    session = db.query(ConversationSession).filter(
        ConversationSession.id == session_id,
        ConversationSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "会话不存在")
    db.query(ConversationMessage).filter(
        ConversationMessage.session_id == session.id
    ).delete(synchronize_session=False)
    db.delete(session)
    db.commit()
    return {"ok": True}
