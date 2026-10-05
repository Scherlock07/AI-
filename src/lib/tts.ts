/**
 * 浏览器 Web Speech API 文本转语音工具
 * 当后端 Azure Speech Key 未配置时，使用浏览器内置 TTS 作为降级方案
 */

let currentUtterance: SpeechSynthesisUtterance | null = null

export interface TTSOptions {
  text: string
  lang?: string // e.g. 'en-US', 'en-GB', 'en-AU'
  rate?: number // 0.1 - 10, default 1
  pitch?: number // 0 - 2, default 1
  volume?: number // 0 - 1, default 1
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: string) => void
}

/**
 * 使用浏览器内置 TTS 播放文本
 * 返回 true 表示成功开始播放，false 表示不支持
 */
export function speak(options: TTSOptions): boolean {
  const { text, lang = 'en-US', rate = 1, pitch = 1, volume = 1, onStart, onEnd, onError } = options

  if (!('speechSynthesis' in window)) {
    onError?.('当前浏览器不支持语音合成')
    return false
  }

  // 停止之前的播放
  stop()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = rate
  utterance.pitch = pitch
  utterance.volume = volume

  // 尝试选择匹配的语音
  const voices = window.speechSynthesis.getVoices()
  const matchedVoice = voices.find(v => v.lang === lang)
  if (matchedVoice) {
    utterance.voice = matchedVoice
  }

  utterance.onstart = () => onStart?.()
  utterance.onend = () => {
    currentUtterance = null
    onEnd?.()
  }
  utterance.onerror = (e) => {
    currentUtterance = null
    onError?.(e.error || '语音合成失败')
  }

  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
  return true
}

/**
 * 停止当前播放
 */
export function stop() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    currentUtterance = null
    dialogueToken++ // 同时终止对话队列
  }
}

/**
 * 暂停播放
 */
export function pause() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.pause()
  }
}

/**
 * 恢复播放
 */
export function resume() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.resume()
  }
}

/**
 * 是否正在播放
 */
export function isSpeaking(): boolean {
  return 'speechSynthesis' in window && window.speechSynthesis.speaking
}

/**
 * 获取可用语音列表
 */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices()
}

/**
 * 根据口音代码获取语言代码
 */
export function accentToLang(accent: string): string {
  const map: Record<string, string> = {
    us: 'en-US',
    uk: 'en-GB',
    au: 'en-AU',
  }
  return map[accent] || 'en-US'
}

// ========== 听力素材对话播放（多音色 + 剥离称谓 + 停顿） ==========

let dialogueToken = 0

const SPEAKER_LABEL_RE = /^([A-Z][A-Za-z .'-]{0,24}):\s*(.+)$/

/** 剥离文本中的说话人称谓（如 "Host:"、"Dr. Chen:"），返回纯台词 */
export function stripSpeakerLabels(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const m = line.trim().match(SPEAKER_LABEL_RE)
      return m ? m[2] : line
    })
    .join('\n')
}

export interface DialogueTTSOptions {
  text: string
  lang?: string
  rate?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: string) => void
}

/**
 * 播放听力素材：
 * - 含多个说话人标签（Host: / Dr. Chen: 等）时自动剥离标签并为不同说话人分配不同音色
 * - 独白按句播放，句间插入短停顿，更符合听力考试节奏
 */
export function speakDialogue(options: DialogueTTSOptions): boolean {
  const { text, lang = 'en-US', rate = 1, volume = 1, onStart, onEnd, onError } = options

  if (!('speechSynthesis' in window)) {
    onError?.('当前浏览器不支持语音合成')
    return false
  }
  stop() // 会 cancel 并使旧队列失效
  const token = dialogueToken

  // 1. 解析说话人
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const turns: { speaker: string; content: string }[] = []
  for (const line of lines) {
    const m = line.match(SPEAKER_LABEL_RE)
    if (m) {
      turns.push({ speaker: m[1], content: m[2] })
    } else if (turns.length > 0) {
      // 无标签的续行：视为上一说话人继续说
      const prev = turns[turns.length - 1]
      prev.content += ' ' + line
    } else {
      turns.push({ speaker: '', content: line })
    }
  }

  const speakers = [...new Set(turns.map(t => t.speaker).filter(Boolean))]
  const isDialogue = speakers.length >= 2

  // 2. 为说话人分配不同音色（同语言下找不同 voice；找不到则用音调区分）
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang === lang)
  const voicePool = voices.length >= 2 ? voices : window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(lang.split('-')[0]))
  const voiceBySpeaker = new Map<string, { voice?: SpeechSynthesisVoice; pitch: number }>()
  speakers.forEach((sp, i) => {
    voiceBySpeaker.set(sp, {
      voice: voicePool.length >= 2 ? voicePool[i % voicePool.length] : undefined,
      pitch: i % 2 === 0 ? 1 : 0.85,
    })
  })
  const defaultPitch: { voice?: SpeechSynthesisVoice; pitch: number } = { pitch: 1 }

  // 3. 生成播放片段序列（turn → 句子，附说话人）
  interface Segment { text: string; speaker: string }
  const segments: Segment[] = []
  for (const t of turns) {
    if (isDialogue || !t.speaker) {
      segments.push({ text: t.content, speaker: t.speaker })
    } else {
      segments.push({ text: t.content, speaker: t.speaker })
    }
  }
  // 独白也按句切分以获得句间停顿
  const pieces: Segment[] = []
  if (isDialogue) {
    for (const s of segments) {
      s.text.match(/[^.!?\n]+[.!?]*/g)?.forEach(chunk => {
        const c = chunk.trim()
        if (c) pieces.push({ text: c, speaker: s.speaker })
      })
    }
  } else {
    const plain = stripSpeakerLabels(text)
    plain.match(/[^.!?\n]+[.!?]*/g)?.forEach(chunk => {
      const c = chunk.trim()
      if (c) pieces.push({ text: c, speaker: '' })
    })
  }
  const finalPieces = pieces.length > 0 ? pieces : [{ text: stripSpeakerLabels(text), speaker: '' }]

  // 4. 顺序播放
  let idx = 0
  let started = false
  const playNext = () => {
    if (token !== dialogueToken) return // 已被 stop/新播放取代
    if (idx >= finalPieces.length) {
      onEnd?.()
      return
    }
    const seg = finalPieces[idx]
    const voiceConf = (isDialogue && seg.speaker && voiceBySpeaker.get(seg.speaker)) || defaultPitch
    const u = new SpeechSynthesisUtterance(seg.text)
    u.lang = lang
    u.rate = rate
    u.volume = volume
    u.pitch = voiceConf.pitch
    if (voiceConf.voice) u.voice = voiceConf.voice
    u.onstart = () => { if (!started) { started = true; onStart?.() } }
    u.onend = () => {
      if (token !== dialogueToken) return
      idx++
      // 句间短停顿；说话人切换时停顿更长
      const pause = isDialogue && idx < finalPieces.length && finalPieces[idx].speaker !== seg.speaker ? 550 : 300
      setTimeout(playNext, pause)
    }
    u.onerror = (e) => {
      if (token !== dialogueToken) return
      onError?.(e.error || '语音合成失败')
    }
    window.speechSynthesis.speak(u)
  }
  playNext()
  return true
}
