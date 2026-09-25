import { cn } from '@/lib/cn'
import type { Tone } from '@/constants/db'

/** Fill colour per tone, from theme tokens rather than fixed Tailwind palette. */
const BAR: Record<Tone, string> = {
  neutral: 'bg-border-default',
  info: 'bg-brand-500',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-error',
}

export function ProgressBar({
  value,
  tone = 'info',
  className,
  animated,
  label,
}: {
  value: number
  tone?: Tone
  className?: string
  /** Overlays a moving highlight to signal an in-flight job. */
  animated?: boolean
  /** Accessible name, e.g. "Copy progress for orders". */
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-surface-hover',
        className,
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out-soft',
          BAR[tone],
          // A travelling highlight rather than `animate-pulse`. Pulsing faded
          // the whole bar in and out, which made the tone colour ambiguous and
          // the remaining progress hard to read at a glance.
          animated && 'dm-progress-active',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
