import { useEffect, useRef, useState, useCallback } from 'react'
import { profileApi } from '../api/client'

/**
 * 练习时长埋点 Hook（修复兰天童 2026-10-10 反馈）
 *
 * 口径：一次练习 = 组件挂载后调用 start，卸载或显式 finish 时调用 end。
 * 时长由本地计时器计算（秒），后端做 0~4 小时钳制。
 *
 * 设计要点：
 * 1. 用 ref 保存 sessionId，避免组件卸载后 state 已失效
 * 2. 卸载时用 keepalive 语义尽力上报；失败静默，绝不阻塞页面切换
 * 3. enabled=false 时完全不发请求，便于按条件启用（如未开始练习不计时）
 *
 * @param module 模块标识：listening / speaking / reading / writing / vocabulary / translation
 * @param subType 细分场景，如 speaking 下的 daily / critical
 * @param enabled 是否启用计时（默认 true）
 */
export function usePracticeTimer(module: string, subType: string = '', enabled: boolean = true) {
  const [elapsed, setElapsed] = useState(0)
  const sessionIdRef = useRef<string>('')
  const startAtRef = useRef<number>(0)
  const finishedRef = useRef<boolean>(false)
  const moduleRef = useRef(module)
  const subTypeRef = useRef(subType)

  moduleRef.current = module
  subTypeRef.current = subType

  // 开始计时
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    startAtRef.current = Date.now()
    finishedRef.current = false
    setElapsed(0)

    profileApi
      .practiceStart(module, subType)
      .then((res: any) => {
        if (cancelled) return
        if (res && res.session_id) sessionIdRef.current = res.session_id
      })
      .catch(() => {
        /* 埋点失败不影响练习 */
      })

    const t = setInterval(() => {
      if (startAtRef.current) {
        setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000))
      }
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(t)
      // 卸载时上报：用 ref 取最新值，state 此时已不可靠
      if (!finishedRef.current) {
        const dur = startAtRef.current
          ? Math.floor((Date.now() - startAtRef.current) / 1000)
          : 0
        if (dur > 0 || sessionIdRef.current) {
          profileApi
            .practiceEnd({
              session_id: sessionIdRef.current,
              module: moduleRef.current,
              sub_type: subTypeRef.current,
              duration: dur,
            })
            .catch(() => {
              /* 静默 */
            })
        }
      }
    }
  }, [module, subType, enabled])

  /** 显式结束计时（如点击「完成练习」），返回本次秒数。之后卸载不再重复上报 */
  const finish = useCallback(async (): Promise<number> => {
    if (finishedRef.current) return elapsed
    finishedRef.current = true
    const dur = startAtRef.current
      ? Math.floor((Date.now() - startAtRef.current) / 1000)
      : 0
    try {
      const res: any = await profileApi.practiceEnd({
        session_id: sessionIdRef.current,
        module: moduleRef.current,
        sub_type: subTypeRef.current,
        duration: dur,
      })
      return res?.duration ?? dur
    } catch {
      return dur
    }
  }, [elapsed])

  /** 当前已计时的秒数（响应式） */
  return { elapsed, finish, sessionId: sessionIdRef.current }
}

/** 秒 → 「X 分 Y 秒」/「Y 秒」/「X 小时 Y 分」（中文友好展示） */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  if (m < 60) {
    const rest = s % 60
    return rest ? `${m} 分 ${rest} 秒` : `${m} 分钟`
  }
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} 小时 ${rm} 分` : `${h} 小时`
}

/** 秒 → mm:ss（计时器显示用） */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** ISO 时间 → 「MM-DD HH:mm」 */
export function formatDateTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
    if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ')
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}
