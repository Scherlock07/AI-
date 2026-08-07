"""应用配置 — 支持环境变量和 .env 文件"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # 应用
    APP_NAME: str = "AI外语学习辅助平台"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # 数据库 (开发环境用 SQLite，生产切 PostgreSQL)
    DATABASE_URL: str = "sqlite:///./ai_language_platform.db"

    # JWT
    SECRET_KEY: str = "dev-secret-key-change-in-production-9f8a2b7c"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24小时

    # CORS — 开发环境允许所有来源，生产环境应限定具体域名
    CORS_ORIGINS: list[str] = ["*"]

    # LLM — OpenAI 兼容接口 (可指向 OpenAI / 国产大模型)
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"

    # Azure Speech
    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_REGION: str = "eastasia"

    # OCR — Tesseract 本地方案 (也可换云端 OCR)
    TESSERACT_CMD: str = ""  # 留空则用系统默认路径
    OCR_LANGUAGE: str = "eng"

    # 文件上传
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE: int = 20 * 1024 * 1024  # 20MB

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
