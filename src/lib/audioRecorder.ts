/**
 * 浏览器录音采集（MediaRecorder 封装）—— 2026-10-15 新增
 *
 * ── 为什么不再用浏览器内置语音识别 ──────────────────────────────────────
 * 原实现走 `webkitSpeechRecognition`（Web Speech API）。它的识别**不在浏览器本地**，
 * 而是把音频上传给浏览器厂商的云服务：
 *   · Chrome  → Google（speech.googleapis.com）
 *   · Edge    → Microsoft（api.speech.microsoft.com）
 * 实测国内本机：`www.google.com` / `speech.googleapis.com` 均超时（curl 000），
 * `api.speech.microsoft.com` 返回 200。也就是说——**同一份代码，Chrome 用不了、
 * Edge 能用**，平台自身完全无法控制。这正是"换个浏览器就好了"却始终查不出
 * "平台有什么问题"的根源。
 *
 * 现方案：浏览器只做采集（getUserMedia + MediaRecorder），音频上传到**自有后端**，
 * 由平台自己的 Azure Speech 资源完成转写与音素级发音评估。识别质量与可用性重新
 * 回到平台手里，且不再受浏览器厂商服务可达性影响。
 *
 * ── 前提 ────────────────────────────────────────────────────────────────
 * `getUserMedia` 属于 powerful feature，**必须处于安全上下文**（HTTPS 或
 * localhost）。线上已通过 nginx + Let's Encrypt IP 证书提供 HTTPS。
 */

/** 浏览器录音结果 */
export interface RecordedAudio {
  /** 纯 base64（不含 dataURL 前缀），可直接放 JSON */
  base64: string
  /** 容器类型，如 audio/webm;codecs=opus —— 后端据此选择转码策略 */
  mime: string
  /** 字节数 */
  bytes: number
  /** 实际录音毫秒数 */
  durationMs: number
}

// 按优先级探测容器：Opus 在同等音质下体积最小，长录音优势明显
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4', // Safari 只认这个
]

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (typeof MediaRecorder.isTypeSupported !== 'function') return ''
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

/** 当前环境是否具备录音能力（安全上下文 + mediaDevices + MediaRecorder） */
export function isRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    !!window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * 把 Blob 转成纯 base64。
 * 刻意剥离 `data:...;base64,` 前缀：后端统一按裸 base64 解码，
 * 保留前缀会让 base64.b64decode 解出脏数据（静默产生坏音频）。
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('音频读取失败'))
    reader.readAsDataURL(blob)
  })
}

/** 面向学生的、可读的麦克风错误文案 */
export function describeMicError(err: any): string {
  const name = err?.name || ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '麦克风权限被拒绝。请在浏览器地址栏左侧的图标中允许麦克风访问后重试。'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '未检测到麦克风设备，请确认耳机或麦克风已正确连接。'
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风被其他程序占用（如会议软件、录音软件），请关闭后重试。'
    case 'OverconstrainedError':
      return '当前麦克风不支持所需的录音参数，请更换设备后重试。'
    case 'AbortError':
      return '录音启动被中断，请重试。'
    default:
      return err?.message ? `录音失败：${err.message}` : '录音启动失败，请重试。'
  }
}

/**
 * 一次录音会话。
 * 用法：`await rec.start()` → 用户说话 → `await rec.stop()` 拿到音频；
 * 异常或中途放弃时调用 `rec.cancel()` 释放麦克风。
 */
export class AudioRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private mime = ''

  get isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  async start(): Promise<void> {
    if (!isRecorderSupported()) {
      throw new Error('当前访问方式不支持录音（需要 HTTPS 安全连接）')
    }
    if (this.recorder) this.cancel()

    // 语音练习场景下的三项处理能明显提升识别率：
    // 回声消除去掉外放的声音、噪声抑制压掉环境底噪、自动增益平衡音量
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    this.mime = pickMimeType()
    this.chunks = []
    this.recorder = this.mime
      ? new MediaRecorder(this.stream, { mimeType: this.mime })
      : new MediaRecorder(this.stream)
    if (!this.mime) this.mime = this.recorder.mimeType || 'audio/webm'

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.startedAt = Date.now()
    // 每秒切片：长录音不会把整段音频攒在一个大 Blob 里，停止时也更跟手
    this.recorder.start(1000)
  }

  async stop(): Promise<RecordedAudio> {
    const rec = this.recorder
    if (!rec) throw new Error('尚未开始录音')

    const durationMs = Date.now() - this.startedAt
    const type = this.mime || 'audio/webm'

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type }))
      try {
        rec.stop()
      } catch {
        resolve(new Blob(this.chunks, { type }))
      }
    })

    this.release()
    const base64 = await blobToBase64(blob)
    return { base64, mime: blob.type || type, bytes: blob.size, durationMs }
  }

  /** 放弃本次录音并释放麦克风（不会产出音频） */
  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.onstop = null
        this.recorder.stop()
      }
    } catch {}
    this.release()
  }

  private release(): void {
    // 必须显式停掉音轨 —— 否则浏览器标签页会一直显示"正在录音"，麦克风指示灯不灭
    try {
      this.stream?.getTracks().forEach((t) => t.stop())
    } catch {}
    this.stream = null
    this.recorder = null
    this.chunks = []
  }
}
