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
