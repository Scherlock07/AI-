"""OCR 服务层 — 手写作文识别

使用 Tesseract OCR（本地）或可扩展为云端 OCR
"""

import os
import base64
from app.config import settings


async def recognize_handwriting(image_base64: str, language: str = "") -> dict:
    """识别手写作文图片

    Args:
        image_base64: base64 编码的图片
        language: OCR 语言代码 (eng / chi_sim 等)

    Returns:
        {"text": "识别文本", "confidence": 0.85}
    """
    lang = language or settings.OCR_LANGUAGE

    try:
        from PIL import Image
        import pytesseract
        import io

        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

        # 解码 base64 图片
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))

        # OCR 识别
        text = pytesseract.image_to_string(image, lang=lang)

        # 获取置信度
        data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data["conf"] if int(c) > 0]
        avg_confidence = sum(confidences) / len(confidences) / 100.0 if confidences else 0.5

        return {
            "text": text.strip(),
            "confidence": round(avg_confidence, 2),
        }
    except ImportError:
        return {
            "text": "",
            "confidence": 0,
            "error": "OCR 依赖未安装 (pytesseract/Pillow)，请运行 pip install pytesseract Pillow",
        }
    except Exception as e:
        return {
            "text": "",
            "confidence": 0,
            "error": f"OCR 识别失败: {str(e)}",
        }


async def recognize_from_file(file_path: str, language: str = "") -> dict:
    """从文件路径识别"""
    lang = language or settings.OCR_LANGUAGE

    try:
        from PIL import Image
        import pytesseract

        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

        image = Image.open(file_path)
        text = pytesseract.image_to_string(image, lang=lang)
        data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data["conf"] if int(c) > 0]
        avg_confidence = sum(confidences) / len(confidences) / 100.0 if confidences else 0.5

        return {
            "text": text.strip(),
            "confidence": round(avg_confidence, 2),
        }
    except ImportError:
        return {
            "text": "",
            "confidence": 0,
            "error": "OCR 依赖未安装",
        }
    except Exception as e:
        return {
            "text": "",
            "confidence": 0,
            "error": str(e),
        }
