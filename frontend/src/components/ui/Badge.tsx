import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import type { Tone } from '@/constants/db'

/**
 * Each tone maps to its semantic token triple: a `-soft` background, a `-fg`
 * foreground, and the saturated colour for the ring and dot.
 *
 * The old implementation hardcoded `rgb(240 253 250)` / `#047857` for success,
 * warning and danger, so those badges kept their light-mode tint on every dark
 * theme. Going through tokens is what makes them adapt.
 */
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-muted ring-line',
  info: 'bg-info-soft text-info-fg ring-info/30',
  success: 'bg-success-soft text-success-fg ring-success/30',
  warning: 'bg-warning-soft text-warning-fg ring-warning/30',
  danger: 'bg-error-soft text-error-fg ring-error/30',
}

const DOTS: Record<Tone, string> = {
  neutral: 'bg-faint',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-error',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  dot,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOTS[tone])} />
      )}
      {children}
    </span>
  )
}
