"""阅读模块 schemas"""

from pydantic import BaseModel


class ReadingImportRequest(BaseModel):
    title: str
    source: str = "手动导入"
    content: str
    difficulty: str = "intermediate"


class ReadingAnalysisRequest(BaseModel):
    content: str
    difficulty: str = "intermediate"


class ReadingAnalysisResult(BaseModel):
    summary: str
    key_points: list[str]
    structure: list[dict]  # 逻辑结构树
    difficult_sentences: list[dict]  # [{sentence, analysis}]
    translation: str = ""
    cultural_notes: list[dict] = []
    vocabulary: list[dict] = []


class ReadingTextResponse(BaseModel):
    id: str
    title: str
    source: str
    content: str
    difficulty: str
    word_count: int
    summary: str = ""
    key_points: list = []
    structure: list = []
    difficult_sentences: list = []
    translation: str = ""
    cultural_notes: list = []
    vocabulary: list = []
    created_at: str = ""
