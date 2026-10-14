/**
 * 录音能力探测（2026-10-14 新增）
 *
 * ── 背景 ────────────────────────────────────────────────────────────────
 * 线上长期以 `http://60.205.233.226`（裸 IP + 明文 HTTP）提供服务，属于
 * **非安全上下文（insecure context）**。浏览器的安全模型规定：麦克风属于
 * 「高权限特性（powerful feature）」，仅允许在安全上下文（HTTPS 或
 * localhost / 127.0.0.1）下使用。此时真机实测结果：
 *
 *   window.isSecureContext                            === false
 *   navigator.mediaDevices                            === undefined   ← 完全不存在
 *   navigator.mediaDevices.getUserMedia               === undefined
 *   permissions.query({name:'microphone'}).state      === 'denied'    ← 且不弹授权框
 *   点击录音后 Web Speech API 事件链                   start-called → error(not-allowed) → end
 *
 * ── 关键结论（踩坑）────────────────────────────────────────────────────
 * `window.webkitSpeechRecognition` 在 HTTP 下**依然存在**（返回 function），
 * Chromium 并未做「引擎级移除」。因此**「构造函数是否存在」不能作为可用性判据**——
 * 用它判断会误判为「支持实时识别」，从而进入录音态却永远拿不到音频，界面停在
 * 「正在录音并实时转写…」的假状态，学生只会看到一个不弹授权框的麦克风按钮，
 * 最终反馈为「麦克风权限没有打开」。
 *
 * 正确判据：`window.isSecureContext && !!navigator.mediaDevices`。
 *
 * ── 适用范围 ───────────────────────────────────────────────────────────
 * HTTPS 是硬前提：`getUserMedia`、Web Speech API 采集、Azure Speech SDK 采集
 * 三者全部要求安全上下文。不做 HTTPS，任何录音方案都无解。
 */

export type MicBlockReason = 'insecure-context' | 'no-media-devices' | 'no-speech-recognition'

export interface MicCapability {
  /** 是否处于安全上下文（HTTPS / localhost / 127.0.0.1） */
  secureContext: boolean
  /** 当前是否具备麦克风采集能力（安全上下文 + mediaDevices 存在） */
  canCapture: boolean
  /** 是否支持浏览器实时转写（Web Speech API） */
  canLiveTranscribe: boolean
  /** 不可用原因；可用时为 null */
  reason: MicBlockReason | null
  /** 面向学生的、准确的原因说明 */
  message: string
  /** 录音按钮下方的状态提示 */
  hint: string
  /** 转写区标题 */
  transcriptLabel: string
}

const INSECURE_MESSAGE =
  '当前站点以 HTTP 明文连接访问，浏览器的安全策略禁止调用麦克风，因此不会弹出授权提示。' +
  '这属于浏览器的强制规定，与您的设备或浏览器设置无关。请联系教师获取 HTTPS 访问地址；' +
  '在此之前，可直接在下方输入您口述的内容完成评分。'

const NO_MEDIA_DEVICES_MESSAGE =
  '当前浏览器未提供麦克风采集接口（navigator.mediaDevices 不存在）。' +
  '请改用较新版本的 Chrome 或 Edge，或直接在下方输入口述内容完成评分。'

const NO_SR_MESSAGE =
  '当前浏览器不支持实时语音识别，可直接在下方输入您口述的英文内容完成评分。'

export function detectMicCapability(): MicCapability {
  if (typeof window === 'undefined') {
    return {
      secureContext: false,
      canCapture: false,
      canLiveTranscribe: false,
      reason: 'insecure-context',
      message: INSECURE_MESSAGE,
      hint: '录音不可用，请手动输入口述内容',
      transcriptLabel: '转写文本（请输入你刚才口述的内容）',
    }
  }

  const secureContext = !!window.isSecureContext
  const hasMediaDevices = !!navigator?.mediaDevices
  const canCapture = secureContext && hasMediaDevices

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  // 注意：非安全上下文下该构造函数仍可能存在，故必须与 canCapture 同时成立才算可用
  const canLiveTranscribe = canCapture && !!SR

  let reason: MicBlockReason | null = null
  let message = ''
  if (!secureContext) {
    reason = 'insecure-context'
    message = INSECURE_MESSAGE
  } else if (!hasMediaDevices) {
    reason = 'no-media-devices'
    message = NO_MEDIA_DEVICES_MESSAGE
  } else if (!SR) {
    reason = 'no-speech-recognition'
    message = NO_SR_MESSAGE
  }

  return {
    secureContext,
    canCapture,
    canLiveTranscribe,
    reason,
    message,
    hint: !canCapture
      ? '录音不可用：请手动输入口述内容'
      : canLiveTranscribe
        ? '正在录音并实时转写...'
        : '正在录音（请同时记录你的口述内容）',
    transcriptLabel: canLiveTranscribe
      ? '实时转写（AI 评分将基于以下真实内容）'
      : '转写文本（请输入你刚才口述的内容）',
  }
}
