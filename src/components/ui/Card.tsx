import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hover?: boolean
  style?: React.CSSProperties
}

export function Card({ children, className, onClick, hover, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        'bg-white rounded-2xl border border-gray-100/80 shadow-sm shadow-gray-100',
        hover && 'transition-all duration-200 hover:shadow-lg hover:shadow-gray-200/50 hover:border-indigo-200/50 hover:-translate-y-0.5 cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 sm:px-6 pt-4 sm:pt-5 pb-3', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-lg font-semibold text-gray-900', className)}>{children}</h3>
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 sm:px-6 pb-4 sm:pb-5', className)}>{children}</div>
}
