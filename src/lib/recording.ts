/**
 * 录音能力探测（2026-10-14 建立，2026-10-15 随采集方案改造更新）
 *
 * ── 判据（唯一正确写法）────────────────────────────────────────────────
 *   const ok = window.isSecureContext && !!navigator.mediaDevices
 *
 * ⚠️ 反面教材：**不能用「构造函数是否存在」判断可用性**。
 * `window.webkitSpeechRecognition` 在 HTTP 下**依然存在**（返回 function），
 * Chromium 并未做引擎级移除。用它判断会误判为"支持实时识别"，于是界面进入录音态
 * 却永远拿不到音频，停在「正在录音并实时转写…」的假状态 —— 学生只会看到一个
 * 不弹授权框的麦克风按钮，最终反馈为「麦克风权限没有打开」。
 *
 * ── 2026-10-15 采集方案变更 ────────────────────────────────────────────
 * 录音采集已从 Web Speech API 改为 `getUserMedia + MediaRecorder`，音频上传自有
 * 后端走平台的 Azure Speech 做转写与发音评估。因此：
 *   · `canCapture`   —— 决定录音能不能用（只看安全上下文 + mediaDevices）
 *   · `canLivePreview` —— 仅决定录音过程中能否顺带显示浏览器实时预览文字
 * 浏览器识别**不再是必需项**：Chrome 的识别后端（Google）在国内连不通，
 * 若把它当成前置条件，就会退化成"只有 Edge 能用"。
 */

export type MicBlockReason = 'insecure-context' | 'no-media-devices' | 'no-recorder'

export interface MicCapability {
  /** 是否处于安全上下文（HTTPS / localhost / 127.0.0.1） */
  secureContext: boolean
  /** 是否具备录音采集能力（安全上下文 + mediaDevices + MediaRecorder） */
  canCapture: boolean
  /** 录音过程中能否顺带显示浏览器实时预览（可选项，非必需） */
  canLivePreview: boolean
  /** 不可用原因；可用时为 null */
  reason: MicBlockReason | null
  /** 面向学生的、准确的原因说明 */
  message: string
  /** 录音按钮下方的状态提示 */
  hint: string
  /** 录音中的文案 */
  recordingHint: string
  /** 转写区标题 */
  transcriptLabel: string
}

const INSECURE_MESSAGE =
  '当前站点以 HTTP 明文连接访问，浏览器的安全策略禁止调用麦克风，因此不会弹出授权提示。' +
  '这属于浏览器的强制规定，与您的设备或浏览器设置无关。请联系教师获取 HTTPS 访问地址；' +
  '在此之前，可直接在下方输入您口述的内容完成评分。'

const NO_MEDIA_DEVICES_MESSAGE =
  '当前浏览器未提供麦克风采集接口（navigator.mediaDevices 不存在）。' +
  '请改用较新版本的 Chrome / Edge / Safari，或直接在下方输入口述内容完成评分。'

const NO_RECORDER_MESSAGE =
  '当前浏览器不支持音频录制（MediaRecorder 不可用）。' +
  '请改用较新版本的 Chrome / Edge / Safari，或直接在下方输入口述内容完成评分。'

export function detectMicCapability(): MicCapability {
  if (typeof window === 'undefined') {
    return {
      secureContext: false,
      canCapture: false,
      canLivePreview: false,
      reason: 'insecure-context',
      message: INSECURE_MESSAGE,
      hint: '录音不可用，请手动输入口述内容',
      recordingHint: '',
      transcriptLabel: '转写文本（请输入你刚才口述的内容）',
    }
  }

  const secureContext = !!window.isSecureContext
  const hasMediaDevices = !!navigator?.mediaDevices
  const hasGetUserMedia = typeof navigator?.mediaDevices?.getUserMedia === 'function'
  const hasRecorder = typeof (window as any).MediaRecorder !== 'undefined'
  const canCapture = secureContext && hasMediaDevices && hasGetUserMedia && hasRecorder

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  // 仅作为录音时的实时预览增益，不可作为可用性前置条件
  const canLivePreview = canCapture && !!SR

  let reason: MicBlockReason | null = null
  let message = ''
  if (!secureContext) {
    reason = 'insecure-context'
    message = INSECURE_MESSAGE
  } else if (!hasMediaDevices || !hasGetUserMedia) {
    reason = 'no-media-devices'
    message = NO_MEDIA_DEVICES_MESSAGE
  } else if (!hasRecorder) {
    reason = 'no-recorder'
    message = NO_RECORDER_MESSAGE
  }

  return {
    secureContext,
    canCapture,
    canLivePreview,
    reason,
    message,
    hint: canCapture ? '点击开始录音' : '录音功能当前不可用，请手动输入',
    recordingHint: canLivePreview
      ? '正在录音，文字将实时预览，停止后自动转写'
      : '正在录音，停止后自动转写为文本',
    transcriptLabel: canLivePreview
      ? '转写文本（录音中实时预览，可修改后提交）'
      : '转写文本（录音停止后自动生成，可修改后提交）',
  }
}
