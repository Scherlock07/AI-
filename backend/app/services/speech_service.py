"""Azure Speech 服务层

功能：
- TTS 文本转语音（生成听力素材音频）
- STT 语音转文本（口语转写）
- 发音评估（Pronunciation Assessment）
"""

import asyncio
import os
import shutil
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


# ============================================================================
#  音频准备：浏览器录音 → Azure 可用的 WAV
# ============================================================================
# 浏览器 MediaRecorder 的真实输出是 audio/webm;codecs=opus（Chrome/Edge/Firefox）
# 或 audio/mp4（Safari）。Azure Speech SDK 读文件时依赖 GStreamer 解码这类容器，
# 而我们的镜像里并不保证具备；因此统一先用 ffmpeg 转成 16kHz 单声道 PCM WAV，
# 链路最短也最稳。
#
# ⚠️ 历史缺陷：旧 evaluate 端点把浏览器录音直接写成 `speech_{uid}.wav`，
#    文件后缀是 .wav 但内容其实是 webm，Azure 侧必然解析失败 —— 这就是
#    `assess_pronunciation` 上线以来「0 次产出」的直接原因。

_EXT_BY_MIME = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
}

# WAV 头 44 字节 + 16kHz * 2 字节/样本 ≈ 32 KB/s
_WAV_BYTES_PER_SEC = 32000


def _guess_ext(mime: str) -> str:
    return _EXT_BY_MIME.get((mime or "").split(";")[0].strip().lower(), ".webm")


def _wav_duration_seconds(path: str) -> float:
    try:
        size = os.path.getsize(path)
        return max(0.0, (size - 44) / _WAV_BYTES_PER_SEC) if size > 44 else 0.0
    except Exception:
        return 0.0


def prepare_audio(audio_bytes: bytes, mime: str = "") -> tuple[str, str]:
    """把任意浏览器录音转成 16kHz 单声道 PCM WAV。

    Returns:
        (wav_path, error) —— 成功时 error 为空串
    """
    import subprocess

    if not audio_bytes:
        return "", "音频内容为空"

    tmpdir = tempfile.mkdtemp(prefix="speech_")
    src = os.path.join(tmpdir, f"src{_guess_ext(mime)}")
    with open(src, "wb") as f:
        f.write(audio_bytes)

    # 已经是 WAV 就不再转码
    if src.endswith(".wav"):
        return src, ""

    dst = os.path.join(tmpdir, "audio.wav")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return "", "服务器缺少 ffmpeg，无法解析浏览器录音格式"

    try:
        proc = subprocess.run(
            [
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-i", src, "-vn", "-ac", "1", "-ar", "16000",
                "-acodec", "pcm_s16le", dst,
            ],
            capture_output=True,
            timeout=180,
        )
        if proc.returncode != 0 or not os.path.exists(dst) or os.path.getsize(dst) == 0:
            detail = proc.stderr.decode("utf-8", "ignore")[:200].strip()
            return "", f"音频转码失败：{detail or 'ffmpeg 返回非零退出码'}"
    except subprocess.TimeoutExpired:
        return "", "音频转码超时"
    except Exception as e:
        return "", f"音频转码异常：{e}"

    return dst, ""


# ============================================================================
#  连续识别
# ============================================================================
# ⚠️ 历史缺陷：旧实现用 `recognize_once_async()`，它**在遇到第一处静音就返回**，
#    因此只能识别第一句。学生做 40 秒的 Presentation，只要中间停顿一次，
#    后续内容全部丢失 —— 这也是发音评估恒无产出、转写明显短于实际的原因。
#    现在改为 `start_continuous_recognition_async`，逐句收集后拼接。

_PA_SCORE_KEYS = {
    "overall_score": "PronScore",
    "accuracy_score": "AccuracyScore",
    "fluency_score": "FluencyScore",
    "completeness_score": "CompletenessScore",
    "prosody_score": "ProsodyScore",
}


def _make_recognizer(speechsdk, audio_path: str, language: str, reference_text: str, enable_pa: bool = True):
    """构造识别器；`enable_pa` 时挂上音素级发音评估

    发音评估有两种模式：
    - **scripted（有参考文本）**：朗读/复述题，给出准确度、流利度、完整度、韵律，
      并开启 miscue 以识别「多读/漏读/错读」；这是最精确的模式。
    - **unscripted（无参考文本）**：自由口语（Presentation / 讨论）场景。Azure 允许
      不传参考文本直接评估，仍可给出流利度与韵律级反馈，学生做自由表达时也能拿到
      发音维度的评价，而不是只有 LLM 的文本评分。
    """
    speech_config = speechsdk.SpeechConfig(
        subscription=settings.AZURE_SPEECH_KEY,
        region=settings.AZURE_SPEECH_REGION,
    )
    speech_config.speech_recognition_language = language

    # 放宽静音判定：口语练习里学生思考停顿很常见，默认值会把句子切碎甚至提前结束
    for prop, value in (
        ("SpeechServiceConnection_InitialSilenceTimeoutMs", "10000"),
        ("Speech_SegmentationSilenceTimeoutMs", "1200"),
        ("SpeechServiceConnection_EndSilenceTimeoutMs", "2000"),
    ):
        try:
            speech_config.set_property(getattr(speechsdk.PropertyId, prop), value)
        except Exception:
            pass

    audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

    has_reference = bool(reference_text and reference_text.strip())
    if enable_pa:
        try:
            pa_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text if has_reference else "",
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=has_reference,
            )
            # 韵律分需要显式开启；老版本 SDK 无此方法，忽略即可
            try:
                pa_config.enable_prosody_assessment()
            except Exception:
                pass
            pa_config.apply_to(recognizer)
        except Exception as e:
            print(f"发音评估配置失败（降级为纯转写）：{e}")

    return recognizer


def _start_continuous(recognizer, speechsdk, collect_pa: bool, timeout_s: int):
    """启动连续识别，收集全部语句（含逐句发音评估 JSON）"""
    import threading

    segments: list[dict] = []
    errors: list[str] = []
    done = threading.Event()

    def on_recognized(evt):
        try:
            if evt.result.reason != speechsdk.ResultReason.RecognizedSpeech:
                return
            text = (evt.result.text or "").strip()
            if not text:
                return
            item: dict = {"text": text}
            if collect_pa:
                try:
                    item["detail"] = json.loads(
                        evt.result.properties.get(
                            speechsdk.PropertyId.SpeechServiceResponse_JsonResult
                        )
                    )
                except Exception:
                    pass
            segments.append(item)
        except Exception as e:  # 事件回调里抛异常会静默丢结果，必须显式记录
            errors.append(f"recognized 回调异常：{e}")

    def on_canceled(evt):
        try:
            if evt.result.reason == speechsdk.ResultReason.Canceled:
                d = evt.result.cancellation_details
                errors.append(f"识别被取消：{d.reason} {d.error_details}")
        except Exception:
            pass
        done.set()

    def on_stopped(evt):
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.canceled.connect(on_canceled)
    recognizer.session_stopped.connect(on_stopped)
    recognizer.start_continuous_recognition_async().get()
    done.wait(timeout_s)
    try:
        recognizer.stop_continuous_recognition_async().get()
    except Exception:
        pass

    return segments, errors


def _aggregate_pronunciation(segments: list[dict]) -> dict:
    """把逐句的发音评估聚合成一份总评（按词数加权）"""
    buckets: dict[str, list[tuple[float, int]]] = {k: [] for k in _PA_SCORE_KEYS}
    words: list[dict] = []
    texts: list[str] = []
    pa_hits = 0

    for seg in segments:
        texts.append(seg.get("text", ""))
        detail = seg.get("detail") or {}
        nbest = (detail.get("NBest") or [{}])[0]
        pa = nbest.get("PronunciationAssessment") or {}
        seg_words = nbest.get("Words") or []
        words.extend(seg_words)
        if not pa:
            continue
        pa_hits += 1
        weight = max(1, len(seg_words))
        for key, pa_key in _PA_SCORE_KEYS.items():
            val = pa.get(pa_key)
            if isinstance(val, (int, float)):
                buckets[key].append((float(val), weight))

    if pa_hits == 0:
        return {}

    result: dict = {"segments": texts}
    for key, vals in buckets.items():
        if vals:
            total_weight = sum(w for _, w in vals)
            result[key] = round(sum(v * w for v, w in vals) / total_weight, 1)
        else:
            result[key] = 0
    result["words"] = words
    return result


def _recognize_blocking(audio_path: str, language: str, reference_text: str, timeout_s: int, enable_pa: bool = True):
    """阻塞式识别（放线程池执行，避免阻塞事件循环）"""
    import azure.cognitiveservices.speech as speechsdk

    recognizer = _make_recognizer(speechsdk, audio_path, language, reference_text, enable_pa)
    segments, errors = _start_continuous(recognizer, speechsdk, enable_pa, timeout_s)

    # 连续识别没拿到任何结果时，退回单句识别（极短音频下更可靠）
    if not segments:
        recognizer2 = _make_recognizer(speechsdk, audio_path, language, reference_text, enable_pa)
        try:
            res = recognizer2.recognize_once_async().get()
            if res.reason == speechsdk.ResultReason.RecognizedSpeech and (res.text or "").strip():
                item: dict = {"text": res.text.strip()}
                try:
                    item["detail"] = json.loads(
                        res.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                    )
                except Exception:
                    pass
                segments = [item]
        except Exception as e:
            errors.append(f"单句识别异常：{e}")

    return segments, errors


async def transcribe_audio(
    audio_bytes: bytes,
    mime: str = "",
    reference_text: str = "",
    language: str = "en-US",
) -> dict:
    """浏览器录音 → 文本（可选音素级发音评估）。

    整条链路都在自有后端完成：浏览器只负责采集 PCM，识别与评估走我们自己的
    Azure Speech 资源，不依赖 Chrome(Google) / Edge(Microsoft) 的浏览器内置服务。
    """
    if not settings.AZURE_SPEECH_KEY:
        return {
            "transcript": "",
            "pronunciation_detail": {},
            "source": "unavailable",
            "error": "服务器未配置语音识别服务",
        }

    wav_path, err = await asyncio.to_thread(prepare_audio, audio_bytes, mime)
    if err:
        return {"transcript": "", "pronunciation_detail": {}, "source": "error", "error": err}

    duration = _wav_duration_seconds(wav_path)
    timeout_s = int(min(600, max(30, duration * 2 + 20)))

    try:
        segments, errors = await asyncio.to_thread(
            _recognize_blocking, wav_path, language, reference_text, timeout_s, True
        )
    except Exception as e:
        return {
            "transcript": "",
            "pronunciation_detail": {},
            "source": "error",
            "error": f"语音识别异常：{e}",
            "duration": round(duration, 1),
        }
    finally:
        # 临时目录整包清理（WAV 与原始录音都在里面）
        try:
            shutil.rmtree(os.path.dirname(wav_path), ignore_errors=True)
        except Exception:
            pass

    transcript = " ".join(s["text"] for s in segments).strip()
    detail = _aggregate_pronunciation(segments) if segments else {}

    if not transcript:
        reason = errors[0] if errors else "未识别到语音内容"
        return {
            "transcript": "",
            "pronunciation_detail": {},
            "source": "error",
            "error": reason,
            "duration": round(duration, 1),
        }

    return {
        "transcript": transcript,
        "pronunciation_detail": detail,
        "source": "azure",
        "error": "",
        "duration": round(duration, 1),
    }


async def speech_to_text(audio_path: str, language: str = "en-US") -> str:
    """STT：语音转文本（连续识别，长语音不会被截断）"""
    if not settings.AZURE_SPEECH_KEY:
        return ""

    duration = _wav_duration_seconds(audio_path)
    timeout_s = int(min(600, max(30, duration * 2 + 20)))
    try:
        segments, errors = await asyncio.to_thread(
            _recognize_blocking, audio_path, language, "", timeout_s, False
        )
        if not segments and errors:
            print(f"STT Error: {errors[0]}")
        return " ".join(s["text"] for s in segments).strip()
    except Exception as e:
        print(f"STT Exception: {e}")
        return ""


async def assess_pronunciation(audio_path: str, reference_text: str, language: str = "en-US") -> dict:
    """发音评估：返回音素级详细评分（连续识别 + 逐句结果聚合）"""
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    result = await transcribe_audio(
        audio_bytes,
        mime="audio/wav" if audio_path.lower().endswith(".wav") else "",
        reference_text=reference_text,
        language=language,
    )

    detail = result.get("pronunciation_detail") or {}
    if detail:
        return detail
    return {"error": result.get("error") or "未获得发音评估结果"}
