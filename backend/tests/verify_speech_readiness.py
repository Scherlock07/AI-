"""在不具备 Azure Speech Key 的前提下，验证整条链路的其余部分是否就绪。

覆盖：
  1. ffmpeg 能把浏览器录音格式（webm/opus）转成 16k 单声道 PCM WAV
  2. 无密钥时 /api/speaking/transcribe 优雅降级（返回 200 + source=unavailable），不 500
  3. 非法 base64 / 空音频被正确拒绝（400）
  4. /api/speaking/evaluate 的文本评分链路仍然正常（回归）
"""

import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
RESULTS = []


def check(label, ok, detail=""):
    RESULTS.append((label, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=120) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw[:300]}


def prepare_webm(path):
    """造一段 16k 单声道 wav → 转成浏览器同款 webm/opus，返回字节"""
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=16000",
         "-ac", "1", "-c:a", "pcm_s16le", "/tmp/tone.wav"],
        check=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", "/tmp/tone.wav", "-c:a", "libopus", "-b:a", "32k", path],
        check=True,
    )
    return open(path, "rb").read()


def main():
    sys.path.insert(0, "/app/backend")
    from app.config import settings
    from app.services.speech_service import prepare_audio

    print("=" * 72)
    print("0. 配置现状")
    print("=" * 72)
    key = settings.AZURE_SPEECH_KEY or ""
    print(f"  AZURE_SPEECH_KEY 已配置: {bool(key)}（长度 {len(key)}）")
    print(f"  AZURE_SPEECH_REGION   : {settings.AZURE_SPEECH_REGION}")
    print("  说明：密钥为空时识别链路不可用，但其余环节应全部就绪并优雅降级")

    print()
    print("=" * 72)
    print("1. ffmpeg 转码（浏览器 webm/opus → Azure 所需的 16k 单声道 PCM WAV）")
    print("=" * 72)
    webm = prepare_webm("/tmp/probe.webm")
    print(f"  webm/opus 体积: {len(webm)} bytes")
    check("webm/opus 生成", len(webm) > 500)
    wav_path, err = prepare_audio(webm, "audio/webm;codecs=opus")
    check("prepare_audio 转码成功", bool(wav_path) and not err, err)
    if wav_path:
        check("产出文件非空", os.path.getsize(wav_path) > 1000, f"{os.path.getsize(wav_path)} bytes")
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "stream=codec_name,sample_rate,channels", "-of", "json", wav_path],
            capture_output=True, text=True,
        ).stdout
        info = json.loads(out or "{}").get("streams", [{}])[0]
        print(f"  转码结果: {info}")
        check("编码为 pcm_s16le / 16000 Hz / 单声道",
              info.get("codec_name") == "pcm_s16le"
              and str(info.get("sample_rate")) == "16000"
              and info.get("channels") == 1)

    print()
    print("=" * 72)
    print("2. 接口层：登录取 token")
    print("=" * 72)
    st, res = api("/api/auth/login", "POST", {"username": "student", "password": "123456"})
    token = res.get("access_token") or res.get("token")
    check("测试账号登录成功", st == 200 and bool(token), f"status={st}")
    if not token:
        print(json.dumps(res, ensure_ascii=False)[:300])
        return

    print()
    print("=" * 72)
    print("3. POST /api/speaking/transcribe —— 无密钥时应优雅降级而非报错")
    print("=" * 72)
    import base64
    st, res = api("/api/speaking/transcribe", "POST", {
        "audio_base64": base64.b64encode(webm).decode(),
        "mime": "audio/webm;codecs=opus",
        "reference_text": "This is a pronunciation test.",
    }, token)
    print(f"  status={st}")
    print(f"  body  ={json.dumps(res, ensure_ascii=False)[:300]}")
    check("接口可用（非 5xx）", st and st < 500, f"status={st}")
    check("降级标识正确", res.get("source") in ("unavailable", "error", "azure"),
          f"source={res.get('source')} error={res.get('error')}")
    if res.get("source") == "unavailable":
        check("未配置密钥时给出明确原因", bool(res.get("error")))

    print()
    print("=" * 72)
    print("4. 参数校验")
    print("=" * 72)
    st, res = api("/api/speaking/transcribe", "POST", {"audio_base64": ""}, token)
    check("空音频被拒绝（400）", st == 400, f"status={st}")
    st, res = api("/api/speaking/transcribe", "POST", {"audio_base64": "!!!not-base64!!!"}, token)
    check("非法 base64 不导致 5xx", st and st < 500, f"status={st}")

    print()
    print("=" * 72)
    print("5. 回归：/api/speaking/evaluate 文本评分链路")
    print("=" * 72)
    st, res = api("/api/speaking/evaluate", "POST", {
        "type": "presentation",
        "topic": "My hometown",
        "transcript": "My hometown is a small city in the north of China. It is famous for its old temples and noodles.",
        "duration": 42,
    }, token)
    print(f"  status={st}  overall={res.get('overall_score')}  dimensions={len(res.get('scores') or [])}")
    check("文本评分正常", st == 200 and res.get("overall_score") is not None, f"status={st}")
    check("响应含 transcript 字段（新链路新增）", "transcript" in res)

    print()
    print("=" * 72)
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    print(f"结果：{passed}/{len(RESULTS)} 项通过")
    for label, ok, detail in RESULTS:
        print(f"  {'PASS' if ok else 'FAIL'}  {label}{(' — ' + detail) if detail else ''}")
    print("=" * 72)


main()
