"""词汇与语法 schemas"""

from pydantic import BaseModel


class VocabularyAddRequest(BaseModel):
    word: str
    phonetic: str = ""
    part_of_speech: str = ""
    definition: str = ""
    example: str = ""
    context: str = ""


class VocabularyWordResponse(BaseModel):
    id: str
    word: str
    phonetic: str = ""
    part_of_speech: str = ""
    definition: str = ""
    example: str = ""
    context: str = ""
    root_analysis: str = ""
    review_count: int = 0
    mastery: int = 0
    next_review: str = ""
    added_at: str = ""


class VocabularyReviewRequest(BaseModel):
    word_id: str
    is_correct: bool


class GrammarGenerateRequest(BaseModel):
    grammar_point: str = ""
    type: str = "multiple-choice"  # fill-blank / multiple-choice / error-correction
    difficulty: str = "intermediate"
    count: int = 5


class GrammarExerciseResponse(BaseModel):
    id: str
    type: str
    question: str
    options: list[str] = []
    answer: str
    explanation: str = ""
    grammar_point: str = ""
    difficulty: str = "intermediate"


class WrongAnswerResponse(BaseModel):
    id: str
    module: str
    question: str
    user_answer: str = ""
    correct_answer: str = ""
    explanation: str = ""
    reviewed: bool = False
    added_at: str = ""


class RootAnalysisRequest(BaseModel):
    word: str


class RootAnalysisResult(BaseModel):
    word: str
    root: str = ""
    prefix: str = ""
    suffix: str = ""
    analysis: str = ""
    related_words: list[str] = []
