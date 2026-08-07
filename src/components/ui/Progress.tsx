import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  color?: 'primary' | 'success' | 'warning' | 'danger'
}

export function Progress({ value, max = 100, className, color = 'primary' }: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const colors = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  }
  return (
    <div className={cn('w-full bg-gray-100 rounded-full h-2 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', colors[color])}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
