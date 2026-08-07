import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function getScoreColor(score: number, maxScore: number = 100): string {
  const percentage = (score / maxScore) * 100
  if (percentage >= 85) return 'text-success-600'
  if (percentage >= 70) return 'text-primary-600'
  if (percentage >= 60) return 'text-warning-600'
  return 'text-danger-600'
}

export function getScoreBg(score: number, maxScore: number = 100): string {
  const percentage = (score / maxScore) * 100
  if (percentage >= 85) return 'bg-success-100 text-success-700'
  if (percentage >= 70) return 'bg-primary-100 text-primary-700'
  if (percentage >= 60) return 'bg-warning-100 text-warning-600'
  return 'bg-danger-100 text-danger-600'
}

export function getDifficultyLabel(level: string): string {
  const map: Record<string, string> = {
    beginner: '初级',
    intermediate: '中级',
    advanced: '高级',
  }
  return map[level] || level
}

export function getDifficultyColor(level: string): string {
  const map: Record<string, string> = {
    beginner: 'bg-success-100 text-success-700',
    intermediate: 'bg-warning-100 text-warning-600',
    advanced: 'bg-danger-100 text-danger-600',
  }
  return map[level] || 'bg-gray-100 text-gray-700'
}
