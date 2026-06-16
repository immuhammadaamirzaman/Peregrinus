import { cn } from '@/lib/cn'
import type { Tone } from '@/constants/db'

const BAR: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
}

export function ProgressBar({
  value,
  tone = 'info',
  className,
  animated,
}: {
  value: number
  tone?: Tone
  className?: string
  animated?: boolean
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          BAR[tone],
          animated && 'animate-pulse',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
