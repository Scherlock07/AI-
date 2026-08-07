"""Azure Speech 服务层

功能：
- TTS 文本转语音（生成听力素材音频）
- STT 语音转文本（口语转写）
- 发音评估（Pronunciation Assessment）
"""

import os
import tempfile
import json
from typing import Optional
from app.config import settings


async def text_to_speech(text: str, accent: str = "us", speed: float = 1.0, output_path: str = "") -> str:
    """TTS：文本转语音，返回音频文件路径"""
    if not settings.AZURE_SPEECH_KEY:
        # 无密钥时返回空路径，前端可用浏览器 Web Speech API 作为降级
        return ""

    try:
        import azure.cognitiveservices.speech as speechsdk

        voice_map = {
            "us": "en-US-JennyNeural",
            "uk": "en-GB-SoniaNeural",
            "au": "en-AU-NatashaNeural",
        }
        voice_name = voice_map.get(accent, voice_map["us"])

        speech_config = speechsdk.SpeechConfig(
            subscription=settings.AZURE_SPEECH_KEY,
            region=settings.AZURE_SPEECH_REGION,
        )
        speech_config.speech_synthesis_voice_name = voice_name

        # 语速控制
        if speed != 1.0:
            rate = int((speed - 1.0) * 100)
            text = f"<speak version='1.0'><prosody rate='{rate:+d}%'>{text}</prosody></speak>"
            speech_config.speech_synthesis_language = voice_name[:5]
            ssml = text
        else:
            ssml = None

        if not output_path:
            output_path = os.path.join(tempfile.gettempdir(), f"tts_{hash(text) % 100000}.wav")

        audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

        if ssml:
            result = synthesizer.speak_ssml_async(ssml).get()
        else:
            result = synthesizer.speak_text_async(text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return output_path
        else:
            print(f"TTS Error: {result.reason}")
            return ""
    except Exception as e:
        print(f"TTS Exception: {e}")
        return ""


async def speech_to_text(audio_path: str, language: str = "en-US") -> str:
    """STT：语音转文本"""
    if not settings.AZURE_SPEECH_KEY:
        return ""

    try:
        import azure.cognitiveservices.speech as speechsdk

        speech_config = speechsdk.SpeechConfig(
            subscription=settings.AZURE_SPEECH_KEY,
            region=settings.AZURE_SPEECH_REGION,
        )
        speech_config.speech_recognition_language = language

        audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )

        result = recognizer.recognize_once_async().get()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return result.text
        else:
            print(f"STT Error: {result.reason}")
            return ""
    except Exception as e:
        print(f"STT Exception: {e}")
        return ""


async def assess_pronunciation(audio_path: str, reference_text: str, language: str = "en-US") -> dict:
    """发音评估：返回详细评分"""
    if not settings.AZURE_SPEECH_KEY:
        return {
            "mock": True,
            "overall_score": 75,
            "accuracy_score": 72,
            "fluency_score": 78,
            "completeness_score": 80,
            "prosody_score": 73,
            "message": "Azure Speech Key 未配置，返回模拟数据",
        }

    try:
        import azure.cognitiveservices.speech as speechsdk

        speech_config = speechsdk.SpeechConfig(
            subscription=settings.AZURE_SPEECH_KEY,
            region=settings.AZURE_SPEECH_REGION,
        )
        speech_config.speech_recognition_language = language

        # 配置发音评估
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )

        audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )
        pronunciation_config.apply_to(recognizer)

        result = recognizer.recognize_once_async().get()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            detail = json.loads(result.properties.get(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
            ))
            pronunciation_result = detail.get("NBest", [{}])[0].get("PronunciationAssessment", {})
            return {
                "overall_score": pronunciation_result.get("PronScore", 0),
                "accuracy_score": pronunciation_result.get("AccuracyScore", 0),
                "fluency_score": pronunciation_result.get("FluencyScore", 0),
                "completeness_score": pronunciation_result.get("CompletenessScore", 0),
                "prosody_score": pronunciation_result.get("ProsodyScore", 0),
                "words": detail.get("NBest", [{}])[0].get("Words", []),
                "full_result": detail,
            }
        else:
            return {"error": f"Recognition failed: {result.reason}"}
    except Exception as e:
        print(f"Pronunciation Assessment Exception: {e}")
        return {"error": str(e)}
