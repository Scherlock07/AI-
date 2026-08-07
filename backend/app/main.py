"""AI外语学习辅助平台 — FastAPI 后端入口"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base

# 导入所有模型以注册到 Base.metadata
from app.models.user import User
from app.models.listening import ListeningMaterial, ListeningExercise
from app.models.speaking import SpeakingRecord, DiscussionRoom, DiscussionMessage
from app.models.reading import ReadingText, ReadingExercise
from app.models.writing import WritingSubmission, WritingPeerReview
from app.models.vocabulary import VocabularyWord, GrammarExercise, GrammarExerciseRecord, WrongAnswer
from app.models.community import (
    TranslationExercise, TranslationRecord, StudyGroup, StudyGroupMember,
    Achievement, LearningStats,
)
from app.models.teacher import Class, ClassMember, Assignment, ClassroomSpeakingScore

# 导入路由
from app.routers import auth, listening, speaking, reading, writing, vocabulary, translation, community, teacher, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时创建表"""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    # 创建默认管理员账户（开发环境）
    _create_default_admin()
    print(f"\n{'='*50}")
    print(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"  Docs: http://localhost:8000/docs")
    print(f"  Database: {settings.DATABASE_URL}")
    print(f"  LLM Model: {settings.LLM_MODEL}")
    print(f"  Azure Speech: {'configured' if settings.AZURE_SPEECH_KEY else 'NOT configured (mock mode)'}")
    print(f"{'='*50}\n")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI辅助外语学习平台后端API — 覆盖听力/口语/阅读/写作/词汇语法/翻译/社区/教师后台",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(listening.router)
app.include_router(speaking.router)
app.include_router(reading.router)
app.include_router(writing.router)
app.include_router(vocabulary.router)
app.include_router(translation.router)
app.include_router(community.router)
app.include_router(teacher.router)
app.include_router(profile.router)


@app.get("/", tags=["健康检查"])
async def root():
    return {
        "status": "running",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/api/health", tags=["健康检查"])
async def health():
    return {"status": "healthy"}


def _create_default_admin():
    """创建默认管理员/测试账户"""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        # 检查是否已有测试学生账户
        student = db.query(User).filter(User.username == "student").first()
        if not student:
            from app.auth.security import hash_password
            student = User(
                username="student",
                email="student@test.com",
                hashed_password=hash_password("123456"),
                display_name="测试学生",
                role="student",
                level="intermediate",
                total_points=750,
                streak=7,
            )
            db.add(student)
            print("  [默认账户] student / 123456 (学生)")

        teacher = db.query(User).filter(User.username == "teacher").first()
        if not teacher:
            from app.auth.security import hash_password
            teacher = User(
                username="teacher",
                email="teacher@test.com",
                hashed_password=hash_password("123456"),
                display_name="测试教师",
                role="teacher",
            )
            db.add(teacher)
            print("  [默认账户] teacher / 123456 (教师)")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
