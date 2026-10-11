/**
 * 每日轮换工具：以「今天是年内第几天」为种子取模，让题库/素材每天自动换一题，
 * 不消耗任何 LLM 调用；offset 用于同一页面内多个轮播位错开取值。
 */
export function dailyIndex(total: number, offset = 0): number {
  if (total <= 0) return 0
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return (dayOfYear + offset) % total
}

/** 今天的日期字符串（YYYY-MM-DD），用于显示「今日话题」的更新日期 */
export function todayLabel(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
