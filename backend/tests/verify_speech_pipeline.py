"""录音链路真机验证（在容器内运行）

验证三件事：
  1. ffmpeg 能把「浏览器录音格式」(webm/opus) 转成 Azure 可用的 16k 单声道 PCM WAV
  2. 转写文本与源文本一致（转写链路通）
  3. 音素级发音评估能出分（`assess_pronunciation` 上线以来 0 次产出的问题已解决）
  4. 中间有长停顿时，两句话都能被识别（证明 recognize_once 只识别第一句的截断缺陷已修）
"""

import asyncio
import os
import subprocess
import sys

sys.path.insert(0, "/app/backend")
from app.services.speech_service import text_to_speech, transcribe_audio  # noqa: E402

SENT_A = "My name is Li Ming and I study German at the university."
SENT_B = "Last summer I travelled to Berlin with three classmates."
PAUSE_SECONDS = 1.6  # 明显超过默认的句间静音切分阈值，用于复现"只识别第一句"

RESULTS = []


def check(label, ok, detail=""):
    RESULTS.append((label, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")


def to_webm(wav_path, webm_path):
    """模拟浏览器 MediaRecorder 的输出：Opus 32kbps（约 4 KB/秒）"""
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", wav_path, "-c:a", "libopus", "-b:a", "32k", webm_path],
        check=True,
    )
    return open(webm_path, "rb").read()


async def tts(text, path):
    out = await text_to_speech(text, "us", 1.0, path)
    return out if out and os.path.exists(out) else ""


async def main():
    print("=" * 70)
    print("测试 1：单句 —— 转码 + 转写 + 音素级发音评估")
    print("=" * 70)

    wav_a = await tts(SENT_A, "/tmp/va.wav")
    check("Azure TTS 生成参考音频", bool(wav_a), f"{os.path.getsize(wav_a) if wav_a else 0} bytes")
    if not wav_a:
        return

    webm = to_webm(wav_a, "/tmp/va.webm")
    print(f"  webm/opus 体积：{len(webm)} bytes（模拟浏览器录音）")
    check("wav → webm/opus 转码", len(webm) > 1000)

    res = await transcribe_audio(webm, mime="audio/webm;codecs=opus", reference_text=SENT_A)
    print(f"  transcript : {res['transcript']}")
    print(f"  source     : {res['source']}  error: {res['error'] or '(无)'}  duration: {res['duration']}s")

    check("【核心】webm/opus 被正确转码并识别", bool(res["transcript"]), res["error"] or "")
    if res["transcript"]:
        src_words = {w.lower().strip(".,") for w in SENT_A.split()}
        got_words = {w.lower().strip(".,") for w in res["transcript"].split()}
        hit = len(src_words & got_words)
        check("转写命中率 ≥ 80%", hit / len(src_words) >= 0.8, f"{hit}/{len(src_words)}")

    pd = res["pronunciation_detail"] or {}
    scores = {k: pd.get(k) for k in
              ("overall_score", "accuracy_score", "fluency_score", "completeness_score", "prosody_score")}
    print(f"  发音评估   : {scores}")
    check("【核心】音素级发音评估有产出", bool(pd.get("overall_score")), f"keys={sorted(pd.keys())}")
    words = pd.get("words") or []
    if words:
        first = words[0]
        print(f"  首个单词   : {first.get('Word')} "
              f"accuracy={first.get('PronunciationAssessment', {}).get('AccuracyScore')} "
              f"phonemes={[p.get('Phoneme') for p in (first.get('Phonemes') or [])]}")
    check("逐词/逐音素明细存在", bool(words and words[0].get("Phonemes")), f"{len(words)} words")

    print()
    print("=" * 70)
    print(f"测试 2：长停顿多句 —— 验证不再只识别第一句（间隔 {PAUSE_SECONDS}s）")
    print("=" * 70)

    wav_b = await tts(SENT_B, "/tmp/vb.wav")
    if not wav_b:
        check("TTS 第二句", False)
        return

    # 拼接：句A + 静音 + 句B，中间的长停顿正是旧实现会被截断的位置
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-t", str(PAUSE_SECONDS), "-i", "anullsrc=r=16000:cl=mono",
         "-c:a", "pcm_s16le", "/tmp/sil.wav"],
        check=True,
    )
    with open("/tmp/concat.txt", "w") as f:
        f.write("file '/tmp/va.wav'\nfile '/tmp/sil.wav'\nfile '/tmp/vb.wav'\n")
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", "/tmp/concat.txt", "-c", "copy", "/tmp/long.wav"],
        check=True,
    )
    long_webm = to_webm("/tmp/long.wav", "/tmp/long.webm")
    print(f"  长音频 webm/opus：{len(long_webm)} bytes")

    res2 = await transcribe_audio(long_webm, mime="audio/webm;codecs=opus", reference_text="")
    print(f"  transcript : {res2['transcript']}")
    print(f"  source     : {res2['source']}  error: {res2['error'] or '(无)'}  duration: {res2['duration']}s")

    got = res2["transcript"].lower()
    has_a = "li ming" in got or "german" in got
    has_b = "berlin" in got or "classmates" in got
    check("第一句被识别", has_a)
    check("【核心】第二句也被识别（长停顿未截断）", has_b,
          "" if has_b else "仍只识别到第一句，截断缺陷未修复")

    print()
    print("=" * 70)
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    print(f"结果：{passed}/{len(RESULTS)} 项通过")
    for label, ok, detail in RESULTS:
        print(f"  {'PASS' if ok else 'FAIL'}  {label}{(' — ' + detail) if detail else ''}")
    print("=" * 70)
    sys.exit(0 if passed == len(RESULTS) else 1)


asyncio.run(main())
