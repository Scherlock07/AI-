/**
 * 轻量使用数据埋点追踪器
 *
 * 设计原则：
 * - 无感采集：只记录"哪个模块被访问、停留多久、用了哪些AI功能"，不记录输入内容
 * - 低开销：本地缓冲，15秒或页面隐藏时批量上报（最多50条/次）
 * - 可靠退出：页面关闭时用 navigator.sendBeacon 保底发送
 * - 仅登录用户上报（匿名访问不上传）
 *
 * 事件类型：
 * - page_view        模块页面访问
 * - module_duration  模块停留时长（detail.seconds）
 * - feature_use      功能使用（如 AI 批改、AI 对话）
 */

import { getToken, analyticsApi } from '@/api/client'

interface TrackedEvent {
  event_type: string
  module: string
  action: string
  detail: Record<string, unknown>
  device: string
  client_time: string
}

const FLUSH_INTERVAL = 15_000
const MAX_BUFFER = 50

let buffer: TrackedEvent[] = []
let currentModule = ''
let moduleEnterTime = 0
let flushTimer: number | null = null

function getDevice(): string {
  if (typeof window === 'undefined') return 'unknown'
  return window.innerWidth < 768 ? 'mobile' : 'desktop'
}

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mobile|android|iphone|ipad/i.test(navigator.userAgent)
}

export function isMobile(): boolean {
  return isMobileUA() || (typeof window !== 'undefined' && window.innerWidth < 768)
}

function makeEvent(
  event_type: string,
  module: string,
  action = '',
  detail: Record<string, unknown> = {},
): TrackedEvent {
  return {
    event_type,
    module,
    action,
    detail,
    device: getDevice(),
    client_time: new Date().toISOString(),
  }
}

async function flush(useBeacon = false): Promise<void> {
  if (buffer.length === 0 || !getToken()) {
    buffer = []
    return
  }

  const events = buffer.splice(0, MAX_BUFFER)

  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // 页面即将关闭：sendBeacon 不阻塞且不依赖页面存活
    const blob = new Blob([JSON.stringify({ events })], { type: 'application/json' })
    const apiBase = import.meta.env.DEV ? `http://${window.location.hostname}:8000` : (import.meta.env.VITE_API_BASE || '')
    navigator.sendBeacon(`${apiBase}/api/analytics/track`, blob)
    return
  }

  try {
    await analyticsApi.track(events)
  } catch {
    // 上报失败静默丢弃（埋点不影响业务）
  }
}

function ensureTimer(): void {
  if (flushTimer !== null) return
  flushTimer = window.setInterval(() => flush(), FLUSH_INTERVAL)

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // 页面隐藏（切后台/锁屏）时先结算当前模块时长并上报
        settleModuleDuration()
        flush(true)
      }
    })
    window.addEventListener('pagehide', () => {
      settleModuleDuration()
      flush(true)
    })
  }
}

/** 结算当前模块停留时长（页面切换时调用） */
function settleModuleDuration(): void {
  if (currentModule && moduleEnterTime > 0) {
    const seconds = Math.round((Date.now() - moduleEnterTime) / 1000)
    // 只记录有意义的停留（>3秒，过滤掉快速切换）
    if (seconds > 3) {
      buffer.push(makeEvent('module_duration', currentModule, '', { seconds }))
    }
  }
  currentModule = ''
  moduleEnterTime = 0
}

/**
 * 路由变化时调用：自动记录模块访问与上一个模块的停留时长
 * @param pathname 例如 /listening、/writing
 */
export function trackPageView(pathname: string): void {
  if (!getToken()) return
  ensureTimer()

  settleModuleDuration()

  const moduleName = pathnameToModule(pathname)
  if (moduleName) {
    buffer.push(makeEvent('page_view', moduleName, '', { path: pathname }))
    currentModule = moduleName
    moduleEnterTime = Date.now()
    // 缓冲过满时立即上报
    if (buffer.length >= MAX_BUFFER) flush()
  }
}

/** 手动记录功能使用（如 AI 批改、单词查询） */
export function trackFeatureUse(module: string, action: string, detail: Record<string, unknown> = {}): void {
  if (!getToken()) return
  ensureTimer()
  buffer.push(makeEvent('feature_use', module, action, detail))
  if (buffer.length >= MAX_BUFFER) flush()
}

const MODULE_MAP: Record<string, string> = {
  '/': 'dashboard',
  '/listening': 'listening',
  '/speaking': 'speaking',
  '/reading': 'reading',
  '/writing': 'writing',
  '/vocabulary': 'vocabulary',
  '/translation': 'translation',
  '/community': 'community',
  '/teacher': 'teacher',
  '/profile': 'profile',
}

function pathnameToModule(pathname: string): string {
  if (!pathname) return ''
  return MODULE_MAP[pathname] || MODULE_MAP['/' + pathname.split('/')[1]] || ''
}
