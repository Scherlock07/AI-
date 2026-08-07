"""写作模块 schemas"""

from pydantic import BaseModel, field_validator


class ScoreDimension(BaseModel):
    name: str
    score: int
    maxScore: int = 100
    feedback: str = ""

    @field_validator("score", "maxScore", mode="before")
    @classmethod
    def coerce_to_int(cls, v):
        if isinstance(v, float):
            return int(v)
        return v


class WritingSubmitRequest(BaseModel):
    title: str
    type: str = "argumentative"  # chart / argumentative / creative / imitation
    prompt: str = ""
    content: str


class WritingGradeRequest(BaseModel):
    content: str
    type: str = "argumentative"
    prompt: str = ""
    title: str = ""


class WritingResponse(BaseModel):
    id: str
    title: str
    type: str
    content: str
    word_count: int
    status: str
    scores: list[dict] = []
    overall_score: int = 0
    ai_feedback: str = ""
    revised_version: str = ""
    submitted_at: str = ""
    completed_at: str | None = None


class WritingGradeResult(BaseModel):
    scores: list[ScoreDimension] = []
    overall_score: int = 0
    ai_feedback: str = ""
    revised_version: str = ""
    error_details: list[dict] = []

    @field_validator("overall_score", mode="before")
    @classmethod
    def coerce_overall(cls, v):
        if isinstance(v, float):
            return int(v)
        return v
